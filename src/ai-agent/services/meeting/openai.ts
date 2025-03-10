import { openAIClient } from '../../core/azure-openai/client';
import { Meeting, MeetingAnalysis, ProcessedMeeting, AttendanceRecord } from '../../../interfaces/meetings';
import { storageManager } from '../../data/storage/manager';

export class MeetingService {
    private static instance: MeetingService;

    private constructor() {}

    public static getInstance(): MeetingService {
        if (!MeetingService.instance) {
            MeetingService.instance = new MeetingService();
        }
        return MeetingService.instance;
    }

    private async getGraphToken(): Promise<string> {
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

    private extractMeetingInfo(joinUrl: string): { meetingId: string | undefined; organizerId: string | undefined } {
        const result = {
            meetingId: undefined as string | undefined,
            organizerId: undefined as string | undefined
        };

        try {
            const decodedUrl = decodeURIComponent(joinUrl);
            
            const meetingMatch = decodedUrl.match(/19:meeting_([^@]+)@thread\.v2/);
            if (meetingMatch) {
                result.meetingId = `19:meeting_${meetingMatch[1]}@thread.v2`;
            }

            const organizerMatch = decodedUrl.match(/"Oid":"([^"]+)"/);
            if (organizerMatch) {
                result.organizerId = organizerMatch[1];
            }
        } catch (error) {
            console.error('Error extracting meeting info:', error);
        }

        return result;
    }

    private async getAttendanceRecords(userId: string, meetingId: string, organizerId: string, accessToken: string): Promise<AttendanceRecord[]> {
        try {
            const formattedString = `1*${organizerId}*0**${meetingId}`;
            const base64MeetingId = Buffer.from(formattedString).toString('base64');

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

            // Get attendance reports
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
                return [];
            }

            const reportsData = await reportsResponse.json();
            if (!reportsData.value || reportsData.value.length === 0) {
                return [];
            }

            const reportId = reportsData.value[0].id;

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
            return recordsData.value || [];
        } catch (error) {
            console.error('Error fetching attendance records:', error);
            return [];
        }
    }

    public async analyzeMeeting(meeting: Meeting, userId: string): Promise<ProcessedMeeting> {
        try {
            // Check if meeting was already processed
            const existingMeeting = await storageManager.getMeeting(meeting.id);
            if (existingMeeting) {
                console.log(`Meeting ${meeting.id} already processed, returning cached result`);
                return existingMeeting;
            }

            // Get attendance records if it's an online meeting
            let attendance;
            if (meeting.onlineMeeting?.joinUrl) {
                const accessToken = await this.getGraphToken();
                const { meetingId, organizerId } = this.extractMeetingInfo(meeting.onlineMeeting.joinUrl);
                
                if (meetingId && organizerId) {
                    const records = await this.getAttendanceRecords(userId, meetingId, organizerId, accessToken);
                    
                    if (records.length > 0) {
                        const attendanceRecords = records.map(record => ({
                            name: record.identity?.displayName || 'Unknown',
                            email: record.emailAddress || '',
                            duration: record.totalAttendanceInSeconds,
                            role: record.role,
                            attendanceIntervals: record.attendanceIntervals
                        }));

                        const totalDuration = attendanceRecords.reduce((sum, record) => sum + record.duration, 0);
                        
                        attendance = {
                            records: attendanceRecords,
                            summary: {
                                totalDuration,
                                averageDuration: totalDuration / attendanceRecords.length,
                                totalParticipants: attendanceRecords.length
                            }
                        };
                    }
                }
            }

            // Prepare meeting data for analysis
            const meetingData = this.prepareMeetingData(meeting);
            
            // Get AI analysis
            const analysisResult = await openAIClient.analyzeMeeting(meetingData);
            
            // Parse AI response
            const analysis = this.parseAnalysis(analysisResult, meeting.id);
            
            // Create processed meeting
            const processedMeeting: ProcessedMeeting = {
                ...meeting,
                analysis,
                attendance,
                lastProcessed: new Date().toISOString(),
                userId
            };

            // Save to storage
            await storageManager.saveMeeting(processedMeeting);

            return processedMeeting;
        } catch (error: unknown) {
            console.error('Error analyzing meeting:', error);
            throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
        }
    }

    public async getProcessedMeeting(meetingId: string): Promise<ProcessedMeeting | null> {
        try {
            return await storageManager.getMeeting(meetingId);
        } catch (error: unknown) {
            console.error('Error getting processed meeting:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to get processed meeting');
        }
    }

    public async listProcessedMeetings(userId: string): Promise<ProcessedMeeting[]> {
        try {
            return await storageManager.listMeetings(userId);
        } catch (error: unknown) {
            console.error('Error listing processed meetings:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to list processed meetings');
        }
    }

    private prepareMeetingData(meeting: Meeting): string {
        return `
Meeting Subject: ${meeting.subject}
Date: ${meeting.start.dateTime} to ${meeting.end.dateTime}
Organizer: ${meeting.organizer.email}
Attendees: ${meeting.attendees?.map(a => a.email).join(', ') || 'None'}
Preview: ${meeting.bodyPreview || 'No preview available'}
Categories: ${meeting.categories?.join(', ') || 'None'}
Importance: ${meeting.importance || 'Normal'}
Is Cancelled: ${meeting.isCancelled ? 'Yes' : 'No'}
Is All Day: ${meeting.isAllDay ? 'Yes' : 'No'}
        `.trim();
    }

    private parseAnalysis(analysisResult: string, meetingId: string): MeetingAnalysis {
        try {
            const sections = this.extractSections(analysisResult);
            
            return {
                meetingId,
                relevanceScore: this.extractRelevanceScore(sections.relevance),
                keyPoints: this.extractKeyPoints(sections.keyPoints),
                suggestedCategories: this.extractCategories(sections.categories),
                confidence: this.extractConfidenceScore(sections.confidence),
                context: {
                    patterns: this.extractPatterns(sections.context)
                }
            };
        } catch (error: unknown) {
            console.error('Error parsing analysis:', error);
            throw new Error(error instanceof Error ? error.message : 'Failed to parse analysis');
        }
    }

    private extractSections(analysisResult: string): Record<string, string> {
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

    private extractKeyPoints(keyPointsSection: string = ''): string[] {
        return keyPointsSection
            .split('\n')
            .map(point => point.replace(/^-\s*/, '').trim())
            .filter(point => point.length > 0);
    }

    private extractRelevanceScore(relevanceSection: string = ''): number {
        const scoreMatch = relevanceSection.match(/(\d*\.?\d+)/);
        return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
    }

    private extractCategories(categoriesSection: string = ''): string[] {
        return categoriesSection
            .split('\n')
            .map(category => category.replace(/^-\s*/, '').trim())
            .filter(category => category.length > 0);
    }

    private extractConfidenceScore(confidenceSection: string = ''): number {
        const scoreMatch = confidenceSection.match(/(\d*\.?\d+)/);
        return scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
    }

    private extractPatterns(contextSection: string = ''): string[] {
        return contextSection
            .split('\n')
            .map(pattern => pattern.replace(/^-\s*/, '').trim())
            .filter(pattern => pattern.length > 0);
    }
}

export const meetingService = MeetingService.getInstance(); 