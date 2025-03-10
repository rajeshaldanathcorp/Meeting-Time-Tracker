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
`.trim();

export const generateMeetingComparisonPrompt = (newMeeting: any, postedMeeting: any): string => {
    return meetingComparisonPrompt
        .replace('{newMeeting}', JSON.stringify(newMeeting, null, 2))
        .replace('{postedMeeting}', JSON.stringify(postedMeeting, null, 2));
}; 