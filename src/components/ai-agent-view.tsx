import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
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
import { LogViewer } from "./log-viewer";
import { Switch } from "@/components/ui/switch";
import { MeetingMatches } from "./meeting-matches";
import type { MatchResult } from "@/lib/types";
import { useSession } from "next-auth/react";

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

interface MatchedTask {
  taskId: string;
  taskTitle: string;
  meetingDetails: {
    subject: string;
    startTime: string;
    endTime: string;
    actualDuration: number;
  };
  confidence: number;
  reason: string;
}

export function AIAgentView() {
  const { data: session } = useSession();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
  const [unmatchedMeetings, setUnmatchedMeetings] = useState<UnmatchedMeeting[]>([]);
  const [totalMeetings, setTotalMeetings] = useState(0);
  const [successRate, setSuccessRate] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentEnabled, setAgentEnabled] = useState(false);
  const [matchResults, setMatchResults] = useState<{
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  }>({
    high: [],
    medium: [],
    low: [],
    unmatched: []
  });
  const [matchSummary, setMatchSummary] = useState({
    total: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    unmatched: 0
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { error, success } = useToast();

  const addLog = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setLogs(currentLogs => [...currentLogs, {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    }]);
  };

  useEffect(() => {
    fetchPostedMeetings();
    // Load unmatched meetings from localStorage
    const storedUnmatched = localStorage.getItem('unmatchedMeetings');
    if (storedUnmatched) {
      setUnmatchedMeetings(JSON.parse(storedUnmatched));
    }
  }, []);

  // Save unmatched meetings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('unmatchedMeetings', JSON.stringify(unmatchedMeetings));
  }, [unmatchedMeetings]);

  // Update handleMeetingPosted to remove from localStorage
  const handleMeetingPosted = (meetingKey: string) => {
    console.log('Meeting posted with key:', meetingKey);
    
    // Extract the meeting ID from the key if possible
    const parts = meetingKey.split('_');
    const meetingId = parts.length >= 3 ? parts[2] : meetingKey;
    
    // Remove from unmatched meetings
    setUnmatchedMeetings(prev => prev.filter(m => m.id !== meetingId));
    
    // Update matchResults to remove the posted meeting based on the meeting ID
    setMatchResults(prev => ({
      high: prev.high.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
      medium: prev.medium.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
      low: prev.low.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId),
      unmatched: prev.unmatched.filter(m => m.meeting.meetingInfo?.meetingId !== meetingId)
    }));
    
    // Refresh the meetings list
    fetchPostedMeetings();
  };

  const fetchPostedMeetings = async () => {
    setIsLoading(true);
    try {
      // Fetch posted meetings
      const response = await fetch('/api/posted-meetings');
      if (!response.ok) {
        throw new Error('Failed to fetch posted meetings');
      }
      
      const data = await response.json();
      console.log('Posted meetings data:', data);
      
      setPostedMeetings(data.meetings || []);
      setDailyCounts(data.dailyCounts || []);
      
      // Also fetch meetings from reviews.json
      try {
        const reviewsResponse = await fetch('/api/reviews');
        if (reviewsResponse.ok) {
          const reviewsData = await reviewsResponse.json();
          console.log('Reviews data:', reviewsData);
          
          // Add pending review meetings to unmatched meetings
          if (reviewsData.reviews && reviewsData.reviews.length > 0) {
            const pendingReviews = reviewsData.reviews.filter((review: any) => review.status === 'pending');
            console.log(`Found ${pendingReviews.length} pending reviews for current user`);
            
            // Convert review meetings to unmatched meetings format
            const reviewMeetings = pendingReviews.map((review: any) => ({
              id: review.id,
              subject: review.subject,
              startTime: review.startTime,
              duration: review.duration,
              reason: review.reason || 'No matching task found'
            }));
            
            // Deduplicate meetings by ID
            const existingIds = new Set(unmatchedMeetings.map(m => m.id));
            const uniqueReviewMeetings = reviewMeetings.filter((m: UnmatchedMeeting) => !existingIds.has(m.id));
            
            console.log(`Adding ${uniqueReviewMeetings.length} unique pending reviews to unmatched meetings`);
            
            // Only add unique meetings
            if (uniqueReviewMeetings.length > 0) {
              setUnmatchedMeetings(prev => [...prev, ...uniqueReviewMeetings]);
              
              // Also add to match results for display in the UI
              const unmatchedResults = uniqueReviewMeetings.map((meeting: UnmatchedMeeting) => {
                const startTime = new Date(meeting.startTime);
                const endTime = new Date(startTime.getTime() + (meeting.duration * 1000));
                
                return {
                  meeting: {
                    subject: meeting.subject,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    isTeamsMeeting: true,
                    attendanceRecords: [{
                      name: session?.user?.name || 'User',
                      email: session?.user?.email || '',
                      duration: meeting.duration,
                      role: 'Organizer',
                      intervals: [{
                        joinDateTime: startTime.toISOString(),
                        leaveDateTime: endTime.toISOString(),
                        durationInSeconds: meeting.duration
                      }]
                    }],
                    meetingInfo: {
                      meetingId: meeting.id
                    }
                  },
                  confidence: 0,
                  reason: meeting.reason || 'No matching task found',
                  matchDetails: {
                    titleSimilarity: 0,
                    projectRelevance: 0,
                    contextMatch: 0,
                    timeRelevance: 0
                  },
                  selectedTask: null
                };
              });
              
              setMatchResults(prev => ({
                ...prev,
                unmatched: [...prev.unmatched, ...unmatchedResults]
              }));
              
              setMatchSummary(prev => ({
                ...prev,
                unmatched: prev.unmatched + uniqueReviewMeetings.length,
                total: prev.total + uniqueReviewMeetings.length
              }));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      }
    } catch (err) {
      console.error('Error fetching posted meetings:', err);
      error("Failed to fetch posted meetings");
    } finally {
      setIsLoading(false);
    }
  };

  const processMeetings = async () => {
    if (isProcessing) return; // Prevent multiple simultaneous processing
    
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

      // Update match results and summary
      if (data.data.matchResults) {
        const results = {
          high: [] as MatchResult[],
          medium: [] as MatchResult[],
          low: [] as MatchResult[],
          unmatched: [] as MatchResult[]
        };
        
        data.data.matchResults.forEach((result: any) => {
          // Handle both API response formats
          const meetingSubject = result.meeting?.subject || result.meetingSubject;
          const meetingId = result.meeting?.id || result.meetingId;
          
          if (result.matchedTask && result.confidence >= 0.8) {
            results.high.push(result);
            addLog(`High confidence match (${result.confidence}) found for: ${meetingSubject}`, 'success');
          } else if (result.matchedTask && result.confidence >= 0.5) {
            results.medium.push(result);
            addLog(`Medium confidence match (${result.confidence}) found for: ${meetingSubject}`, 'info');
          } else if (result.matchedTask && result.confidence > 0) {
            results.low.push(result);
            addLog(`Low confidence match (${result.confidence}) found for: ${meetingSubject}`, 'error');
          } else {
            // For unmatched meetings, create a compatible structure
            const now = new Date();
            const getValidDate = (dateStr: string | undefined | null) => {
              if (!dateStr) return now;
              try {
                const date = new Date(dateStr);
                return isNaN(date.getTime()) ? now : date;
              } catch {
                return now;
              }
            };

            // Calculate duration ensuring it's positive and valid, following intervals.ts logic
            const convertSecondsToDecimalHours = (seconds: number): number => {
              return Number((seconds / 3600).toFixed(2));
            };

            const startTime = getValidDate(result.meeting?.startTime || result.startTime);
            const endTime = getValidDate(result.meeting?.endTime || result.endTime);
            
            // Calculate duration in seconds first
            const durationInSeconds = Math.max(
              result.attendance?.records?.[0]?.duration || 
              Math.floor((endTime.getTime() - startTime.getTime()) / 1000),
              1800 // Minimum 30 minutes
            );

            // Convert to decimal hours for time entry
            const timeInHours = convertSecondsToDecimalHours(durationInSeconds);

            // Get user email from the session, following intervals.ts pattern
            const userEmail = result.organizer?.email || 
                            result.attendance?.records?.[0]?.email || 
                            'ramesh@m365x65088219.onmicrosoft.com';

            // Check if the current user has attendance record with valid duration
            const userAttendance = result.attendance?.records?.find(
              (record: any) => record.email === userEmail
            );
            
            // Only check duration, don't require user attendance for unmatched meetings
            // This allows meetings with valid duration to be shown even if they're unmatched
            if (timeInHours <= 0) {
              console.info('Skipping meeting due to zero duration:', {
                subject: meetingSubject,
                duration: timeInHours
              });
              addLog(`Skipped meeting with zero duration: ${meetingSubject}`, 'info');
              return;
            }

            // Create attendance record with proper structure and validation
            const attendanceRecord = {
              name: result.organizer?.name || result.attendance?.records?.[0]?.name || 'Ramesh',
              email: userEmail,
              duration: durationInSeconds,
              role: 'Organizer',
              intervals: [{
                joinDateTime: startTime.toISOString(),
                leaveDateTime: endTime.toISOString(),
                durationInSeconds: durationInSeconds
              }]
            };

            const unmatchedResult: MatchResult = {
              meeting: {
                subject: meetingSubject || 'Untitled Meeting',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                isTeamsMeeting: true,
                attendanceRecords: [attendanceRecord],
                meetingInfo: {
                  meetingId: meetingId || `unmatched-${Date.now()}`
                }
              },
              confidence: 0,
              reason: 'No matching task found',
              matchDetails: {
                titleSimilarity: 0,
                projectRelevance: 0,
                contextMatch: 0,
                timeRelevance: 0
              },
              selectedTask: result.selectedTask || null
            };

            // Only add to unmatched if we have valid duration and meeting info
            // We don't require hasValidAttendance here to allow all meetings with duration
            if (timeInHours > 0 && meetingId) {
              results.unmatched.push(unmatchedResult);
              addLog(`No match found for: ${meetingSubject}`, 'error');
              
              // Update unmatchedMeetings state with validated data
              setUnmatchedMeetings(prev => [...prev, {
                id: meetingId,
                subject: meetingSubject || 'Untitled Meeting',
                startTime: startTime.toISOString(),
                duration: durationInSeconds,
                reason: 'No matching task found'
              }]);
            } else {
              addLog(`Skipped invalid meeting: ${meetingSubject} (Invalid duration or missing ID)`, 'error');
            }
          }
        });

        setMatchResults(results);
        setMatchSummary({
          total: data.data.matchResults.length,
          highConfidence: results.high.length,
          mediumConfidence: results.medium.length,
          lowConfidence: results.low.length,
          unmatched: results.unmatched.length
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
      
      // Refresh posted meetings after processing
      await fetchPostedMeetings();
    } catch (err) {
      console.error('Error processing meetings:', err);
      const message = err instanceof Error ? err.message : 'Failed to process meetings';
      error(message);
      addLog(message, 'error');
    } finally {
      setIsProcessing(false);
      addLog('Processing completed', 'info');
    }
  };

  const handleProcessMeetings = async () => {
    await processMeetings();
  };

  // Initialize agent state from localStorage on component mount
  useEffect(() => {
    const storedAgentState = localStorage.getItem('aiAgentEnabled');
    if (storedAgentState === 'true') {
      // We need to use this approach instead of directly setting state
      // to ensure the toggle function is called properly
      toggleAgent(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAgent = (enabled: boolean) => {
    setAgentEnabled(enabled);
    
    // Store the state in localStorage
    localStorage.setItem('aiAgentEnabled', enabled.toString());
    
    if (enabled) {
      addLog('AI Agent enabled - will check for meetings every 5 minutes', 'info');
      success('AI Agent enabled');
      
      // Start the interval
      processMeetings(); // Process immediately when enabled
      
      intervalRef.current = setInterval(() => {
        addLog('Scheduled check for new meetings...', 'info');
        processMeetings();
      }, 5 * 60 * 1000); // 5 minutes in milliseconds
    } else {
      addLog('AI Agent disabled', 'info');
      success('AI Agent disabled');
      
      // Clear the interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${minutes}m`;
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

      {/* Actions Card */}
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

      {/* Meeting Matches */}
      <Card>
        <CardHeader>
          <CardTitle>Meeting Review</CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingMatches
            summary={matchSummary}
            matches={matchResults}
            onMeetingPosted={handleMeetingPosted}
            postedMeetingIds={postedMeetings.map(m => m.meetingId)}
          />
        </CardContent>
      </Card>

      {/* Recently Posted Meetings */}
      <Card>
        <CardHeader className="flex flex-row items-center space-y-0 pb-2">
          <CardTitle>Recently Posted Meetings</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : postedMeetings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Work Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postedMeetings.map((meeting) => (
                  <TableRow key={meeting.meetingId}>
                    <TableCell>{meeting.timeEntry.date}</TableCell>
                    <TableCell>{meeting.timeEntry.description}</TableCell>
                    <TableCell>{meeting.timeEntry.time}h</TableCell>
                    <TableCell>{meeting.timeEntry.module}</TableCell>
                    <TableCell>{meeting.timeEntry.worktype}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No meetings posted yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 