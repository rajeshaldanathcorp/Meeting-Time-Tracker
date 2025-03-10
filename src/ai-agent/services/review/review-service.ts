import { ReviewMeeting, ReviewDecision, ReviewStats, ReviewStatus } from './types';
import { storageManager } from '../../data/storage/manager';

class ReviewService {
  private static instance: ReviewService;
  private readonly CONFIDENCE_THRESHOLD = 0.7;

  private constructor() {}

  public static getInstance(): ReviewService {
    if (!ReviewService.instance) {
      ReviewService.instance = new ReviewService();
    }
    return ReviewService.instance;
  }

  public async queueForReview(meeting: ReviewMeeting): Promise<void> {
    try {
      // Store the meeting in the review queue
      await storageManager.storeMeetingForReview(meeting);
      
      // Log the review request
      console.log(`Meeting queued for review: ${meeting.id} - ${meeting.subject}`);
    } catch (error) {
      console.error('Error queuing meeting for review:', error);
      throw error;
    }
  }

  public async getPendingReviews(userId: string): Promise<ReviewMeeting[]> {
    try {
      const reviews = await storageManager.getPendingReviews(userId);
      return reviews.sort((a, b) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    } catch (error) {
      console.error('Error getting pending reviews:', error);
      throw error;
    }
  }

  public async submitReview(decision: ReviewDecision): Promise<void> {
    try {
      // Update the meeting status
      await storageManager.updateReviewStatus(decision);
      
      // If approved with a task, create time entry
      if (decision.status === 'approved' && decision.taskId) {
        const meeting = await storageManager.getMeetingForReview(decision.meetingId, decision.decidedBy);
        if (meeting) {
          // Create time entry using the selected task
          // This would typically be handled by the time entry service
          // timeEntryService.createTimeEntry(meeting, decision.taskId);
        }
      }
      
      // Store the decision for learning
      await this.storeDecisionForLearning(decision);
      
      console.log(`Review submitted for meeting ${decision.meetingId}`);
    } catch (error) {
      console.error('Error submitting review:', error);
      throw error;
    }
  }

  public async getReviewStats(userId: string): Promise<ReviewStats> {
    try {
      const allReviews = await storageManager.getAllReviews(userId);
      
      const totalReviews = allReviews.length;
      const pendingReviews = allReviews.filter(r => r.status === 'pending');
      const reviewedMeetings = allReviews.filter(r => r.status !== 'pending');
      const approvedMeetings = allReviews.filter(r => r.status === 'approved');
      
      const stats: ReviewStats = {
        totalPending: pendingReviews.length,
        totalReviewed: reviewedMeetings.length,
        approvalRate: reviewedMeetings.length > 0 
          ? (approvedMeetings.length / reviewedMeetings.length) * 100 
          : 0,
        averageConfidence: allReviews.reduce((acc, curr) => acc + curr.confidence, 0) / totalReviews || 0
      };
      
      return stats;
    } catch (error) {
      console.error('Error getting review stats:', error);
      throw error;
    }
  }

  public shouldReview(confidence: number): boolean {
    return confidence < this.CONFIDENCE_THRESHOLD;
  }

  private async storeDecisionForLearning(decision: ReviewDecision): Promise<void> {
    try {
      await storageManager.storeReviewDecision(decision);
    } catch (error) {
      console.error('Error storing review decision for learning:', error);
      // Don't throw here as this is not critical for the main flow
    }
  }
}

export const reviewService = ReviewService.getInstance(); 