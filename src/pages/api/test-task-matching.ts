import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { fetchUserMeetings } from '../../ai-agent/services/meeting/test';
import { taskService } from '../../ai-agent/services/task/openai';
import { meetingService } from '../../ai-agent/services/meeting/openai';
import { IntervalsAPI, Task } from '../../ai-agent/services/task/intervals';

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
            // Get available tasks anyway to check if task fetching works
            try {
                const api = new IntervalsAPI(await taskService['getUserIntervalsApiKey'](userId));
                const availableTasks = await api.getTasks();
                console.log('Available tasks:', JSON.stringify(availableTasks, null, 2));
                
                return res.status(200).json({ 
                    success: false,
                    message: 'No meetings found, but successfully fetched tasks',
                    data: {
                        availableTasks: availableTasks.map(task => ({
                            id: task.id,
                            title: task.title,
                            description: task.description,
                            project: task.project,
                            status: task.status,
                            priority: task.priority
                        })),
                        matchResults: []
                    }
                });
            } catch (taskError) {
                console.error('Error fetching tasks:', taskError);
                return res.status(404).json({ 
                    error: 'No meetings found',
                    taskError: taskError instanceof Error ? taskError.message : 'Unknown task error'
                });
            }
        }

        // Process meetings to get AI analysis with delay between calls
        console.log('Processing meetings with AI analysis...');
        const processedMeetings = [];
        for (const meeting of meetings) {
            try {
                console.log(`Processing meeting: ${meeting.subject}`);
                const processed = await meetingService.analyzeMeeting(meeting, userId);
                processedMeetings.push(processed);
                console.log(`Successfully processed meeting: ${meeting.subject}`);
                // Add 2 second delay between calls
                await delay(2000);
            } catch (error) {
                console.error('Error processing meeting:', meeting.subject, error);
            }
        }

        // Get available tasks first
        console.log('Fetching available tasks...');
        const api = new IntervalsAPI(await taskService['getUserIntervalsApiKey'](userId));
        const availableTasks = await api.getTasks();
        console.log('Available tasks:', JSON.stringify(availableTasks, null, 2));

        // Get task matches for each processed meeting with delay between calls
        console.log('Matching tasks to meetings...');
        const matchResults = [];
        for (const meeting of processedMeetings) {
            try {
                console.log('Matching tasks for meeting:', meeting.subject);
                const matches = await taskService.matchTasksToMeeting(meeting, userId);
                matchResults.push({
                    meetingId: meeting.id,
                    ...matches
                });
                console.log(`Found ${matches.matchedTasks.length} matches for meeting: ${meeting.subject}`);
                // Add 2 second delay between calls
                await delay(2000);
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
        
        return res.status(200).json({ 
            success: true,
            message: `Successfully matched tasks for ${meetings.length} meetings`,
            data: {
                availableTasks: availableTasks.map(task => ({
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    project: task.project,
                    status: task.status,
                    priority: task.priority
                })),
                matchResults
            }
        });
    } catch (error: unknown) {
        console.error('API error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to match tasks',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
} 