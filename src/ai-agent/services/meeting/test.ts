import { Meeting } from '../../../interfaces/meetings';
import { openAIClient } from '../../core/azure-openai/client';

async function getGraphToken(): Promise<string> {
    try {
        const tokenEndpoint = `https://login.microsoftonline.com/${process.env.AZURE_AD_APP_TENANT_ID}/oauth2/v2.0/token`;
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: process.env.AZURE_AD_APP_CLIENT_ID!,
                client_secret: process.env.AZURE_AD_APP_CLIENT_SECRET!,
                grant_type: 'client_credentials',
                scope: 'https://graph.microsoft.com/.default'
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get access token');
        }

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('Error getting graph token:', error);
        throw error;
    }
}

interface MeetingIdentity {
    displayName: string;
    id?: string;
    tenantId?: string;
}

interface AttendanceRecord {
    identity?: MeetingIdentity;
    emailAddress?: string;
    totalAttendanceInSeconds: number;
    role?: string;
    attendanceIntervals?: {
        joinDateTime: string;
        leaveDateTime: string;
        durationInSeconds: number;
    }[];
}

interface AttendanceReport {
    totalMeetings: number;
    attendedMeetings: number;
    organizedMeetings: number;
    attendanceByPerson: { [key: string]: number };
    organizerStats: { [key: string]: number };
    detailedAttendance: {
        [meetingId: string]: {
            subject: string;
            startTime: string;
            endTime: string;
            records: {
                name: string;
                email: string;
                duration: number;
                role?: string;
                attendanceIntervals?: {
                    joinDateTime: string;
                    leaveDateTime: string;
                    durationInSeconds: number;
                }[];
            }[];
        };
    };
}

interface OnlineMeeting {
    joinUrl: string;
    conferenceId?: string;
}

function extractMeetingInfo(joinUrl: string): { meetingId: string | undefined; organizerId: string | undefined } {
    const result = {
        meetingId: undefined as string | undefined,
        organizerId: undefined as string | undefined
    };

    try {
        // First decode the URL
        const decodedUrl = decodeURIComponent(joinUrl);
        console.log('Decoded URL:', decodedUrl);

        // Extract meeting ID using regex - exactly as in graph-meetings.ts
        const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
        if (meetingMatch) {
            result.meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
            console.log('Extracted Meeting ID:', result.meetingId);
        }

        // Extract Organizer ID (Oid) from the context parameter
        const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
        if (organizerMatch) {
            result.organizerId = organizerMatch[1];
            console.log('Extracted Organizer ID:', result.organizerId);
        }
    } catch (error) {
        console.error('Error extracting meeting info:', error);
    }

    return result;
}

async function getAttendanceRecords(userId: string, meetingId: string, organizerId: string, accessToken: string): Promise<AttendanceRecord[]> {
    try {
        // Format string exactly as in graph-meetings.ts
        const formattedString = `1*${organizerId}*0**${meetingId}`;
        console.log('Formatted string:', formattedString);
        const base64MeetingId = Buffer.from(formattedString).toString('base64');
        console.log('Base64 Meeting ID:', base64MeetingId);

        // First get the user info
        const userResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!userResponse.ok) {
            console.log('Failed to get user info');
            return [];
        }

        const userData = await userResponse.json();
        const targetUserId = userData.id;

        // Get attendance reports using the user's ID
        const reportsResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!reportsResponse.ok) {
            console.log(`No attendance reports. Status: ${reportsResponse.status}`);
            return [];
        }

        const reportsData = await reportsResponse.json();
        console.log('Reports data:', JSON.stringify(reportsData, null, 2));

        if (!reportsData.value || reportsData.value.length === 0) {
            return [];
        }

        const reportId = reportsData.value[0].id;
        console.log('Report ID:', reportId);

        // Get attendance records
        const recordsResponse = await fetch(
            `https://graph.microsoft.com/v1.0/users/${targetUserId}/onlineMeetings/${base64MeetingId}/attendanceReports/${reportId}/attendanceRecords`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!recordsResponse.ok) {
            return [];
        }

        const recordsData = await recordsResponse.json();
        console.log('Records data:', JSON.stringify(recordsData, null, 2));
        return recordsData.value || [];
    } catch (error) {
        console.error('Error fetching attendance records:', error);
        return [];
    }
}

