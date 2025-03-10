import { IntervalsAPI } from './intervals-api';

interface Attendee {
    name: string;
    role: string;
    attendanceTime: string;
}

interface Meeting {
    title: string;
    startTime: string;
    endTime: string;
    status: string;
    platform?: string;
    attendees: Attendee[];
}

interface ProcessedMeeting {
    meetingName: string;
    date: string;
    startTime: string;
    endTime: string;
    duration?: string;
    attendanceTime: string;
    status: string;
    platform: string;
    userRole: string;
}

interface IntervalsTask {
    id: string;
    projectid: string;
    moduleid: string;
    project: string;
    module: string;
}

interface WorkType {
    id: string;
    projectid: string;
    worktype: string;
    worktypeid: string;
}

interface TimeEntryResponse {
    id: string;
    personid: string;
    taskid: string;
    date: string;
    time: number;
    description: string;
    billable: boolean;
    created: string;
    updated: string;
}

interface TimeEntryResult {
    success: boolean;
    message: string;
    data?: TimeEntryResponse;
    error?: string;
}

interface TimeEntryRequest {
    personid: string;
    date: string;
    time: number;
    projectid: string;
    moduleid: string;
    taskid: string;
    description: string;
    billable: boolean;
    worktypeid: string;
}

export class MeetingProcessor {
    constructor(private loggedInUser: string) {}

    private formatDate(dateStr: string): string {
        try {
            // Handle date format: "Tue, Jan 14, 12:23 PM"
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                throw new Error('Invalid date format');
            }
            return date.toISOString().split('T')[0];
        } catch (error) {
            console.error('Error formatting date:', error);
            // Fallback to current date if parsing fails
            return new Date().toISOString().split('T')[0];
        }
    }

    filterUserMeetings(meetings: Meeting[]): ProcessedMeeting[] {
        return meetings.map(meeting => {
            // Only get current user's attendance
            const userAttendance = meeting.attendees.find(
                attendee => attendee.name === this.loggedInUser
            );

            if (!userAttendance || meeting.status !== "Attended") return null;

            return {
                meetingName: meeting.title,
                date: this.formatDate(meeting.startTime),
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                attendanceTime: userAttendance.attendanceTime,
                status: meeting.status,
                platform: meeting.platform || 'Teams',
                userRole: userAttendance.role
            };
        }).filter((meeting): meeting is ProcessedMeeting => meeting !== null);
    }

    convertTimeToDecimal(timeString: string | number): number {
        try {
            // If timeString is already a number (seconds), convert directly to hours
            if (typeof timeString === 'number') {
                const hours = Number((timeString / 3600).toFixed(2));
                return hours > 0 ? hours : 0;
            }

            // Otherwise parse the string format
            const minutes = parseInt(timeString.match(/(\d+) minutes/)?.[1] || '0');
            const seconds = parseInt(timeString.match(/(\d+) seconds/)?.[1] || '0');
            const totalHours = Number(((minutes * 60 + seconds) / 3600).toFixed(2));
            
            if (totalHours <= 0) {
                throw new Error('Duration must be greater than 0 hours');
            }
            
            return totalHours;
        } catch (error) {
            console.error('Error converting time:', error);
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }
    }

    prepareIntervalsData(meeting: ProcessedMeeting, intervalsTask: IntervalsTask, workType: WorkType): TimeEntryRequest {
        const description = `${meeting.platform} Meeting: ${meeting.meetingName} (${meeting.userRole})`;
        
        return {
            personid: this.loggedInUser,
            date: meeting.date,
            time: this.convertTimeToDecimal(meeting.attendanceTime),
            projectid: intervalsTask.projectid,
            moduleid: intervalsTask.moduleid,
            taskid: intervalsTask.id,
            description: description.substring(0, 255), // Ensure description doesn't exceed max length
            billable: true,
            worktypeid: workType.worktypeid
        };
    }
}

export class MeetingIntervalsIntegration {
    constructor(
        private intervalsApi: IntervalsAPI,
        private meetingProcessor: MeetingProcessor
    ) {}

    async initialize() {
        try {
            const user = await this.intervalsApi.getCurrentUser();
            if (!user) {
                throw new Error('Failed to get user information');
            }

            const workTypes = await this.intervalsApi.getProjectWorkTypes();
            if (!workTypes || workTypes.length === 0) {
                throw new Error('No work types available');
            }

            return {
                user,
                workTypes
            };
        } catch (error) {
            console.error('Initialization error:', error);
            throw error;
        }
    }

    async postMeetingTime(
        meeting: ProcessedMeeting,
        matchedTask: IntervalsTask,
        workType: WorkType
    ): Promise<TimeEntryResult> {
        try {
            const timeEntry = this.meetingProcessor.prepareIntervalsData(
                meeting, 
                matchedTask,
                workType
            );

            if (timeEntry.time <= 0) {
                return {
                    success: false,
                    message: 'Invalid meeting duration',
                    error: 'Meeting duration must be greater than 0'
                };
            }

            const result = await this.intervalsApi.postTimeEntry(timeEntry);
            
            return {
                success: true,
                message: 'Time entry posted successfully',
                data: result
            };
        } catch (error) {
            console.error('Error posting time entry:', error);
            return {
                success: false,
                message: 'Failed to post time entry',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
} 