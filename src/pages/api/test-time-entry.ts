import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { fetchUserMeetings } from '../../ai-agent/services/meeting/test';
import { taskService } from '../../ai-agent/services/task/openai';
import { meetingService } from '../../ai-agent/services/meeting/openai';
import { timeEntryService } from '../../ai-agent/services/time-entry/intervals';
import { meetingComparisonService } from '../../ai-agent/services/meeting/comparison';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const session = await getSession({ req });
        if (!session) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = session.user?.email;
        if (!userId) {
            return res.status(400).json({ error: 'User ID not found in session' });
        }

        // First get meetings with analysis
        console.log('Fetching meetings for user:', userId);
        const { meetings } = await fetchUserMeetings(userId);
        console.log(`Found ${meetings.length} meetings:`, meetings.map(m => m.subject));
        
        if (!meetings || meetings.length === 0) {
            return res.status(404).json({ error: 'No meetings found' });
        }

        // Process meetings to get AI analysis
        console.log('Processing meetings with AI analysis...');
        const processedMeetings = [];
        for (const meeting of meetings) {
            try {
                console.log(`Processing meeting: ${meeting.subject}`);
                const processed = await meetingService.analyzeMeeting(meeting, userId);
                processedMeetings.push(processed);
                console.log(`Successfully processed meeting: ${meeting.subject}`);
                await delay(2000); // Add delay between calls
            } catch (error) {
                console.error('Error processing meeting:', meeting.subject, error);
            }
        }

        // Filter out already processed meetings and meetings the user didn't attend
        console.log('Filtering out already processed meetings and meetings the user didn\'t attend...');
        const uniqueMeetings = await meetingComparisonService.filterNewMeetings(processedMeetings);
        
        // Further filter to only include meetings the user actually attended
        const attendedMeetings = uniqueMeetings.filter(meeting => {
            // Check if the user actually attended this meeting
            if (meeting.attendance?.records) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord && userRecord.duration > 0) {
                    console.log(`User ${userId} attended meeting "${meeting.subject}" for ${userRecord.duration} seconds`);
                    return true;
                } else {
                    console.log(`User ${userId} did not attend meeting "${meeting.subject}" or had zero duration. Skipping.`);
                    return false;
                }
            }
            console.log(`No attendance records found for meeting "${meeting.subject}". Skipping.`);
            return false;
        });
        
        console.log(`Found ${uniqueMeetings.length} unique meetings, ${attendedMeetings.length} of which were attended by the user`);

        if (attendedMeetings.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No meetings found that were attended by the user',
                data: {
                    totalMeetings: meetings.length,
                    processedMeetings: processedMeetings.length,
                    uniqueMeetings: uniqueMeetings.length,
                    attendedMeetings: 0,
                    matchResults: [],
                    timeEntries: []
                }
            });
        }

        // Get task matches for attended meetings
        console.log('Matching tasks to attended meetings...');
        const matchResults = [];
        for (const meeting of attendedMeetings) {
            try {
                console.log('Matching tasks for meeting:', meeting.subject);
                const matches = await taskService.matchTasksToMeeting(meeting, userId);
                if (matches === null) {
                    console.log(`Meeting queued for review: ${meeting.id} - ${meeting.subject}`);
                    matchResults.push({
                        meetingId: meeting.id,
                        meetingSubject: meeting.subject,
                        matchedTasks: [],
                        needsReview: true
                    });
                } else {
                    matchResults.push({
                        meetingId: meeting.id,
                        ...matches
                    });
                    console.log(`Found ${matches.matchedTasks?.length || 0} matches for meeting: ${meeting.subject}`);
                }
                await delay(2000); // Add delay between calls
            } catch (error) {
                console.error('Error matching tasks for meeting:', meeting.subject, error);
                matchResults.push({
                    meetingId: meeting.id,
                    meetingSubject: meeting.subject,
                    matchedTasks: [],
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Create time entries for matched meetings
        console.log('Creating time entries...');
        const timeEntries = [];
        for (const result of matchResults) {
            // Skip meetings that need review or had errors
            if (result.needsReview || result.error) {
                console.log(`Skipping time entry creation for meeting: ${result.meetingSubject} - ${result.needsReview ? 'Needs review' : 'Has error'}`);
                continue;
            }

            if (result.matchedTasks && result.matchedTasks.length > 0) {
                const meeting = attendedMeetings.find(m => m.id === result.meetingId);
                if (meeting) {
                    try {
                        console.log(`Creating time entry for meeting: ${meeting.subject}`);
                        const timeEntry = await timeEntryService.createTimeEntry(
                            meeting,
                            {
                                taskId: result.matchedTasks[0].taskId,
                                taskTitle: result.matchedTasks[0].taskTitle
                            },
                            userId
                        );
                        timeEntries.push({
                            meetingId: meeting.id,
                            meetingSubject: meeting.subject,
                            timeEntry
                        });
                        console.log(`Successfully created time entry for: ${meeting.subject}`);
                        await delay(2000); // Add delay between calls
                    } catch (error) {
                        console.error('Error creating time entry:', error);
                        timeEntries.push({
                            meetingId: meeting.id,
                            meetingSubject: meeting.subject,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
            }
        }
        
        return res.status(200).json({ 
            success: true,
            message: `Successfully processed ${attendedMeetings.length} unique meetings`,
            data: {
                totalMeetings: meetings.length,
                processedMeetings: processedMeetings.length,
                uniqueMeetings: uniqueMeetings.length,
                attendedMeetings: attendedMeetings.length,
                meetings: attendedMeetings.map(m => ({
                    id: m.id,
                    subject: m.subject,
                    startTime: m.start.dateTime,
                    endTime: m.end.dateTime,
                    actualDuration: m.attendance?.records?.[0]?.duration || 0
                })),
                matchResults,
                timeEntries
            }
        });
    } catch (error: unknown) {
        console.error('API error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to process meetings',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}