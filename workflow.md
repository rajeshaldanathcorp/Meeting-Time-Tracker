# AI Agent Workflow Documentation

## Overview

This document provides a detailed technical overview of the AI Agent system, which automates the process of analyzing meetings and creating time entries. The system integrates with Microsoft Graph API to fetch meeting data and Intervals time tracking service to create time entries, using Azure OpenAI services for intelligent matching and analysis.

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Microsoft      │     │  AI Agent       │     │  Intervals      │
│  Graph API      │◄────┤  System         ├────►│  API            │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │                 │
                        │  Azure OpenAI   │
                        │  Services       │
                        │                 │
                        └─────────────────┘
```

## AI Prompts and Responses

The AI Agent system uses carefully crafted prompts to communicate with Azure OpenAI services. These prompts are designed to extract specific information and guide the AI to provide structured responses that can be easily parsed and used by the system.

### 1. Task Matching Prompt

The task matching prompt is used to match meetings with relevant tasks. It provides the meeting details and available tasks to the AI and asks for a structured response with confidence scores and reasoning.

```typescript
// src/ai-agent/core/azure-openai/prompts/task-matching.ts
export const taskMatchingPrompt = `
You are an AI assistant that matches meetings with relevant tasks. Your goal is to find the most relevant task(s) for a given meeting based on the meeting details and available tasks.

Meeting Details:
{meetingAnalysis}

Available Tasks:
{tasksData}

Analyze the meeting and tasks, then provide your response in the following JSON format:

{
    "matchedTasks": [
        {
            "taskId": "string",
            "taskTitle": "string",
            "meetingDetails": {
                "subject": "string",
                "startTime": "string",
                "endTime": "string",
                "actualDuration": number  // Use the duration from attendance records in seconds
            },
            "confidence": number,
            "reason": "string"
        }
    ]
}

Notes:
1. Only include tasks with meaningful relevance to the meeting
2. Confidence should be a number between 0 and 1
3. Provide clear reasons for each match
4. Return valid JSON that can be parsed directly
5. Include all required fields for each task
6. The actualDuration should be taken from the attendance records and is in seconds
`;
```

**Example AI Response:**
```json
{
  "matchedTasks": [
    {
      "taskId": "12345",
      "taskTitle": "Website Redesign",
      "meetingDetails": {
        "subject": "Website Design Review",
        "startTime": "2023-06-15T14:00:00Z",
        "endTime": "2023-06-15T15:00:00Z",
        "actualDuration": 3600
      },
      "confidence": 0.85,
      "reason": "The meeting subject and content directly relate to website design review, which aligns with the 'Website Redesign' task. The meeting included discussion of UI elements and approval of design mockups."
    },
    {
      "taskId": "12346",
      "taskTitle": "Content Strategy",
      "meetingDetails": {
        "subject": "Website Design Review",
        "startTime": "2023-06-15T14:00:00Z",
        "endTime": "2023-06-15T15:00:00Z",
        "actualDuration": 3600
      },
      "confidence": 0.65,
      "reason": "The meeting included some discussion about content placement and strategy, which relates to the 'Content Strategy' task, though this was not the primary focus of the meeting."
    }
  ]
}
```

### 2. Meeting Analysis Prompt

The meeting analysis prompt is used to extract key information from meeting data, including the subject, start time, end time, and actual duration.

```typescript
// src/ai-agent/core/azure-openai/prompts/meeting-analysis.ts
export const meetingAnalysisPrompt = `
You are an AI assistant that analyzes meeting data. Your task is to extract meeting details and actual attendance duration.

Please analyze the following meeting data and provide ONLY these details in the exact format shown:

{meetingData}

Format:
Subject: [subject]
Start Time: [startTime]
End Time: [endTime]
Actual Duration: [attendees[0].duration] seconds

Note: The duration should be taken directly from attendees[0].duration. If no attendees are present, show "0 seconds".
`;
```

**Example AI Response:**
```
Subject: Weekly Team Sync
Start Time: 2023-06-14T10:00:00Z
End Time: 2023-06-14T11:00:00Z
Actual Duration: 3540 seconds
```

### 3. Meeting Comparison Prompt

The meeting comparison prompt is used to determine if a new meeting is a duplicate of a previously processed meeting. This is important to prevent creating duplicate time entries.

```typescript
// src/ai-agent/core/azure-openai/prompts/meeting-comparison.ts
export const meetingComparisonPrompt = `
You are an AI assistant that compares meetings to determine if they are unique instances or duplicates.
Your task is to analyze the meetings and determine if the new meeting has already been processed.

New Meeting:
{newMeeting}

Previously Posted Meeting:
{postedMeeting}

Compare these meetings and determine if they are the same instance or different instances.
Focus particularly on:
1. Meeting title and description similarity
2. Date and start time
3. Actual duration of the meeting (this is a key differentiator)

Even if meetings have the same title (like recurring meetings), they should be considered different instances if:
- They occur on different dates
- Have significantly different actual durations
- Show different attendance patterns

Provide your analysis in the following JSON format:
{
    "isDuplicate": boolean,
    "confidence": number,  // 0 to 1
    "reason": string,
    "matchingCriteria": {
        "titleMatch": boolean,
        "dateMatch": boolean,
        "durationMatch": boolean
    }
}

Note: For recurring meetings, pay special attention to the actualDuration as it's a key indicator of unique meeting instances.
`;
```

**Example AI Response:**
```json
{
  "isDuplicate": true,
  "confidence": 0.95,
  "reason": "The meetings have identical titles, occur on the same date and time, and have very similar actual durations (3540s vs 3550s).",
  "matchingCriteria": {
    "titleMatch": true,
    "dateMatch": true,
    "durationMatch": true
  }
}
```

### Processing AI Responses

The system processes these AI responses in the following ways:

1. **Task Matching**: The system parses the JSON response to extract matched tasks with their confidence scores. Tasks with high confidence (≥0.8) are automatically used for time entries, while tasks with medium confidence (≥0.5) are suggested to the user for confirmation. Tasks with low confidence (<0.5) are queued for manual review.

2. **Meeting Analysis**: The system extracts the structured information about the meeting, including the actual duration based on attendance records, which is used for accurate time tracking.

3. **Meeting Comparison**: The system uses the comparison result to determine if a meeting has already been processed, preventing duplicate time entries. If the confidence is high (≥0.9), the meeting is considered a duplicate and skipped.

## Core Components and Implementation

### 1. Azure OpenAI Integration

The system uses Azure OpenAI for intelligent analysis and matching. The integration is handled by the `openAIClient` in `src/ai-agent/core/azure-openai/client.ts`:

```typescript
// src/ai-agent/core/azure-openai/client.ts
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

