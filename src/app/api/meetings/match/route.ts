import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';
import { AzureOpenAIClient } from '@/lib/azure-openai';
import { findKeywordMatches, generateMatchingPrompt } from '@/lib/matching-utils';
import type { Task } from '@/lib/types';

interface Meeting {
  subject: string;
  startTime: string;
  endTime: string;
  meetingInfo?: {
    meetingId: string;
  };
}

interface MatchResult {
  meeting: Meeting;
  matchedTask: Task | null;
  confidence: number;
  reason: string;
}

const BATCH_SIZE = 20;

async function processMeetingBatch(
  meetings: Meeting[],
  tasks: Task[],
  openai: AzureOpenAIClient,
  startIndex: number
): Promise<{ results: MatchResult[], nextIndex: number }> {
  const results: MatchResult[] = [];
  let currentIndex = startIndex;

  try {
    const batchEndIndex = Math.min(startIndex + BATCH_SIZE, meetings.length);
    console.log(`Processing batch from ${startIndex} to ${batchEndIndex} of ${meetings.length} meetings`);

    for (let i = startIndex; i < batchEndIndex; i++) {
      const meeting = meetings[i];
      currentIndex = i;
      
      try {
        // Try keyword matching first
        let bestMatch: { task: Task; confidence: number; reason: string } | null = null;

        for (const task of tasks) {
          const { matched, reason } = findKeywordMatches(meeting.subject, task);
          if (matched) {
            // If we find a better match (more specific reason), update bestMatch
            if (!bestMatch || reason.length > bestMatch.reason.length) {
              bestMatch = {
                task,
                confidence: 0.9,
                reason
              };
            }
          }
        }

        if (bestMatch) {
          results.push({
            meeting,
            matchedTask: bestMatch.task,
            confidence: bestMatch.confidence,
            reason: bestMatch.reason
          });
          continue;
        }

        // If no keyword match, try OpenAI
        console.log(`No keyword match found, trying OpenAI for: ${meeting.subject}`);
        const prompt = generateMatchingPrompt(meeting.subject, tasks);

        const response = await openai.getCompletion(prompt);
        const matchData = JSON.parse(response);

        const matchedTask = tasks.find(t => t.title === matchData.matchedTaskTitle);
        results.push({
          meeting,
          matchedTask: matchedTask || null,
          confidence: matchData.confidence,
          reason: matchData.reason
        });

      } catch (error) {
        console.error(`Failed to process meeting: ${meeting.subject}`, error);
        results.push({
          meeting,
          matchedTask: null,
          confidence: 0,
          reason: 'Failed to process meeting'
        });
      }

      // Small delay between meetings to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return { 
      results,
      nextIndex: batchEndIndex 
    };
  } catch (error) {
    console.error('Batch processing error:', error);
    return {
      results,
      nextIndex: currentIndex
    };
  }
}

function deduplicateMeetings(meetings: Meeting[]): Meeting[] {
  const seen = new Set();
  return meetings.filter(meeting => {
    // Create a unique key using meeting subject and start time
    const key = `${meeting.subject}_${meeting.startTime}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get request data
    const { meetings: rawMeetings, startIndex = 0 } = await request.json();
    
    // Deduplicate meetings before processing
    const meetings = deduplicateMeetings(rawMeetings);
    
    console.log(`Processing meetings batch starting at index ${startIndex}`);
    console.log('Number of unique meetings to process:', meetings.length);
    
    if (!Array.isArray(meetings)) {
      return NextResponse.json({ error: 'Invalid meetings data' }, { status: 400 });
    }

    // Get Intervals tasks
    const storage = new UserStorage();
    await storage.loadData();
    const apiKey = storage.getUserApiKey(session.user.email);
    if (!apiKey) {
      return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
    }

    // Get tasks directly using IntervalsAPI
    const intervalsApi = new IntervalsAPI(apiKey);
    console.log('Fetching tasks using Intervals API...');
    const tasks = await intervalsApi.getTasks();
    console.log('Available tasks for matching:', tasks.length);

    // Initialize Azure OpenAI
    const openai = new AzureOpenAIClient();

    // Process meetings in batches
    const { results, nextIndex } = await processMeetingBatch(meetings, tasks, openai, startIndex);

    // Categorize results
    const highConfidence = results.filter(r => r.confidence >= 0.8);
    const mediumConfidence = results.filter(r => r.confidence >= 0.5 && r.confidence < 0.8);
    const lowConfidence = results.filter(r => r.confidence > 0 && r.confidence < 0.5);
    const unmatched = results.filter(r => r.confidence === 0 || !r.matchedTask);

    return NextResponse.json({
      matches: {
        high: highConfidence,
        medium: mediumConfidence,
        low: lowConfidence,
        unmatched: unmatched
      },
      summary: {
        processed: results.length,
        totalMeetings: meetings.length
      },
      nextBatch: nextIndex < meetings.length ? nextIndex : null
    });

  } catch (error) {
    console.error('Error in meeting matching:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to match meetings' },
      { status: 500 }
    );
  }
} 