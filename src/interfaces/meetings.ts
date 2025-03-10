export interface Meeting {
    id: string;
    subject: string;
    start: {
        dateTime: string;
        timeZone: string;
    };
    end: {
        dateTime: string;
        timeZone: string;
    };
    organizer: {
        email: string;
        name?: string;
    };
    attendees?: {
        email: string;
        name?: string;
        type?: string;
    }[];
    bodyPreview?: string;
    importance?: string;
    isAllDay?: boolean;
    isCancelled?: boolean;
    categories?: string[];
    onlineMeeting?: {
        joinUrl: string;
        conferenceId?: string;
    };
}

export interface MeetingIdentity {
    displayName: string;
    id?: string;
    tenantId?: string;
}

export interface AttendanceInterval {
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
}

export interface AttendanceRecord {
    identity?: MeetingIdentity;
    emailAddress?: string;
    totalAttendanceInSeconds: number;
    role?: string;
    attendanceIntervals?: AttendanceInterval[];
}

export interface AttendanceReport {
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
                attendanceIntervals?: AttendanceInterval[];
            }[];
        };
    };
}

export interface MeetingAnalysis {
    meetingId: string;
    relevanceScore: number;
    keyPoints: string[];
    suggestedCategories: string[];
    confidence: number;
    context: {
        previousMeetings?: string[];
        relatedTasks?: string[];
        patterns?: string[];
    };
}

export interface ProcessedMeeting extends Meeting {
    analysis?: MeetingAnalysis;
    attendance?: {
        records: {
            name: string;
            email: string;
            duration: number;
            role?: string;
            attendanceIntervals?: AttendanceInterval[];
        }[];
        summary: {
            totalDuration: number;
            averageDuration: number;
            totalParticipants: number;
        };
    };
    lastProcessed: string;
    userId: string;
} 