class AzureOpenAIClient {
    private client: OpenAIClient;
    private deploymentName: string;

    constructor() {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
        const apiKey = process.env.AZURE_OPENAI_API_KEY!;
        this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;
        
        this.client = new OpenAIClient(
            endpoint,
            new AzureKeyCredential(apiKey)
        );
    }

    async getCompletion(prompt: string): Promise<string> {
        try {
            const response = await this.client.getCompletions(
                this.deploymentName,
                [prompt],
                {
                    temperature: 0.7,
                    maxTokens: 800
                }
            );
            
            return response.choices[0].text || '';
        } catch (error) {
            console.error('Error getting completion:', error);
            throw error;
        }
    }
}

export const openAIClient = new AzureOpenAIClient();
```

### 2. Meeting Service

The Meeting Service fetches and analyzes meeting data from Microsoft Graph API. It's implemented in `src/ai-agent/services/meeting/openai.ts`:

```typescript
// src/ai-agent/services/meeting/openai.ts
export class MeetingService {
    private static instance: MeetingService;

    public static getInstance(): MeetingService {
        if (!MeetingService.instance) {
            MeetingService.instance = new MeetingService();
        }
        return MeetingService.instance;
    }

    public async analyzeMeeting(meeting: Meeting, userId: string): Promise<ProcessedMeeting> {
        try {
            // Prepare meeting data for analysis
            const meetingData = this.prepareMeetingData(meeting);
            
            // Generate prompt for OpenAI
            const prompt = generateMeetingAnalysisPrompt(meetingData);
            
            // Get analysis from OpenAI
            const analysisResult = await openAIClient.getCompletion(prompt);
            
            // Parse the analysis result
            const analysis = this.parseAnalysis(analysisResult, meeting.id);
            
            // Get attendance records if available
            let attendanceRecords: AttendanceRecord[] = [];
            if (meeting.onlineMeeting?.joinUrl) {
                const { meetingId, organizerId } = this.extractMeetingInfo(meeting.onlineMeeting.joinUrl);
                if (meetingId && organizerId) {
                    const token = await this.getGraphToken();
                    attendanceRecords = await this.getAttendanceRecords(userId, meetingId, organizerId, token);
                }
            }
            
            // Create processed meeting
            const processedMeeting: ProcessedMeeting = {
                ...meeting,
                analysis,
                attendance: {
                    records: attendanceRecords
                }
            };
            
            // Store processed meeting
            await storageManager.storeMeeting(processedMeeting);
            
            return processedMeeting;
        } catch (error) {
            console.error('Error analyzing meeting:', error);
            throw error;
        }
    }
}
```

### 3. Task Service

The Task Service matches meetings with relevant tasks using AI. It's implemented in `src/ai-agent/services/task/openai.ts`:

```typescript
// src/ai-agent/services/task/openai.ts
export class TaskService {
    private static instance: TaskService;

