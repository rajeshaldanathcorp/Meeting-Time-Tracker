import { Person, TimeEntry, TimeEntryResponse, WorkType, ProjectWorkType } from '../../../interfaces/time-entries';
import { ProcessedMeeting } from '../../../interfaces/meetings';
import { Task } from '../task/intervals';
import fs from 'fs/promises';
import path from 'path';
import { AIAgentPostedMeetingsStorage } from '../storage/posted-meetings';
import { TimeEntryResponse as NewTimeEntryResponse } from '@/interfaces/time-entries';

interface UserData {
    userId: string;
    email: string;
    intervalsApiKey: string;
    lastSync: string;
}

interface UserDataFile {
    users: UserData[];
    postedMeetings: string[];
}

interface PostedMeeting {
    meetingId: string;
    userId: string;
    timeEntry: TimeEntryResponse;
    rawResponse: any;
    postedAt: string;
}

interface PostedMeetingsFile {
    meetings: PostedMeeting[];
}

// Custom response type for error cases
interface TimeEntryErrorResponse {
    success: false;
    error: string;
    meetingId: string;
}

export class IntervalsTimeEntryService {
    private static instance: IntervalsTimeEntryService;
    private baseUrl: string;
    private headers: Record<string, string>;
    private postedMeetingsPath: string;

    private constructor() {
        this.baseUrl = 'https://api.myintervals.com';
        this.headers = {}; // Will be set when API key is loaded
        this.postedMeetingsPath = path.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }

    public static getInstance(): IntervalsTimeEntryService {
        if (!IntervalsTimeEntryService.instance) {
            IntervalsTimeEntryService.instance = new IntervalsTimeEntryService();
        }
        return IntervalsTimeEntryService.instance;
    }

    private async initializeHeaders(userId: string): Promise<void> {
        const apiKey = await this.getUserIntervalsApiKey(userId);
        this.headers = {
            'Authorization': `Basic ${Buffer.from(apiKey + ':X').toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    private async getUserIntervalsApiKey(userId: string): Promise<string> {
        try {
            const userDataPath = path.join(process.cwd(), '.data', 'user-data.json');
            const userData = JSON.parse(await fs.readFile(userDataPath, 'utf-8')) as UserDataFile;
            
            const user = userData.users.find(u => u.userId === userId);
            if (!user?.intervalsApiKey) {
                throw new Error(`No Intervals API key found for user ${userId}`);
            }
            
            return user.intervalsApiKey;
        } catch (error) {
            console.error('Error getting Intervals API key:', error);
            throw new Error('Failed to get Intervals API key');
        }
    }

    private async getPersonInfo(): Promise<Person> {
        try {
            const response = await fetch(`${this.baseUrl}/me/`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch person info: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Person info response:', JSON.stringify(data, null, 2));

            // Make sure we get the personid from the response
            if (!data.personid) {
                throw new Error('Person ID not found in response');
            }

            return {
                id: data.personid,  // Use personid instead of id
                firstname: data.firstname || '',
                lastname: data.lastname || '',
                email: data.email || ''
            };
        } catch (error) {
            console.error('Error fetching person info:', error);
            throw error;
        }
    }

    private async getTaskDetails(taskId: string): Promise<Task> {
        try {
            const response = await fetch(`${this.baseUrl}/task/${taskId}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch task details: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Task details response:', JSON.stringify(data, null, 2));

            if (!data.task || data.status !== 'OK') {
                throw new Error('Invalid task response format or task not found');
            }

            const taskData = data.task;
            return {
                id: taskData.id,
                title: taskData.title || '',
                description: taskData.summary || '',
                projectid: taskData.projectid,
                project: taskData.project || '',
                status: taskData.status || '',
                priority: taskData.priority || '',
                clientid: taskData.clientid || '',
                client: taskData.client || '',
                moduleid: taskData.moduleid || '',
                module: taskData.module || ''
            };
        } catch (error) {
            console.error('Error fetching task details:', error);
            throw error;
        }
    }

