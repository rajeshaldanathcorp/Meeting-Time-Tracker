export interface Meeting {
  subject: string;
  description?: string;
  startTime: string;
  endTime: string;
  isTeamsMeeting: boolean;
  organizer?: string;
  meetingInfo?: {
    meetingId: string;
  };
  attendanceRecords: AttendanceRecord[];
}

export interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: {
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }[];
  role?: string;
}

export interface Task {
  id: string;
  title: string;
  project: string;
  module: string;
  status: string;
}

export interface MatchDetails {
  titleSimilarity: number;
  projectRelevance: number;
  contextMatch: number;
  timeRelevance: number;
}

export interface MatchResult {
  meeting: Meeting;
  matchedTask?: Task;
  selectedTask?: Task;
  confidence: number;
  reason: string;
  matchDetails: MatchDetails;
  suggestedAlternatives?: Task[];
}

export interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
} 