    public static getInstance(): TaskService {
        if (!TaskService.instance) {
            TaskService.instance = new TaskService();
        }
        return TaskService.instance;
    }

    public async matchTasksToMeeting(meeting: ProcessedMeeting, userId: string): Promise<any> {
        try {
            // Get API key for the user
            const apiKey = await this.getUserIntervalsApiKey(userId);
            
            // Fetch tasks from Intervals
            const tasks = await this.fetchTasksFromIntervals(apiKey);
            
            // Prepare data for matching
            const meetingData = {
                subject: meeting.subject,
                startTime: meeting.start.dateTime,
                endTime: meeting.end.dateTime,
                attendees: meeting.attendees?.map(a => a.emailAddress.address) || [],
                body: meeting.body?.content || '',
                analysis: meeting.analysis
            };
            
            const tasksData = tasks.map(task => ({
                id: task.id,
                title: task.name,
                description: task.description || '',
                project: task.project?.name || '',
                client: task.client?.name || ''
            }));
            
            // Generate prompt for OpenAI
            const prompt = generateTaskMatchingPrompt(meetingData, tasksData);
            
            // Get matching result from OpenAI
            const matchingResult = await openAIClient.getCompletion(prompt);
            
            // Parse the matching result
            const parsedResult = this.parseMatchingResult(matchingResult, meeting.subject);
            
            // If no good matches, queue for review
            if (parsedResult.matchedTasks.length === 0 || 
                parsedResult.matchedTasks[0].confidence < 0.7) {
                await this.queueForReview(
                    meeting, 
                    parsedResult.matchedTasks[0]?.confidence || 0,
                    'Low confidence match'
                );
            }
            
            return parsedResult;
        } catch (error) {
            console.error('Error matching tasks:', error);
            
            // Queue for review on error
            await this.queueForReview(meeting, 0, 'Error during matching');
            throw error;
        }
    }
}
```

### 4. Time Entry Service

The Time Entry Service creates time entries in Intervals based on meetings and matched tasks. It's implemented in `src/ai-agent/services/time-entry/intervals.ts`:

```typescript
// src/ai-agent/services/time-entry/intervals.ts
export class IntervalsTimeEntryService {
    private static instance: IntervalsTimeEntryService;
    private baseUrl: string;
    private headers: Record<string, string>;
    private postedMeetingsPath: string;

    public static getInstance(): IntervalsTimeEntryService {
        if (!IntervalsTimeEntryService.instance) {
            IntervalsTimeEntryService.instance = new IntervalsTimeEntryService();
        }
        return IntervalsTimeEntryService.instance;
    }

