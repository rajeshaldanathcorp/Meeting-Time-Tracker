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
`.trim();

export const generateTaskMatchingPrompt = (meetingAnalysis: string, tasksData: string): string => {
    return taskMatchingPrompt
        .replace('{meetingAnalysis}', meetingAnalysis)
        .replace('{tasksData}', tasksData);
}; 