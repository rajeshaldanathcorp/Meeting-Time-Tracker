export interface ReviewMeeting {
  id: string;
  userId: string;
  subject: string;
  startTime: string;
  endTime: string;
  duration: number;
  participants: string[];
  summary?: string;
  keyPoints?: string[];
  suggestedTasks?: SuggestedTask[];
  status: ReviewStatus;
  confidence: number;
  reason?: string;
}

export interface SuggestedTask {
  id: string;
  title: string;
  description?: string;
  project: string;
  module: string;
  confidence: number;
  reason: string;
}

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'no_entry_needed';

export interface ReviewDecision {
  meetingId: string;
  taskId?: string;
  status: ReviewStatus;
  feedback?: string;
  decidedAt: string;
  decidedBy: string;
}

export interface ReviewStats {
  totalPending: number;
  totalReviewed: number;
  approvalRate: number;
  averageConfidence: number;
} 