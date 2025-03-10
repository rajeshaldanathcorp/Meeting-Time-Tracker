# Backend API Implementation for AI Agent Dashboard

This document explains how the backend API endpoints are implemented to support the AI Agent Dashboard.

## Overview

The backend API provides several endpoints that handle:
1. Retrieving meetings from Microsoft Graph API
2. Processing meetings using AI to match them with tasks
3. Creating time entries in the Intervals time tracking system
4. Storing and retrieving posted meetings

## API Endpoints

### 1. `/api/posted-meetings`

**Purpose**: Retrieves all meetings that have been processed and posted as time entries.

**Implementation**:
```typescript
// src/app/api/posted-meetings/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    // Fetch posted meetings from database
    const postedMeetings = await prisma.postedMeeting.findMany({
      where: {
        userId: session.user.email
      },
      orderBy: {
        postedAt: 'desc'
      }
    });
    
    // Fetch unmatched meetings
    const unmatchedMeetings = await prisma.unmatchedMeeting.findMany({
      where: {
        userId: session.user.email
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return NextResponse.json({
      success: true,
      meetings: postedMeetings,
      unmatchedMeetings
    });
  } catch (error) {
    console.error('Error fetching posted meetings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch posted meetings' },
      { status: 500 }
    );
  }
}
```

### 2. `/api/test-time-entry`

**Purpose**: Processes new meetings and creates time entries.

**Implementation**:
```typescript
// src/app/api/test-time-entry/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMeetings } from '@/lib/microsoft-graph';
import { matchMeetingsToTasks } from '@/lib/ai-matching';
import { createTimeEntry } from '@/lib/intervals-api';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    // 1. Fetch meetings from Microsoft Graph API
    const meetings = await getMeetings(session);
    
    // 2. Filter out already processed meetings
    const processedMeetingIds = await prisma.postedMeeting.findMany({
      where: {
        userId: session.user.email
      },
      select: {
        meetingId: true
      }
    });
    
    const processedIds = new Set(processedMeetingIds.map(m => m.meetingId));
    const newMeetings = meetings.filter(meeting => !processedIds.has(meeting.id));
    
    // 3. Match meetings to tasks using AI
    const matchResults = await matchMeetingsToTasks(newMeetings);
    
    // 4. Create time entries for matched meetings
    const timeEntries = [];
    
    for (const result of matchResults) {
      if (result.matchedTasks?.length > 0) {
        try {
          // Create time entry in Intervals
          const timeEntry = await createTimeEntry({
            taskId: result.matchedTasks[0].taskId,
            date: result.meeting.startTime,
            duration: result.meeting.duration,
            description: result.meeting.subject
          });
          
          // Store in database
          await prisma.postedMeeting.create({
            data: {
              meetingId: result.meeting.id,
              userId: session.user.email,
              timeEntry: timeEntry
            }
          });
          
          timeEntries.push({
            meetingSubject: result.meeting.subject,
            timeEntry
          });
        } catch (err) {
          timeEntries.push({
            meetingSubject: result.meeting.subject,
            error: err.message
          });
          
          // Store as unmatched
          await prisma.unmatchedMeeting.create({
            data: {
              id: result.meeting.id,
              userId: session.user.email,
              subject: result.meeting.subject,
              startTime: result.meeting.startTime,
              duration: result.meeting.duration,
              reason: `Error creating time entry: ${err.message}`
            }
          });
        }
      } else {
        // Store unmatched meeting
        await prisma.unmatchedMeeting.create({
          data: {
            id: result.meeting.id,
            userId: session.user.email,
            subject: result.meeting.subject,
            startTime: result.meeting.startTime,
            duration: result.meeting.duration,
            reason: 'No matching task found'
          }
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        meetings: newMeetings,
        matchResults,
        timeEntries,
        uniqueMeetings: newMeetings.length
      }
    });
  } catch (error) {
    console.error('Error processing meetings:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process meetings' },
      { status: 500 }
    );
  }
}
```

## Core Libraries and Services

### Microsoft Graph API Integration

The application uses Microsoft Graph API to fetch calendar meetings:

```typescript
// src/lib/microsoft-graph.ts
import { Client } from '@microsoft/microsoft-graph-client';
import { getToken } from 'next-auth/jwt';

export async function getMeetings(session) {
  const accessToken = session.accessToken;
  
  const graphClient = Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    }
  });
  
  // Get meetings from the past week
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  const endDate = new Date();
  
  const response = await graphClient
    .api('/me/calendar/events')
    .filter(`start/dateTime ge '${startDate.toISOString()}' and end/dateTime le '${endDate.toISOString()}'`)
    .select('id,subject,start,end,attendees')
    .get();
  
  // Transform to our meeting format
  return response.value.map(event => ({
    id: event.id,
    subject: event.subject,
    startTime: event.start.dateTime,
    endTime: event.end.dateTime,
    duration: calculateDuration(event.start.dateTime, event.end.dateTime),
    attendees: event.attendees.map(a => ({
      name: a.emailAddress.name,
      email: a.emailAddress.address
    }))
  }));
}

function calculateDuration(start, end) {
  const startTime = new Date(start);
  const endTime = new Date(end);
  return (endTime.getTime() - startTime.getTime()) / 1000; // Duration in seconds
}
```