    public async createTimeEntry(
        meeting: ProcessedMeeting,
        matchedTask: { taskId: string; taskTitle: string },
        userId: string
    ): Promise<TimeEntryResponse> {
        try {
            // Initialize headers with API key
            await this.initializeHeaders(userId);
            
            // Get person info
            const person = await this.getPersonInfo();
            
            // Get task details
            const task = await this.getTaskDetails(matchedTask.taskId);
            
            // Get work types for the project
            const workTypes = await this.getProjectWorkTypes(task.projectid);
            const defaultWorkType = workTypes[0]; // Use first work type as default
            
            // Calculate duration from attendance records or meeting times
            let durationInSeconds = 0;
            if (meeting.attendance?.records && meeting.attendance.records.length > 0) {
                // Use attendance duration if available
                durationInSeconds = meeting.attendance.records[0].duration;
            } else {
                // Calculate from meeting start/end times
                const startTime = new Date(meeting.start.dateTime);
                const endTime = new Date(meeting.end.dateTime);
                durationInSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
            }
            
            // Convert seconds to decimal hours
            const timeInHours = this.convertSecondsToDecimalHours(durationInSeconds);
            
            // Format date for time entry
            const date = this.formatDate(meeting.start.dateTime);
            
            // Create time entry payload
            const timeEntry: TimeEntry = {
                personid: person.id,
                date: date,
                time: timeInHours.toString(),
                description: `Meeting: ${meeting.subject}`,
                taskid: task.id,
                projectid: task.projectid,
                moduleid: task.moduleid,
                worktypeid: defaultWorkType.id,
                billable: '1' // Billable by default
            };
            
            // Send request to create time entry
            const response = await fetch(`${this.baseUrl}/time/`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(timeEntry)
            });
            
            if (!response.ok) {
                throw new Error(`Failed to create time entry: ${response.status} ${response.statusText}`);
            }
            
            const responseData = await response.json();
            
            // Save record of posted meeting
            await this.savePostedMeeting(meeting, responseData, responseData, userId);
            
            return responseData;
        } catch (error) {
            console.error('Error creating time entry:', error);
            throw error;
        }
    }
}
```

### 5. Review Service

The Review Service handles meetings that need manual review. It's implemented in `src/ai-agent/services/review/review-service.ts`:

```typescript
// src/ai-agent/services/review/review-service.ts
export class ReviewService {
    private static instance: ReviewService;
    private reviewMeetingsPath: string;

    public static getInstance(): ReviewService {
        if (!ReviewService.instance) {
            ReviewService.instance = new ReviewService();
        }
        return ReviewService.instance;
    }

