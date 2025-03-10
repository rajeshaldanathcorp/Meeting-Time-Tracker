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
`.trim();

export const generateMeetingAnalysisPrompt = (meetingData: string): string => {
    return meetingAnalysisPrompt.replace('{meetingData}', meetingData);
}; 