export async function fetchUserMeetings(userId: string): Promise<{ meetings: Meeting[], attendanceReport: AttendanceReport }> {
    try {
        const accessToken = await getGraphToken();
        
        // Get meetings from the last 7 days
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7); // Look back 7 days instead of 14

        const startDateString = startDate.toISOString();
        const endDateString = endDate.toISOString();
        
        console.log('Fetching meetings between:', startDateString, 'and', endDateString);
        
        const filter = encodeURIComponent(
            `start/dateTime ge '${startDateString}' and end/dateTime le '${endDateString}'`
        );
        
        const url = `https://graph.microsoft.com/v1.0/users/${userId}/events?$filter=${filter}&$select=id,subject,start,end,organizer,attendees,bodyPreview,importance,isAllDay,isCancelled,categories,onlineMeeting&$orderby=start/dateTime desc`;
        console.log('Fetching meetings from URL:', url);

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Graph API Error:', errorText);
            throw new Error(`Failed to fetch meetings: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();
        console.log('Received meetings data:', JSON.stringify(data, null, 2));
        
        const meetings = data.value;
        console.log(`Found ${meetings.length} meetings from past 7 days:`, meetings.map((m: Meeting) => ({
            subject: m.subject,
            start: m.start.dateTime,
            end: m.end.dateTime
        })));

        const attendanceReport: AttendanceReport = {
            totalMeetings: meetings.length,
            attendedMeetings: 0,
            organizedMeetings: 0,
            attendanceByPerson: {},
            organizerStats: {},
            detailedAttendance: {}
        };

        for (const meeting of meetings) {
            const organizerEmail = meeting.organizer.emailAddress.address.toLowerCase();
            attendanceReport.organizerStats[organizerEmail] = (attendanceReport.organizerStats[organizerEmail] || 0) + 1;

            if (meeting.onlineMeeting?.joinUrl) {
                const decodedJoinUrl = decodeURIComponent(meeting.onlineMeeting.joinUrl);
                const { meetingId, organizerId } = extractMeetingInfo(decodedJoinUrl);
                
                if (meetingId && organizerId) {
                    const records = await getAttendanceRecords(userId, meetingId, organizerId, accessToken);
                    
                    if (records.length > 0) {
                        attendanceReport.attendedMeetings++;
                        attendanceReport.detailedAttendance[meeting.id] = {
                            subject: meeting.subject,
                            startTime: meeting.start.dateTime,
                            endTime: meeting.end.dateTime,
                            records: records.map(record => ({
                                name: record.identity?.displayName || 'Unknown',
                                email: record.emailAddress || '',
                                duration: record.totalAttendanceInSeconds,
                                role: record.role,
                                attendanceIntervals: record.attendanceIntervals
                            }))
                        };

                        records.forEach(record => {
                            if (record.emailAddress) {
                                const email = record.emailAddress.toLowerCase();
                                attendanceReport.attendanceByPerson[email] = 
                                    (attendanceReport.attendanceByPerson[email] || 0) + 1;
                            }
                        });
                    }
                }
            }
        }

        return {
            meetings,
            attendanceReport
        };
    } catch (error: unknown) {
        console.error('Error fetching meetings:', error);
        throw new Error(error instanceof Error ? error.message : 'Failed to fetch meetings');
    }
}

// Test function to run the meeting fetch
export async function testMeetingFetch(userId: string): Promise<void> {
    try {
        console.log('Starting meeting fetch test for user:', userId);
        const { meetings, attendanceReport } = await fetchUserMeetings(userId);
        console.log(`Successfully fetched ${meetings.length} meetings`);
        console.log('Attendance Report:', JSON.stringify(attendanceReport, null, 2));
        
        // Log detailed attendance information
        console.log('\nDetailed Attendance Information:');
        Object.entries(attendanceReport.detailedAttendance).forEach(([meetingId, data]) => {
            console.log(`\nMeeting: ${data.subject}`);
            console.log(`Start Time: ${data.startTime}`);
            console.log('Attendees:');
            data.records.forEach(record => {
                console.log(`- ${record.name} (${record.email}): ${record.duration} seconds`);
                if (record.attendanceIntervals) {
                    record.attendanceIntervals.forEach(interval => {
                        console.log(`  Joined: ${interval.joinDateTime}`);
                        console.log(`  Left: ${interval.leaveDateTime}`);
                        console.log(`  Duration: ${interval.durationInSeconds} seconds`);
                    });
                }
            });
        });
    } catch (error) {
        console.error('Test failed:', error);
        throw error;
    }
}

// Add this test function
export async function testMeetingAnalysis() {
    const sampleMeeting = {
        id: "AAMkAGViNDU7zAC1GAAA=",
        subject: "Project Status Review - AI Agent Implementation",
        bodyPreview: "Agenda:\n1. Current progress review\n2. Technical challenges discussion\n3. Next sprint planning",
        importance: "high",
        start: {
            dateTime: "2024-03-20T10:00:00.0000000",
            timeZone: "UTC"
        },
        end: {
            dateTime: "2024-03-20T11:00:00.0000000",
            timeZone: "UTC"
        },
        attendees: [
            {
                emailAddress: { address: "organizer@example.com", name: "Meeting Organizer" },
                type: "required"
            },
            {
                emailAddress: { address: "developer1@example.com", name: "Developer One" },
                type: "required"
            }
        ],
        attendance: {
            records: [
                {
                    identity: {
                        displayName: "Meeting Organizer",
                        id: "organizer-id"
                    },
                    email: "organizer@example.com",
                    role: "Organizer",
                    totalAttendanceInSeconds: 3600,
                    intervals: [
                        {
                            joinDateTime: "2024-03-20T10:00:00.0000000",
                            leaveDateTime: "2024-03-20T11:00:00.0000000",
                            durationInSeconds: 3600
                        }
                    ]
                },
                {
                    identity: {
                        displayName: "Developer One",
                        id: "dev1-id"
                    },
                    email: "developer1@example.com",
                    role: "Attendee",
                    totalAttendanceInSeconds: 3300,
                    intervals: [
                        {
                            joinDateTime: "2024-03-20T10:05:00.0000000",
                            leaveDateTime: "2024-03-20T11:00:00.0000000",
                            durationInSeconds: 3300
                        }
                    ]
                }
            ]
        }
    };

    console.log("Testing meeting analysis with sample data:");
    console.log(JSON.stringify(sampleMeeting, null, 2));

    try {
        const formattedData = JSON.stringify(sampleMeeting, null, 2);
        const analysis = await openAIClient.analyzeMeeting(formattedData);
        
        console.log("\nAnalysis Result:");
        console.log(JSON.stringify(analysis, null, 2));
        
        return analysis;
    } catch (error) {
        console.error("Error analyzing meeting:", error);
        throw error;
    }
}

// Helper functions for parsing the analysis
function extractSections(analysisResult: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = analysisResult.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
        if (line.endsWith(':')) {
            if (currentSection) {
                sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
                currentContent = [];
            }
            currentSection = line.slice(0, -1).trim();
        } else if (currentSection && line.trim()) {
            currentContent.push(line.trim());
        }
    }

    if (currentSection) {
        sections[currentSection.toLowerCase()] = currentContent.join('\n').trim();
    }

    return sections;
}

function extractKeyPoints(keyPointsSection: string = ''): string[] {
    return keyPointsSection
        .split('\n')
        .map(point => point.replace(/^-\s*/, '').trim())
        .filter(point => point.length > 0);
}

function extractRelevanceScore(relevanceSection: string = ''): number {
    const scoreMatch = relevanceSection.match(/(\d*\.?\d+)/);
    return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
}

function extractCategories(categoriesSection: string = ''): string[] {
    return categoriesSection
        .split('\n')
        .map(category => category.replace(/^-\s*/, '').trim())
        .filter(category => category.length > 0);
}

function extractConfidenceScore(confidenceSection: string = ''): number {
    const scoreMatch = confidenceSection.match(/(\d*\.?\d+)/);
    return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
}

function extractPatterns(contextSection: string = ''): string[] {
    return contextSection
        .split('\n')
        .map(pattern => pattern.replace(/^-\s*/, '').trim())
        .filter(pattern => pattern.length > 0);
} 