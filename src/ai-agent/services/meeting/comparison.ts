import { openAIClient } from '../../core/azure-openai/client';
import { generateMeetingComparisonPrompt } from '../../core/azure-openai/prompts/meeting-comparison';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';

interface ComparisonResult {
    isDuplicate: boolean;
    confidence: number;
    reason: string;
    matchingCriteria: {
        titleMatch: boolean;
        dateMatch: boolean;
        durationMatch: boolean;
    };
}

interface BatchComparisonResult {
    duplicates: ProcessedMeeting[];
    unique: ProcessedMeeting[];
}

export class MeetingComparisonService {
    private static instance: MeetingComparisonService;
    private readonly DELAY_MS = 15000; // Increased to 15 seconds
    private readonly BATCH_SIZE = 3;   // Reduced batch size to 3

    private constructor() {}

    public static getInstance(): MeetingComparisonService {
        if (!MeetingComparisonService.instance) {
            MeetingComparisonService.instance = new MeetingComparisonService();
        }
        return MeetingComparisonService.instance;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private formatMeetingForComparison(meeting: ProcessedMeeting) {
        try {
            // Find the user's attendance record if available
            let userDuration = 0;
            if (meeting.attendance?.records && meeting.userId) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === meeting.userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                }
            }
            
            return {
                id: meeting.id,
                subject: meeting.subject,
                startTime: meeting.start?.dateTime || '',
                endTime: meeting.end?.dateTime || '',
                actualDuration: userDuration, // Use the user's actual duration
                description: meeting.bodyPreview || '',
                attendees: meeting.attendees?.map(a => a.email) || []
            };
        } catch (error) {
            console.error('Error formatting meeting for comparison:', error);
            return null;
        }
    }

    private simpleCompare(meeting1: ProcessedMeeting, meeting2: ProcessedMeeting): boolean {
        try {
            // Safely extract dates and handle potential undefined values
            const meeting1Date = meeting1?.start?.dateTime?.split('T')[0] || '';
            const meeting2Date = meeting2?.start?.dateTime?.split('T')[0] || '';
            
            if (!meeting1Date || !meeting2Date) {
                return false;
            }

            const duration1 = meeting1?.attendance?.records?.[0]?.duration || 0;
            const duration2 = meeting2?.attendance?.records?.[0]?.duration || 0;

            // Compare only meetingId, date, and duration
            // We'll check for time entry existence separately
            return meeting1.id === meeting2.id && 
                   meeting1Date === meeting2Date && 
                   Math.abs(duration1 - duration2) < 60; // 1 minute threshold
        } catch (error) {
            console.error('Error in simpleCompare:', error);
            return false;
        }
    }

    private async batchCompare(newMeetings: ProcessedMeeting[], postedMeetings: ProcessedMeeting[]): Promise<BatchComparisonResult> {
        try {
            // Load posted meetings storage to check for time entries
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();

            // First try simple comparison
            const simpleResult: BatchComparisonResult = {
                duplicates: [],
                unique: []
            };

            // Check each new meeting against posted meetings using simple comparison first
            for (const newMeeting of newMeetings) {
                let isDuplicate = false;
                
                for (const postedMeeting of postedMeetings) {
                    // Check if meeting is similar and has a time entry
                    if (this.simpleCompare(newMeeting, postedMeeting)) {
                        const hasTimeEntry = await storage.isPosted(postedMeeting.userId, postedMeeting.id);
                        if (hasTimeEntry) {
                            simpleResult.duplicates.push(newMeeting);
                            isDuplicate = true;
                            break;
                        }
                    }
                }

                if (!isDuplicate) {
                    simpleResult.unique.push(newMeeting);
                }
            }

            // If we have meetings that didn't match with simple comparison,
            // use OpenAI for more complex comparison
            if (simpleResult.unique.length > 0) {
                const formattedNewMeetings = simpleResult.unique
                    .map(m => this.formatMeetingForComparison(m))
                    .filter(m => m !== null);
                const formattedPostedMeetings = postedMeetings
                    .map(m => this.formatMeetingForComparison(m))
                    .filter(m => m !== null);

                const prompt = `
                Compare these sets of meetings and identify which new meetings are duplicates of any posted meetings.
                Pay special attention to meeting titles, dates, and actual durations.

                New Meetings:
                ${JSON.stringify(formattedNewMeetings, null, 2)}

                Posted Meetings:
                ${JSON.stringify(formattedPostedMeetings, null, 2)}

                Return a JSON object with two arrays:
                {
                    "duplicateIds": ["id1", "id2"],  // IDs of new meetings that are duplicates
                    "uniqueIds": ["id3", "id4"]      // IDs of new meetings that are unique
                }
                `;

                const response = await openAIClient.sendRequest(prompt, {
                    temperature: 0.3,
                    maxTokens: 1000
                });

                // Parse the response
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const result = JSON.parse(jsonMatch[0]);
                    
                    // Update the results based on AI analysis
                    const aiDuplicates = simpleResult.unique.filter(m => result.duplicateIds.includes(m.id));
                    const aiUnique = simpleResult.unique.filter(m => result.uniqueIds.includes(m.id));

                    return {
                        duplicates: [...simpleResult.duplicates, ...aiDuplicates],
                        unique: aiUnique
                    };
                }
            }

            return simpleResult;
        } catch (error) {
            console.error('Error in batch comparison:', error);
            // If AI comparison fails, return simple comparison results
            return {
                duplicates: [],
                unique: newMeetings
            };
        }
    }

    public async filterNewMeetings(meetings: ProcessedMeeting[]): Promise<ProcessedMeeting[]> {
        try {
            console.log(`Starting comparison of ${meetings.length} meetings against posted meetings...`);
            
            // Get posted meetings from the new storage
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();
            
            // Process meetings in smaller batches with longer delays
            const uniqueMeetings: ProcessedMeeting[] = [];
            
            for (let i = 0; i < meetings.length; i += this.BATCH_SIZE) {
                const batch = meetings.slice(i, i + this.BATCH_SIZE);
                console.log(`Processing batch ${Math.floor(i/this.BATCH_SIZE) + 1} of ${Math.ceil(meetings.length/this.BATCH_SIZE)}`);
                
                // Check each meeting in the batch
                for (const meeting of batch) {
                    const isPosted = await storage.isPosted(meeting.userId, meeting.id);
                    if (!isPosted) {
                        uniqueMeetings.push(meeting);
                    }
                }

                // Log results for this batch
                console.log(`Batch ${Math.floor(i/this.BATCH_SIZE) + 1} results:`, {
                    total: batch.length,
                    duplicates: batch.length - uniqueMeetings.length,
                    unique: uniqueMeetings.length
                });

                // Add longer delay between batches
                if (i + this.BATCH_SIZE < meetings.length) {
                    console.log(`Waiting ${this.DELAY_MS/1000} seconds before processing next batch...`);
                    await this.delay(this.DELAY_MS);
                }
            }

            console.log(`Filtered ${meetings.length - uniqueMeetings.length} duplicate meetings`);
            console.log(`Proceeding with ${uniqueMeetings.length} unique meetings`);

            return uniqueMeetings;
        } catch (error) {
            console.error('Error filtering new meetings:', error);
            throw error;
        }
    }
}

export const meetingComparisonService = MeetingComparisonService.getInstance(); 