### AI Matching Service

The application uses AI to match meetings with tasks:

```typescript
// src/lib/ai-matching.ts
import { Configuration, OpenAIApi } from 'openai';
import { getTasksFromIntervals } from './intervals-api';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export async function matchMeetingsToTasks(meetings) {
  // Get all tasks from Intervals
  const tasks = await getTasksFromIntervals();
  
  const results = [];
  
  for (const meeting of meetings) {
    // Use AI to find the best matching task
    const matchedTasks = await findMatchingTask(meeting, tasks);
    
    results.push({
      meeting,
      meetingSubject: meeting.subject,
      matchedTasks
    });
  }
  
  return results;
}

async function findMatchingTask(meeting, tasks) {
  try {
    const prompt = `
      Meeting subject: "${meeting.subject}"
      
      Available tasks:
      ${tasks.map(task => `- ${task.title} (ID: ${task.id})`).join('\n')}
      
      Find the most relevant task for this meeting. Return only the task ID of the best match.
      If there is no good match, return "NO_MATCH".
    `;
    
    const response = await openai.createCompletion({
      model: "gpt-3.5-turbo-instruct",
      prompt,
      max_tokens: 50,
      temperature: 0.3,
    });
    
    const taskId = response.data.choices[0].text.trim();
    
    if (taskId === "NO_MATCH") {
      return [];
    }
    
    // Find the task in our list
    const matchedTask = tasks.find(task => task.id === taskId);
    
    if (matchedTask) {
      return [{
        taskId: matchedTask.id,
        taskTitle: matchedTask.title
      }];
    }
    
    return [];
  } catch (error) {
    console.error('Error matching task:', error);
    return [];
  }
}
```

### Intervals API Integration

The application integrates with the Intervals time tracking system:

```typescript
// src/lib/intervals-api.ts
import axios from 'axios';

const INTERVALS_API_URL = process.env.INTERVALS_API_URL;
const INTERVALS_API_KEY = process.env.INTERVALS_API_KEY;

// Create a time entry in Intervals
export async function createTimeEntry({ taskId, date, duration, description }) {
  try {
    const response = await axios.post(
      `${INTERVALS_API_URL}/time/add`,
      {
        taskid: taskId,
        date: formatDate(date),
        time: formatDuration(duration),
        description
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${INTERVALS_API_KEY}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error creating time entry:', error);
    throw new Error('Failed to create time entry in Intervals');
  }
}

// Get tasks from Intervals
export async function getTasksFromIntervals() {
  try {
    const response = await axios.get(
      `${INTERVALS_API_URL}/tasks/active`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${INTERVALS_API_KEY}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.map(task => ({
      id: task.id,
      title: task.name,
      projectId: task.projectid,
      projectName: task.project
    }));
  } catch (error) {
    console.error('Error fetching tasks:', error);
    throw new Error('Failed to fetch tasks from Intervals');
  }
}

// Helper functions
function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  // Convert seconds to hours with 2 decimal places
  return (seconds / 3600).toFixed(2);
}
```

## Database Schema

The application uses Prisma with the following schema:

```prisma
// prisma/schema.prisma
model PostedMeeting {
  id        String   @id @default(cuid())
  meetingId String
  userId    String
  timeEntry Json
  postedAt  DateTime @default(now())

  @@unique([meetingId, userId])
  @@index([userId])
}

model UnmatchedMeeting {
  id        String   @id
  userId    String
  subject   String
  startTime String
  duration  Int
  reason    String?
  createdAt DateTime @default(now())

  @@index([userId])
}
```

## Authentication

The application uses NextAuth.js for authentication with Microsoft:

```typescript
// src/lib/auth.ts
import { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: "openid profile email User.Read Calendars.Read"
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the access token to the token
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Send access token to client
      session.accessToken = token.accessToken;
      return session;
    }
  }
};
```

## Error Handling

The backend implements consistent error handling:

1. Try-catch blocks around all API operations
2. Detailed error logging
3. Appropriate HTTP status codes
4. Consistent response format with `success` flag and error messages

## Security Considerations

1. Authentication is required for all API endpoints
2. User data is isolated by userId
3. API keys are stored as environment variables
4. Input validation is performed before processing

## Deployment

The application is deployed as a Next.js application with API routes, which allows for:

1. Serverless functions for API endpoints
2. Edge caching for improved performance
3. Environment variable management for secrets
4. Database connection pooling 