    public async queueForReview(meeting: ReviewMeeting): Promise<void> {
        try {
            // Load existing review meetings
            const reviewMeetings = await this.getReviewMeetings();
            
            // Check if meeting is already in review
            const existingIndex = reviewMeetings.findIndex(m => m.id === meeting.id);
            
            if (existingIndex >= 0) {
                // Update existing meeting
                reviewMeetings[existingIndex] = {
                    ...reviewMeetings[existingIndex],
                    ...meeting,
                    updatedAt: new Date().toISOString()
                };
            } else {
                // Add new meeting to review
                reviewMeetings.push({
                    ...meeting,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
            }
            
            // Save updated review meetings
            await this.saveReviewMeetings(reviewMeetings);
        } catch (error) {
            console.error('Error queueing meeting for review:', error);
            throw error;
        }
    }

    public async getReviewMeetings(): Promise<ReviewMeeting[]> {
        try {
            // Load review meetings from storage
            const data = await fs.readFile(this.reviewMeetingsPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            // Return empty array if file doesn't exist
            return [];
        }
    }

    public async updateReviewStatus(meetingId: string, status: 'approved' | 'rejected' | 'pending', selectedTaskId?: string): Promise<void> {
        try {
            // Load existing review meetings
            const reviewMeetings = await this.getReviewMeetings();
            
            // Find meeting to update
            const meetingIndex = reviewMeetings.findIndex(m => m.id === meetingId);
            
            if (meetingIndex >= 0) {
                // Update meeting status
                reviewMeetings[meetingIndex].status = status;
                
                if (selectedTaskId) {
                    reviewMeetings[meetingIndex].selectedTaskId = selectedTaskId;
                }
                
                reviewMeetings[meetingIndex].updatedAt = new Date().toISOString();
                
                // Save updated review meetings
                await this.saveReviewMeetings(reviewMeetings);
            }
        } catch (error) {
            console.error('Error updating review status:', error);
            throw error;
        }
    }
}

export const reviewService = ReviewService.getInstance();
```

## Key Workflows

### 1. Meeting Analysis Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │     │ Extract     │     │ Analyze     │     │ Store       │
│ Meeting     ├────►│ Attendance  ├────►│ Meeting     ├────►│ Processed   │
│ Data        │     │ Records     │     │ with AI     │     │ Meeting     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Implementation Details:**

1. **Fetch Meeting Data**: The system retrieves meeting data from Microsoft Graph API, including subject, time, attendees, and body content.

2. **Extract Attendance Records**: For Teams meetings, the system extracts attendance records to determine actual participation duration.

3. **Analyze Meeting with AI**: The meeting content is sent to Azure OpenAI for analysis, which extracts key points, action items, and relevance scores.

4. **Store Processed Meeting**: The analyzed meeting is stored for future reference and task matching.

### 2. Task Matching Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │     │ Format      │     │ Match Tasks │     │ Return      │
│ Available   ├────►│ Meeting &   ├────►│ Using       ├────►│ Matched     │
│ Tasks       │     │ Task Data   │     │ Azure OpenAI│     │ Tasks       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Implementation Details:**

1. **Fetch Available Tasks**: The system retrieves all available tasks from the Intervals API.

2. **Format Meeting & Task Data**: The meeting analysis and task data are formatted for AI processing.

3. **Match Tasks Using Azure OpenAI**: The formatted data is sent to Azure OpenAI, which matches the meeting with relevant tasks based on content similarity.

4. **Return Matched Tasks**: The system returns the matched tasks with confidence scores and reasoning.

### 3. Time Entry Creation Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Process     │     │ Match with  │     │ Create Time │     │ Store       │
│ Meeting     ├────►│ Relevant    ├────►│ Entry in    ├────►│ Posted      │
│ Data        │     │ Task        │     │ Intervals   │     │ Meeting     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Implementation Details:**

1. **Process Meeting Data**: The system takes a processed meeting with attendance records and duration.

2. **Match with Relevant Task**: The meeting is matched with a relevant task using the Task Service.

3. **Create Time Entry in Intervals**: A time entry is created in Intervals with the meeting duration and task association.

4. **Store Posted Meeting**: A record of the posted meeting is stored to prevent duplicate processing.

### 4. Manual Review Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Detect Low  │     │ Queue for   │     │ User        │     │ Create Time │
│ Confidence  ├────►│ Manual      ├────►│ Reviews &   ├────►│ Entry &     │
│ Match       │     │ Review      │     │ Selects Task│     │ Learn       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

**Implementation Details:**

1. **Detect Low Confidence Match**: The system identifies meetings with low confidence task matches (below 0.7) or AI service failures.

2. **Queue for Manual Review**: These meetings are added to a review queue in the dashboard.

3. **User Reviews & Selects Task**: The user reviews the meeting details and selects the appropriate task.

4. **Create Time Entry & Learn**: The system creates a time entry based on the user's selection and stores the feedback for future learning.

## Front-End Integration

The AI Agent is integrated into the front-end through the `AIAgentView` component in `src/components/ai-agent-view.tsx`:

```typescript
// src/components/ai-agent-view.tsx
export function AIAgentView() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<MatchResults>({
        high: [],
        medium: [],
        low: [],
        unmatched: []
    });
    const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
    const [unmatchedMeetings, setUnmatchedMeetings] = useState<UnmatchedMeeting[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Add log entry
    const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
        setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            message,
            type
        }]);
    };

    // Handle meeting posted
    const handleMeetingPosted = (meetingId: string) => {
        setUnmatchedMeetings(prev => prev.filter(m => m.id !== meetingId));
        fetchPostedMeetings();
    };

    // Process meetings
    const processMeetings = async () => {
        try {
            setIsProcessing(true);
            addLog('Starting meeting processing...');

            const response = await fetch('/api/ai-agent/process-meetings');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to process meetings');
            }

            // Process results
            const newResults: MatchResults = {
                high: [],
                medium: [],
                low: [],
                unmatched: []
            };

            data.results.forEach((result: any) => {
                const meetingSubject = result.meeting?.subject || result.meetingSubject;
                const meetingId = result.meeting?.meetingInfo?.meetingId || result.meetingId;

                if (result.matchedTask && result.confidence >= 0.8) {
                    newResults.high.push(result);
                    addLog(`High confidence match for: ${meetingSubject}`, 'success');
                } else if (result.matchedTask && result.confidence >= 0.5) {
                    newResults.medium.push(result);
                    addLog(`Medium confidence match for: ${meetingSubject}`, 'info');
                } else if (result.matchedTask) {
                    newResults.low.push(result);
                    addLog(`Low confidence match for: ${meetingSubject}`, 'error');
                } else {
                    // Handle unmatched meetings
                    const now = new Date();
                    const getValidDate = (dateStr: string | undefined | null) => {
                        if (!dateStr) return now;
                        try {
                            const date = new Date(dateStr);
                            return isNaN(date.getTime()) ? now : date;
                        } catch {
                            return now;
                        }
                    };

                    // Calculate duration ensuring it's positive and valid
                    const convertSecondsToDecimalHours = (seconds: number): number => {
                        return Number((seconds / 3600).toFixed(2));
                    };

                    const startTime = getValidDate(result.meeting?.startTime || result.startTime);
                    const endTime = getValidDate(result.meeting?.endTime || result.endTime);
                    
                    // Calculate duration in seconds first
                    const durationInSeconds = Math.max(
                        result.attendance?.records?.[0]?.duration || 
                        Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
                        1800 // Minimum 30 minutes
                    );

                    // Convert to decimal hours for time entry
                    const timeInHours = convertSecondsToDecimalHours(durationInSeconds);

                    if (timeInHours <= 0) {
                        console.error('Invalid meeting duration:', timeInHours);
                        addLog(`Invalid duration for meeting: ${meetingSubject}`, 'error');
                        return;
                    }

                    // Create unmatched result
                    const unmatchedResult = createUnmatchedResult(result, meetingSubject, meetingId, startTime, endTime, durationInSeconds);
                    
                    // Only add to unmatched if we have valid duration and meeting info
                    if (timeInHours > 0 && meetingId) {
                        newResults.unmatched.push(unmatchedResult);
                        addLog(`No match found for: ${meetingSubject}`, 'error');
                        
                        // Update unmatchedMeetings state with validated data
                        setUnmatchedMeetings(prev => [...prev, {
                            id: meetingId,
                            subject: meetingSubject || 'Untitled Meeting',
                            startTime: startTime.toISOString(),
                            duration: durationInSeconds,
                            reason: 'No matching task found'
                        }]);
                    } else {
                        addLog(`Skipped invalid meeting: ${meetingSubject} (Invalid duration or missing ID)`, 'error');
                    }
                }
            });

            setResults(newResults);
            addLog('Meeting processing completed', 'success');
        } catch (error) {
            console.error('Error processing meetings:', error);
            addLog(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="ai-agent-container">
            {/* UI components for displaying results and logs */}
        </div>
    );
}
```

## Security and Error Handling

### Security Considerations

1. **API Authentication**: All API requests use proper authentication tokens.
2. **Secure Storage**: API keys and credentials are stored securely.
3. **User Isolation**: User data is isolated between different users.
4. **Input Validation**: All inputs are validated before processing.

### Error Handling

1. **Graceful Degradation**: The system handles API failures gracefully.
2. **Retry Mechanism**: Failed requests are retried with exponential backoff.
3. **Logging**: Comprehensive error logging for debugging.
4. **User Feedback**: Clear error messages are provided to users.

## Future Enhancements

1. **Improved AI Matching**: Enhance the AI matching algorithm with more context.
2. **Learning System**: Implement a learning system that improves matching based on user feedback.
3. **Batch Processing**: Add support for batch processing of similar meetings.
4. **Integration with More Services**: Add support for additional time tracking services.
5. **Advanced Analytics**: Provide insights into time usage and productivity.

## Conclusion

The AI Agent system provides an automated solution for analyzing meetings and creating time entries. By leveraging Azure OpenAI services, it intelligently matches meetings with relevant tasks and creates accurate time entries, saving users time and effort in manual time tracking. 