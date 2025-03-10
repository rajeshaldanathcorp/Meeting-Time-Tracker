import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReviewMeeting, ReviewStatus, SuggestedTask } from '../../services/review/types';
import { reviewService } from '../../services/review/review-service';

interface ReviewPanelProps {
  userId: string;
  onReviewComplete: () => void;
}

export function ReviewPanel({ userId, onReviewComplete }: ReviewPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [pendingReviews, setPendingReviews] = useState<ReviewMeeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<ReviewMeeting | null>(null);
  const [selectedTask, setSelectedTask] = useState<SuggestedTask | null>(null);

  useEffect(() => {
    loadPendingReviews();
  }, [userId]);

  const loadPendingReviews = async () => {
    try {
      setIsLoading(true);
      const reviews = await reviewService.getPendingReviews(userId);
      setPendingReviews(reviews);
    } catch (error) {
      console.error('Error loading pending reviews:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewDecision = async (status: ReviewStatus, taskId?: string) => {
    if (!selectedMeeting) return;

    try {
      await reviewService.submitReview({
        meetingId: selectedMeeting.id,
        taskId,
        status,
        decidedAt: new Date().toISOString(),
        decidedBy: userId
      });

      // Remove the reviewed meeting from the list
      setPendingReviews(current => 
        current.filter(meeting => meeting.id !== selectedMeeting.id)
      );
      setSelectedMeeting(null);
      setSelectedTask(null);
      onReviewComplete();
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Meetings Pending Review</span>
            <Badge variant="secondary">{pendingReviews.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingReviews.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No meetings need review
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReviews.map((meeting, index) => (
                  <TableRow 
                    key={`review-panel-${meeting.id}-${index}`}
                    className={selectedMeeting?.id === meeting.id ? 'bg-muted' : ''}
                  >
                    <TableCell>{meeting.subject}</TableCell>
                    <TableCell>{formatDate(meeting.startTime)}</TableCell>
                    <TableCell>{formatDuration(meeting.duration)}</TableCell>
                    <TableCell>{Math.round(meeting.confidence * 100)}%</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedMeeting(meeting)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedMeeting && (
        <Card>
          <CardHeader>
            <CardTitle>Review Meeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold">{selectedMeeting.subject}</h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(selectedMeeting.startTime)} • {formatDuration(selectedMeeting.duration)}
              </p>
            </div>

            {selectedMeeting.suggestedTasks && selectedMeeting.suggestedTasks.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Suggested Tasks</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedMeeting.suggestedTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>{task.project}</TableCell>
                        <TableCell>{Math.round(task.confidence * 100)}%</TableCell>
                        <TableCell>
                          <Button
                            variant={selectedTask?.id === task.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSelectedTask(task)}
                          >
                            Select
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex space-x-2 pt-4">
              <Button
                variant="default"
                onClick={() => handleReviewDecision('approved', selectedTask?.id)}
                disabled={!selectedTask}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve with Selected Task
              </Button>
              <Button
                variant="outline"
                onClick={() => handleReviewDecision('no_entry_needed')}
              >
                <XCircle className="h-4 w-4 mr-2" />
                No Time Entry Needed
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedMeeting(null)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 