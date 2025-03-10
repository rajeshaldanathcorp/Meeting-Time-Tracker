import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, Calendar, AlertCircle, Power } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/use-toast";
import { LogViewer } from "@/components/log-viewer";
import { Switch } from "@/components/ui/switch";
import { ReviewPanel } from './review/ReviewPanel';
import { reviewService } from '../services/review/review-service';
import { ReviewStats } from '../services/review/types';

interface PostedMeeting {
  meetingId: string;
  userId: string;
  timeEntry: {
    id: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;
    datemodified: string;
    time: string;
    description: string;
    billable: string;
    worktype: string;
    milestoneid: string | null;
    ogmilestoneid: string | null;
    module: string;
  };
  postedAt: string;
}

interface DailyCount {
  date: string;
  count: number;
}

interface UnmatchedMeeting {
  id: string;
  subject: string;
  startTime: string;
  duration: number;
  reason?: string;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

interface AIAgentViewProps {
  userId: string;
}

export function AIAgentView({ userId }: AIAgentViewProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
  const [unmatchedMeetings, setUnmatchedMeetings] = useState<UnmatchedMeeting[]>([]);
  const [totalMeetings, setTotalMeetings] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { error, success } = useToast();

  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(currentLogs => [...currentLogs, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  const fetchPostedMeetings = async () => {
    try {
      setIsLoading(true);
      addLog('Fetching posted meetings...');
      const response = await fetch('/api/posted-meetings');
      if (!response.ok) {
        throw new Error('Failed to fetch meetings');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to fetch meetings');
      }
      
      const validMeetings = (data.meetings || []).filter((meeting: PostedMeeting) => 
        meeting?.timeEntry?.date
      );
      
      setPostedMeetings(validMeetings);
      addLog(`Found ${validMeetings.length} posted meetings`, 'success');
      
      // Calculate daily counts
      const counts = validMeetings.reduce((acc: { [key: string]: number }, meeting: PostedMeeting) => {
        const date = new Date(meeting.timeEntry.date).toISOString().split('T')[0];
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {});
      
      const typedDailyCounts: DailyCount[] = Object.entries(counts)
        .map(([date, count]) => ({
          date,
          count: count as number
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      setDailyCounts(typedDailyCounts);
      setTotalMeetings(validMeetings.length);
      
      // Calculate success rate
      const totalAttempted = validMeetings.length + (data.unmatchedMeetings?.length || 0);
      const calculatedRate = totalAttempted > 0 
        ? (validMeetings.length / totalAttempted) * 100 
        : 0;
      setSuccessRate(Math.round(calculatedRate));
      
      // Set unmatched meetings
      setUnmatchedMeetings(data.unmatchedMeetings || []);
    } catch (err) {
      console.error('Error fetching posted meetings:', err);
      const message = err instanceof Error ? err.message : 'Failed to fetch meetings';
      error('Failed to fetch meetings');
      addLog(message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessMeetings = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    addLog('Starting meeting processing...', 'info');
    
    try {
      const response = await fetch('/api/test-time-entry');
      if (!response.ok) {
        throw new Error('Failed to process meetings');
      }
      
      const data = await response.json();
      console.log('AI Agent processing result:', data);
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to process meetings');
      }

      // Add detailed logs from the processing
      if (data.data.meetings) {
        addLog(`Found ${data.data.meetings.length} meetings to process`, 'info');
        data.data.meetings.forEach((meeting: any) => {
          addLog(`Processing: ${meeting.subject}`, 'info');
        });
      }

      if (data.data.matchResults) {
        data.data.matchResults.forEach((result: any) => {
          if (result.matchedTasks?.length > 0) {
            addLog(`Matched: ${result.meetingSubject} → ${result.matchedTasks[0].taskTitle}`, 'success');
          } else {
            addLog(`No match found for: ${result.meetingSubject}`, 'error');
          }
        });
      }

      if (data.data.timeEntries) {
        data.data.timeEntries.forEach((entry: any) => {
          if (entry.error) {
            addLog(`Failed to create time entry for: ${entry.meetingSubject} - ${entry.error}`, 'error');
          } else {
            addLog(`Created time entry for: ${entry.meetingSubject}`, 'success');
          }
        });
      }
      
      const successMessage = `Successfully processed ${data.data.uniqueMeetings} meetings`;
      if (data.data.uniqueMeetings > 0) {
        success(successMessage);
      }
      addLog(successMessage, 'success');
      
      await fetchPostedMeetings();
    } catch (err) {
      console.error('Error processing meetings:', err);
      const message = err instanceof Error ? err.message : 'Failed to process meetings';
      error('Failed to process meetings');
      addLog(message, 'error');
    } finally {
      setIsProcessing(false);
      addLog('Processing completed', 'info');
    }
  };

  const toggleAgent = (enabled: boolean) => {
    setAgentEnabled(enabled);
    localStorage.setItem('aiAgentEnabled', enabled.toString());
    
    if (enabled) {
      addLog('AI Agent enabled - will check for meetings every 5 minutes', 'info');
      success('AI Agent enabled');
      
      handleProcessMeetings();
      
      intervalRef.current = setInterval(() => {
        addLog('Scheduled check for new meetings...', 'info');
        handleProcessMeetings();
      }, 5 * 60 * 1000);
    } else {
      addLog('AI Agent disabled', 'info');
      success('AI Agent disabled');
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    fetchPostedMeetings();
  }, []);

  useEffect(() => {
    loadReviewStats();
  }, [userId]);

  useEffect(() => {
    const storedAgentState = localStorage.getItem('aiAgentEnabled');
    if (storedAgentState === 'true') {
      toggleAgent(true);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadReviewStats = async () => {
    try {
      const stats = await reviewService.getReviewStats(userId);
      setReviewStats(stats);
    } catch (error) {
      console.error('Error loading review stats:', error);
    }
  };

  const handleReviewComplete = () => {
    loadReviewStats();
    fetchPostedMeetings();
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">AI Agent Dashboard</CardTitle>
          <Bot className="h-8 w-8 text-blue-500" />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Automatically process your meetings and create time entries using AI.
          </p>
        </CardContent>
      </Card>

      {/* Actions Card with Log Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Power className={`h-4 w-4 ${agentEnabled ? 'text-green-500' : 'text-gray-400'}`} />
                  <span>Enable AI Agent</span>
                </div>
                <Switch 
                  checked={agentEnabled} 
                  onCheckedChange={toggleAgent}
                  disabled={isProcessing}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                When enabled, the AI Agent will automatically check for new meetings every 5 minutes.
              </div>
              
              <div className="border-t pt-4 mt-2">
                <Button 
                  className="w-full sm:w-auto"
                  onClick={handleProcessMeetings}
                  disabled={isProcessing || agentEnabled}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Meetings...
                    </>
                  ) : (
                    'Process Meetings Now'
                  )}
                </Button>
                <div className="text-sm text-muted-foreground mt-2">
                  Manually process your recent meetings and create time entries.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Viewer */}
        <LogViewer logs={logs} maxHeight="200px" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Existing Stats Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processed Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalMeetings}</div>
                <p className="text-xs text-muted-foreground">
                  Total meetings processed
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{successRate}%</div>
                <p className="text-xs text-muted-foreground">
                  Successfully processed meetings
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {dailyCounts.length > 0 
                    ? (totalMeetings / dailyCounts.length).toFixed(1) 
                    : '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  Average meetings per day
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Review Stats Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <div className="text-2xl font-bold">{reviewStats?.totalPending || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Meetings needing review
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Panel */}
      {reviewStats?.totalPending ? (
        <ReviewPanel userId={userId} onReviewComplete={handleReviewComplete} />
      ) : null}

      {/* ... rest of the existing cards ... */}
    </div>
  );
} 