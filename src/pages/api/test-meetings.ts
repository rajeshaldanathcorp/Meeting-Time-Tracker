import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { fetchUserMeetings } from '../../ai-agent/services/meeting/test';
import { openAIClient } from '../../ai-agent/core/azure-openai/client';

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

        console.log('Fetching meetings for user:', userId);
        const { meetings, attendanceReport } = await fetchUserMeetings(userId);
        
        // Add AI analysis for each meeting
        const analyzedMeetings = await Promise.all(meetings.map(async (meeting) => {
            try {
                // Get attendance data directly using meeting ID
                const meetingAttendance = attendanceReport.detailedAttendance[meeting.id];

                const meetingData = JSON.stringify({
                    subject: meeting.subject,
                    startTime: meeting.start.dateTime,
                    endTime: meeting.end.dateTime,
                    attendees: [{
                        duration: meetingAttendance?.records?.[0]?.duration || 0
                    }]
                }, null, 2);

                console.log('Analyzing meeting:', meeting.subject);
                console.log('Meeting data sent to OpenAI:', meetingData);
                const analysis = await openAIClient.analyzeMeeting(meetingData);
                console.log('Received analysis from Azure OpenAI:', analysis);
                return {
                    ...meeting,
                    aiAnalysis: analysis
                };
            } catch (error) {
                console.error('Error analyzing meeting:', meeting.subject, error);
                return {
                    ...meeting,
                    aiAnalysis: 'Analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error')
                };
            }
        }));
        
        return res.status(200).json({ 
            success: true,
            message: `Successfully fetched and analyzed ${meetings.length} meetings`,
            data: {
                totalMeetings: meetings.length,
                meetings: analyzedMeetings,
                attendanceReport: {
                    ...attendanceReport,
                    attendancePercentage: (attendanceReport.attendedMeetings / attendanceReport.totalMeetings) * 100,
                    summary: {
                        totalParticipants: Object.keys(attendanceReport.attendanceByPerson).length,
                        totalOrganizers: Object.keys(attendanceReport.organizerStats).length,
                        meetingsWithAttendance: Object.keys(attendanceReport.detailedAttendance).length
                    },
                    detailedAttendance: Object.entries(attendanceReport.detailedAttendance).map(([meetingId, data]) => ({
                        meetingId,
                        subject: data.subject,
                        startTime: data.startTime,
                        endTime: data.endTime,
                        attendees: data.records.map(record => ({
                            name: record.name,
                            email: record.email,
                            duration: record.duration,
                            role: record.role,
                            joinLeaveHistory: record.attendanceIntervals?.map(interval => ({
                                joined: interval.joinDateTime,
                                left: interval.leaveDateTime,
                                duration: interval.durationInSeconds
                            }))
                        }))
                    }))
                }
            }
        });
    } catch (error: unknown) {
        console.error('API error:', error);
        return res.status(500).json({ 
            success: false,
            error: 'Failed to fetch meetings',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
} 