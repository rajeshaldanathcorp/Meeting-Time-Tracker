import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { AIAgentPostedMeetingsStorage } from '../../ai-agent/services/storage/posted-meetings';

interface UnmatchedMeeting {
    id: string;
    subject: string;
    startTime: string;
    duration: number;
    reason?: string;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    console.log('API: /api/posted-meetings called');

    if (req.method !== 'GET') {
        console.log('API: Method not allowed:', req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('API: Getting session...');
        const session = await getSession({ req });
        console.log('API: Session:', session);

        if (!session) {
            console.log('API: No session found');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = session.user?.email;
        console.log('API: User ID:', userId);

        if (!userId) {
            console.log('API: No user ID found in session');
            return res.status(400).json({ error: 'User ID not found in session' });
        }

        // Load meetings using AIAgentPostedMeetingsStorage
        console.log('API: Creating storage instance...');
        const storage = new AIAgentPostedMeetingsStorage();
        
        console.log('API: Loading data...');
        await storage.loadData();
        
        console.log('API: Getting posted meetings for user:', userId);
        const postedMeetings = await storage.getPostedMeetings(userId);
        console.log('API: Found posted meetings:', postedMeetings);

        // Sort meetings by posted date
        const sortedMeetings = postedMeetings.sort((a, b) => 
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        );
        console.log('API: Sorted meetings:', sortedMeetings);

        // Get unmatched meetings from the last processing attempt
        const unmatchedMeetings: UnmatchedMeeting[] = [];

        const response = {
            success: true,
            meetings: sortedMeetings,
            unmatchedMeetings,
            summary: {
                total: sortedMeetings.length,
                unmatched: unmatchedMeetings.length
            }
        };
        console.log('API: Sending response:', response);

        return res.status(200).json(response);
    } catch (error: unknown) {
        console.error('API Error fetching posted meetings:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to fetch posted meetings',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
} 