    private async getProjectWorkTypes(projectId: string): Promise<WorkType[]> {
        try {
            const response = await fetch(`${this.baseUrl}/projectworktype/`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch work types: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Work types response:', JSON.stringify(data, null, 2));

            if (!data.projectworktype || !Array.isArray(data.projectworktype)) {
                throw new Error('Invalid work types response format');
            }

            // Filter work types for the specific project and map with correct IDs
            const projectWorkTypes = data.projectworktype
                .filter((wt: ProjectWorkType) => wt.projectid === projectId && wt.active === 't')
                .map((wt: ProjectWorkType) => ({
                    id: wt.worktypeid,         // Use worktypeid instead of id
                    name: wt.worktype,
                    projectId: wt.projectid,
                    workTypeId: wt.worktypeid,
                    projectWorkTypeId: wt.id    // Store the projectworktype id separately if needed
                }));

            console.log(`Found ${projectWorkTypes.length} work types for project ${projectId}:`, projectWorkTypes);
            return projectWorkTypes;
        } catch (error) {
            console.error('Error fetching project work types:', error);
            throw error;
        }
    }

    private convertSecondsToDecimalHours(seconds: number): number {
        // Convert seconds to decimal hours with 2 decimal places
        // Formula: seconds / (60 * 60) = hours
        return Number((seconds / 3600).toFixed(2));
    }

    private formatDate(dateString: string): string {
        // Convert ISO date string to YYYY-MM-DD format
        return dateString.split('T')[0];
    }

    private async savePostedMeeting(meeting: ProcessedMeeting, timeEntry: TimeEntryResponse, rawResponse: any, userId: string): Promise<void> {
        try {
            console.log('Saving posted meeting with time entry...');
            
            const storage = new AIAgentPostedMeetingsStorage();
            await storage.loadData();

            // Only save the meeting in the time entry format
            const postedMeeting = {
                meetingId: meeting.id,
                userId: userId,
                timeEntry: timeEntry,
                rawResponse: rawResponse,
                postedAt: new Date().toISOString()
            };

            await storage.addPostedMeeting(userId, postedMeeting);
            
            console.log('Successfully saved posted meeting with time entry');
        } catch (error) {
            console.error('Error saving posted meeting:', error);
            throw new Error('Failed to save posted meeting data');
        }
    }

    public async createTimeEntry(
        meeting: ProcessedMeeting,
        task: { taskId: string; taskTitle: string },
        userId: string
    ): Promise<TimeEntryResponse | TimeEntryErrorResponse> {
        try {
            // Initialize headers with API key
            await this.initializeHeaders(userId);

            // Get person info and task details
            const [person, taskDetails] = await Promise.all([
                this.getPersonInfo(),
                this.getTaskDetails(task.taskId)
            ]);

            console.log('Person info:', { id: person.id, email: person.email });
            console.log('Task details:', {
                id: taskDetails.id,
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                assignees: taskDetails.assigneeid
            });

            if (!taskDetails.projectid || !taskDetails.moduleid) {
                throw new Error('Task is missing required project ID or module ID');
            }

            // Get work types for the project
            const workTypes = await this.getProjectWorkTypes(taskDetails.projectid);
            
            // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
            console.log('Using hardcoded worktype ID 802279 for India-Meeting');
            const worktypeId = '802279'; // Hardcoded ID for India-Meeting

            // Find the current user's attendance record
            let userDuration = 0;
            if (meeting.attendance?.records) {
                const userRecord = meeting.attendance.records.find(record => 
                    record.email.toLowerCase() === userId.toLowerCase()
                );
                
                if (userRecord) {
                    userDuration = userRecord.duration;
                    console.log(`Found user's attendance record with duration: ${userDuration} seconds`);
                } else {
                    console.log(`User ${userId} did not attend meeting "${meeting.subject}"`);
                    return {
                        success: false,
                        error: `User ${userId} did not attend this meeting. No attendance record found.`,
                        meetingId: meeting.id
                    } as TimeEntryErrorResponse;
                }
            } else {
                console.log(`No attendance records found for meeting "${meeting.subject}"`);
            }

            // Calculate time in decimal hours from user's attendance record
            const timeInHours = this.convertSecondsToDecimalHours(userDuration);

            if (timeInHours <= 0) {
                console.log(`User ${userId} has zero duration for meeting "${meeting.subject}". Skipping time entry creation.`);
                return {
                    success: false,
                    error: `User ${userId} has zero duration for this meeting. The meeting may not have been attended.`,
                    meetingId: meeting.id
                } as TimeEntryErrorResponse;
            }

            // Prepare time entry data according to the TimeEntry interface
            const timeEntry: TimeEntry = {
                projectid: taskDetails.projectid,
                moduleid: taskDetails.moduleid,
                taskid: taskDetails.id,
                worktypeid: worktypeId, // Use hardcoded worktype ID instead of indiaMeetingType.id
                personid: person.id,
                date: this.formatDate(meeting.start.dateTime), // Use start.dateTime from Meeting interface
                time: timeInHours,
                description: meeting.subject,
                billable: true
            };

            console.log('Creating time entry with data:', JSON.stringify(timeEntry, null, 2));

            // Create time entry
            const response = await fetch(`${this.baseUrl}/time/`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(timeEntry)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Time entry creation failed. Response:', errorText);
                throw new Error(`Failed to create time entry: ${response.status} ${response.statusText}\n${errorText}`);
            }

            // Get the raw response data
            const rawResponse = await response.json();
            console.log('Time entry creation successful. Response:', JSON.stringify(rawResponse, null, 2));

            // Parse as TimeEntryResponse
            const timeEntryResponse = rawResponse.time as TimeEntryResponse;

            // Save to posted-meetings.json
            await this.savePostedMeeting(meeting, timeEntryResponse, rawResponse, userId);

            return timeEntryResponse;
        } catch (error) {
            console.error('Error creating time entry:', error);
            throw error;
        }
    }
}

export const timeEntryService = IntervalsTimeEntryService.getInstance(); 