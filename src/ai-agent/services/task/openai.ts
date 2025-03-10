import { openAIClient } from '../../core/azure-openai/client';
import { generateTaskMatchingPrompt } from '../../core/azure-openai/prompts/task-matching';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { IntervalsAPI, Task } from './intervals';
import { reviewService } from '../review/review-service';
import { ReviewMeeting } from '../review/types';
import fs from 'fs/promises';
import path from 'path';

interface TaskMatch {
    taskId: string;
    taskTitle: string;
    meetingDetails: {
        subject: string;
        startTime: string;
        endTime: string;
        actualDuration: number;
    };
    confidence: number;
    reason: string;
}

interface MatchingResult {
    meetingSubject: string;
    matchedTasks: TaskMatch[];
}

interface UserData {
    userId: string;
    email: string;
    intervalsApiKey: string;
    lastSync: string;
}

interface UserDataFile {
    users: UserData[];
    postedMeetings: string[];
}

interface MeetingAnalysis {
    summary: string;
    keyTopics: string[];
    actionItems: string[];
    decisions: string[];
    nextSteps: string[];
    sentiment: string;
    // ... any other existing properties ...
}

export class TaskService {
    private static instance: TaskService;

    private constructor() {}

    public static getInstance(): TaskService {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService();
        }
        return TaskService.instance;
    }

    private async getUserIntervalsApiKey(userId: string): Promise<string> {
        try {
            const userDataPath = path.join(process.cwd(), '.data', 'user-data.json');
            const userData = JSON.parse(await fs.readFile(userDataPath, 'utf-8')) as UserDataFile;
            
            const user = userData.users.find(u => u.userId === userId);
            if (!user?.intervalsApiKey) {
                throw new Error(`No Intervals API key found for user ${userId}`);
            }
            
            return user.intervalsApiKey;
        } catch (error) {
            console.error('Error getting Intervals API key:', error);
            throw new Error('Failed to get Intervals API key');
        }
    }

    private async fetchTasksFromIntervals(apiKey: string): Promise<Task[]> {
        const api = new IntervalsAPI(apiKey);
        return api.getTasks();
    }

    private async queueForReview(meeting: ProcessedMeeting, confidence: number, reason: string, userId: string): Promise<void> {
        // Check if the user actually attended this meeting
        let userDuration = 0;
        if (meeting.attendance?.records) {
            const userRecord = meeting.attendance.records.find(record => 
                record.email.toLowerCase() === userId.toLowerCase()
            );
            
            if (userRecord) {
                userDuration = userRecord.duration;
                console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
            } else {
                console.log(`User ${userId} did not attend meeting "${meeting.subject}". Skipping review.`);
                return; // Skip queuing for review if user didn't attend
            }
        }
        
        // Skip if user's duration is zero
        if (userDuration <= 0) {
            console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping review.`);
            return;
        }
        
        const reviewMeeting: ReviewMeeting = {
            id: meeting.id,
            userId: userId,
            subject: meeting.subject,
            startTime: meeting.start.dateTime,
            endTime: meeting.end.dateTime,
            duration: userDuration, // Use the user's actual duration
            participants: meeting.attendees?.map(a => a.email) || [],
            keyPoints: meeting.analysis?.keyPoints,
            suggestedTasks: [], // Will be populated with low confidence matches if any
            status: 'pending',
            confidence: confidence,
            reason: reason
        };

        await reviewService.queueForReview(reviewMeeting);
    }

    public async matchTasksToMeeting(meeting: ProcessedMeeting, userId: string): Promise<any> {
        try {
            // Check if the user actually attended this meeting
            let userDuration = 0;
            if (meeting.attendance?.records) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                    console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
                } else {
                    console.log(`User ${userId} did not attend meeting "${meeting.subject}". Skipping task matching.`);
                    return null; // Skip task matching if user didn't attend
                }
            }
            
            // Skip if user's duration is zero
            if (userDuration <= 0) {
                console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping task matching.`);
                return null;
            }
            
            // Get Intervals API key and fetch tasks
            const apiKey = await this.getUserIntervalsApiKey(userId);
            console.log('Fetching tasks from Intervals for user:', userId);
            const availableTasks = await this.fetchTasksFromIntervals(apiKey);
            console.log(`Found ${availableTasks.length} tasks in Intervals:`, 
                availableTasks.map(t => `\n- ${t.title} (${t.id})`).join(''));

            // Format meeting analysis data with enhanced context
            const meetingAnalysis = {
                subject: meeting.subject,
                startTime: meeting.start.dateTime,
                endTime: meeting.end.dateTime,
                duration: userDuration, // Use the user's actual duration
                analysis: {
                    keyPoints: meeting.analysis?.keyPoints || [],
                    suggestedCategories: meeting.analysis?.suggestedCategories || [],
                    confidence: meeting.analysis?.confidence || 0,
                    context: meeting.analysis?.context || {}
                },
                attendance: meeting.attendance
            };
            console.log('Meeting analysis for matching:', JSON.stringify(meetingAnalysis, null, 2));

            // Format tasks data with enhanced details
            const tasksData = availableTasks.map(task => ({
                ...task,
                matchingContext: {
                    isActive: task.status?.toLowerCase().includes('active'),
                    hasPriority: !!task.priority,
                    hasDescription: !!task.description,
                    projectContext: task.project
                }
            }));
            console.log('Tasks data for matching:', JSON.stringify(tasksData, null, 2));

            // Generate prompt and get matches from OpenAI
            const prompt = generateTaskMatchingPrompt(
                JSON.stringify(meetingAnalysis, null, 2),
                JSON.stringify(tasksData, null, 2)
            );
            console.log('Generated prompt for OpenAI:', prompt);

            const matchingResult = await openAIClient.sendRequest(prompt, {
                temperature: 0.3,
                maxTokens: 1000
            });
            console.log('OpenAI response:', matchingResult);

            // Parse the matching result
            const result = this.parseMatchingResult(matchingResult, meeting.subject);
            console.log('Parsed matching result:', JSON.stringify(result, null, 2));

            // Check if we need to queue for review
            if (!result.matchedTasks || result.matchedTasks.length === 0) {
                console.log(`No matches found for meeting: ${meeting.subject}, queueing for review`);
                await this.queueForReview(meeting, 0, 'No matching tasks found', userId);
                return null; // Return null to prevent time entry creation
            }

            // Check confidence of best match
            const bestMatch = result.matchedTasks[0];
            if (reviewService.shouldReview(bestMatch.confidence)) {
                console.log(`Low confidence match (${bestMatch.confidence}) for meeting: ${meeting.subject}, queueing for review`);
                // Convert matched tasks to suggested tasks format
                const suggestedTasks = result.matchedTasks.map(match => ({
                    id: match.taskId,
                    title: match.taskTitle,
                    project: tasksData.find(t => t.id === match.taskId)?.project || '',
                    module: tasksData.find(t => t.id === match.taskId)?.module || '',
                    confidence: match.confidence,
                    reason: match.reason
                }));

                // Queue for review with suggested tasks
                const reviewMeeting: ReviewMeeting = {
                    id: meeting.id,
                    userId: userId,
                    subject: meeting.subject,
                    startTime: meeting.start.dateTime,
                    endTime: meeting.end.dateTime,
                    duration: meetingAnalysis.duration,
                    participants: meeting.attendees?.map(a => a.email) || [],
                    keyPoints: meeting.analysis?.keyPoints,
                    suggestedTasks: suggestedTasks,
                    status: 'pending',
                    confidence: bestMatch.confidence,
                    reason: 'Low confidence match'
                };

                await reviewService.queueForReview(reviewMeeting);
                return null; // Return null to prevent time entry creation
            }

            // Only return the result if confidence is high enough
            return result;

        } catch (error) {
            console.error('Error matching tasks to meeting:', error);
            // Queue for review due to error
            await this.queueForReview(meeting, 0, 'Error during task matching', userId);
            return null; // Return null to prevent time entry creation
        }
    }

    private parseMatchingResult(result: string, meetingSubject: string): MatchingResult {
        try {
            // Find the JSON object in the response
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('No JSON found in response');
                return { meetingSubject, matchedTasks: [] };
            }

            // Parse the JSON response
            const parsed = JSON.parse(jsonMatch[0]);
            
            // Validate and transform the response
            const matchedTasks = (parsed.matchedTasks || [])
                .filter((task: Partial<TaskMatch>) => this.isValidTaskMatch(task))
                .sort((a: TaskMatch, b: TaskMatch) => b.confidence - a.confidence);

            // Debug logging
            console.log('Raw OpenAI response:', result);
            console.log('Extracted JSON:', jsonMatch[0]);
            console.log('Parsed tasks:', JSON.stringify(matchedTasks, null, 2));

            return {
                meetingSubject,
                matchedTasks
            };
        } catch (error) {
            console.error('Error parsing matching result:', error);
            console.log('Failed to parse response:', result);
            return { meetingSubject, matchedTasks: [] };
        }
    }

    private isValidTaskMatch(task: Partial<TaskMatch>): boolean {
        return !!(
            task.taskId &&
            task.taskTitle &&
            task.meetingDetails?.subject &&
            task.meetingDetails?.startTime &&
            task.meetingDetails?.endTime &&
            task.meetingDetails?.actualDuration !== undefined &&
            task.confidence &&
            task.reason
        );
    }
}

export const taskService = TaskService.getInstance(); 