'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { IntervalsKeyDialog } from "@/components/intervals-key-dialog";
import { UserStorage } from "@/lib/user-storage";
import { Settings2, Loader2, Moon, Sun, Menu, LogOut } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { MeetingMatches } from '@/components/meeting-matches';
import { DateRangePicker } from '@/components/date-range-picker';
import { DateRange } from 'react-day-picker';
import { Logo } from '@/components/ui/logo';
import { PostedMeetings } from "@/components/posted-meetings";
import { useTheme } from "next-themes";
import { Sidebar } from '@/components/ui/sidebar';
import { PostedMeetingsView } from '@/components/posted-meetings-view';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIAgentView } from '@/components/ai-agent-view';

interface RawAttendanceRecord {
  identity: {
    displayName: string;
  };
  emailAddress: string;
  totalAttendanceInSeconds: number;
  attendanceIntervals: Array<{
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }>;
  role?: string;
}

interface RawMeetingData {
  subject: string;
  description?: string;
  start: {
    dateTime: string;
  };
  end: {
    dateTime: string;
  };
  onlineMeeting?: {
    joinUrl: string;
  };
}

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: {
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }[];
  rawRecord: RawAttendanceRecord;
}

interface Meeting {
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
  rawData: RawMeetingData;
  isPosted: boolean;
}

interface MeetingsResponse {
  totalMeetings: number;
  timeRange: {
    start: string;
    end: string;
  };
  meetings: Meeting[];
}

interface MatchDetails {
  titleSimilarity: number;
  projectRelevance: number;
  contextMatch: number;
  timeRelevance: number;
}

interface Task {
  id: string;
  title: string;
  project: string;
  module: string;
  status: string;
}

interface MatchResult {
  meeting: Meeting;
  matchedTask?: Task;
  confidence: number;
  reason: string;
  matchDetails: MatchDetails;
  suggestedAlternatives?: Task[];
}

interface MatchBatchResult {
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
  summary: {
    processed: number;
    totalMeetings: number;
  };
  nextBatch: number | null;
}

interface MatchResponse {
  summary: {
    total: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    unmatched: number;
  };
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
}

interface OpenAIStatus {
  status: 'success' | 'error' | 'pending';
  isAvailable: boolean;
  message: string;
}

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [meetingsData, setMeetingsData] = useState<MeetingsResponse | null>(null);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
  const [intervalsApiKey, setIntervalsApiKey] = useState<string | null>(null);
  const [openAIStatus, setOpenAIStatus] = useState<OpenAIStatus>({
    status: 'pending',
    isAvailable: false,
    message: 'Checking status...'
  });
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [postedMeetingIds, setPostedMeetingIds] = useState<string[]>(() => {
    // Load posted meeting IDs from localStorage on component mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('postedMeetingIds');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [matchResults, setMatchResults] = useState<MatchResponse | null>(null);
  const { theme, setTheme } = useTheme();
  const [currentView, setCurrentView] = useState('dashboard');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [totalAttendanceSeconds, setTotalAttendanceSeconds] = useState(0);
  const [rawMeetingsData, setRawMeetingsData] = useState<MeetingsResponse | null>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      setMeetingsLoading(true);
      const params = new URLSearchParams();
      if (dateRange?.from) {
        params.append('from', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        params.append('to', dateRange.to.toISOString());
      }
      
      const response = await fetch(`/api/meetings?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch meetings');
      }
      const rawData = await response.json();
      
      // Store raw data before filtering
      setRawMeetingsData(rawData);
      
      // Filter out posted meetings for display
      const filteredMeetings = {
        ...rawData,
        meetings: rawData.meetings.filter((meeting: Meeting) => !meeting.isPosted)
      };
      
      setMeetingsData(filteredMeetings);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
      toast("❌ Failed to fetch meetings");
    } finally {
      setMeetingsLoading(false);
    }
  }, [dateRange, toast, session?.user?.name]);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/intervals/tasks');
      if (!response.ok) {
        if (response.status === 401) {
          toast("🔑 Invalid API key");
        } else {
          toast("❌ Failed to fetch tasks from Intervals");
        }
        return;
      }
      return await response.json();
    } catch {
      toast("❌ Error connecting to Intervals API. Please check your configuration.");
    }
  }, [toast]);

  // Save match results to localStorage whenever they change
  useEffect(() => {
    if (matchResults) {
      localStorage.setItem('taskMatches', JSON.stringify(matchResults));
    }
  }, [matchResults]);

  // Save postedMeetingIds to localStorage whenever it changes
  useEffect(() => {
    if (postedMeetingIds.length > 0) {
      localStorage.setItem('postedMeetingIds', JSON.stringify(postedMeetingIds));
    }
  }, [postedMeetingIds]);

  // Filter out posted meetings from meetingsData whenever it changes
  useEffect(() => {
    if (meetingsData && meetingsData.meetings) {
      const filteredMeetings = {
        ...meetingsData,
        meetings: meetingsData.meetings.filter(meeting => 
          !postedMeetingIds.includes(meeting.meetingInfo?.meetingId || meeting.subject)
        )
      };
      setMeetingsData(filteredMeetings);
    }
  }, [postedMeetingIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Add handler for date range changes
  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    setDateRange(newRange);
    if (newRange?.from && newRange?.to) {
      localStorage.setItem('meetingsDateRange', JSON.stringify({
        from: newRange.from.toISOString(),
        to: newRange.to.toISOString()
      }));
    }
  };

  // Clear saved date range on logout
  const handleSignOut = () => {
    localStorage.removeItem('meetingsDateRange');
    signOut();
  };

  const fetchPostedMeetings = async () => {
    try {
      console.log('Fetching posted meetings...');
      const response = await fetch('/api/meetings/posted');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched posted meetings:', data);
        setPostedMeetings(data.meetings || []);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch posted meetings:', errorText);
      }
    } catch (error) {
      console.error('Error fetching posted meetings:', error);
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated' && dateRange?.from && dateRange?.to) {
      fetchMeetings();
    }
  }, [status, dateRange, fetchMeetings]);

  useEffect(() => {
    const checkOpenAIStatus = async () => {
      try {
        const response = await fetch('/api/openai-status');
        const data = await response.json();
        setOpenAIStatus(data);
      } catch (error) {
        console.error('Error checking OpenAI status:', error);
        setOpenAIStatus({
          status: 'error',
          isAvailable: false,
          message: 'Failed to check status'
        });
      }
    };

    checkOpenAIStatus();
  }, []);

  useEffect(() => {
    const checkApiKey = async () => {
      if (session?.user?.email) {
        const storage = new UserStorage();
        const apiKey = storage.getUserApiKey(session.user.email);
        setIntervalsApiKey(apiKey);
        
        // Always show the dialog if there's no API key
        if (!apiKey) {
          console.log('No API key found for user:', session.user.email);
          setShowApiKeyDialog(true);
        } else {
          console.log('Found existing API key for user:', session.user.email);
        }
      }
    };

    if (status === 'authenticated') {
      checkApiKey();
    }
  }, [status, session]);

  useEffect(() => {
    if (status === 'authenticated') {
      console.log('Loading posted meetings...');
      fetchPostedMeetings();
    }
  }, [status]);

  // Add effect to fetch tasks when API key is available
  useEffect(() => {
    if (intervalsApiKey) {
      fetchTasks();
    }
  }, [intervalsApiKey, fetchTasks]);

  const handleApiKeySubmit = async (apiKey: string) => {
    try {
      const response = await fetch('/api/intervals/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to validate API key');
      }

      if (session?.user?.email) {
        const storage = new UserStorage();
        storage.setUserApiKey(session.user.email, session.user.email, apiKey);
        setIntervalsApiKey(apiKey);
        toast("✅ Your Intervals API key has been saved successfully.");
      }
      setShowApiKeyDialog(false);
    } catch (error) {
      toast("❌ " + (error instanceof Error ? error.message : 'Failed to validate API key'));
    }
  };

  const matchMeetings = async () => {
    if (!meetingsData?.meetings) return;
    
    setIsMatching(true);
    let currentIndex = 0;
    const allResults: MatchResult[] = [];

    try {
      while (currentIndex < meetingsData.meetings.length) {
        console.log(`Processing batch starting at index ${currentIndex}`);
        
        const response = await fetch('/api/meetings/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            meetings: meetingsData.meetings,
            startIndex: currentIndex 
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to match meetings');
        }

        const data: MatchBatchResult = await response.json();
        
        // Merge results
        if (data.matches.high) allResults.push(...data.matches.high);
        if (data.matches.medium) allResults.push(...data.matches.medium);
        if (data.matches.low) allResults.push(...data.matches.low);
        if (data.matches.unmatched) allResults.push(...data.matches.unmatched);

        // Update progress
        const progress = Math.round((data.summary.processed / data.summary.totalMeetings) * 100);
        toast(`Processed ${data.summary.processed} of ${data.summary.totalMeetings} meetings (${progress}%)`);

        if (data.nextBatch === null) {
          // All meetings processed
          break;
        }

        // Wait before processing next batch
        await new Promise(resolve => setTimeout(resolve, 2000));
        currentIndex = data.nextBatch;
      }

      // Final results
      const finalResults = {
        summary: {
          total: allResults.length,
          highConfidence: allResults.filter(r => r.confidence >= 0.8).length,
          mediumConfidence: allResults.filter(r => r.confidence >= 0.5 && r.confidence < 0.8).length,
          lowConfidence: allResults.filter(r => r.confidence > 0 && r.confidence < 0.5).length,
          unmatched: allResults.filter(r => r.confidence === 0 || !r.matchedTask).length
        },
        matches: {
          high: allResults.filter(r => r.confidence >= 0.8),
          medium: allResults.filter(r => r.confidence >= 0.5 && r.confidence < 0.8),
          low: allResults.filter(r => r.confidence > 0 && r.confidence < 0.5),
          unmatched: allResults.filter(r => r.confidence === 0 || !r.matchedTask)
        }
      };

      setMatchResults(finalResults);
      toast.success("Match Completed", {
        position: "top-center",
        duration: 3000,
        style: {
          backgroundColor: "#22c55e",
          color: "white",
          fontSize: "16px",
          borderRadius: "8px",
          padding: "12px 24px"
        }
      });
    } catch (error) {
      console.error('Error in batch processing:', error);
      toast(error instanceof Error ? error.message : 'Failed to match meetings');
    } finally {
      setIsMatching(false);
    }
  };

  const handleMeetingPosted = async (meetingId: string) => {
    // Add the meeting ID to postedMeetingIds
    setPostedMeetingIds(prev => {
      const newIds = [...prev, meetingId];
      localStorage.setItem('postedMeetingIds', JSON.stringify(newIds));
      return newIds;
    });

    // Refresh the posted meetings list
    console.log('Refreshing posted meetings after posting:', meetingId);
    await fetchPostedMeetings();

    // Update the match results to remove the posted meeting
    if (matchResults) {
      const newMatchResults = {
        ...matchResults,
        matches: {
          high: matchResults.matches.high.filter(m => (m.meeting.meetingInfo?.meetingId || m.meeting.subject) !== meetingId),
          medium: matchResults.matches.medium.filter(m => (m.meeting.meetingInfo?.meetingId || m.meeting.subject) !== meetingId),
          low: matchResults.matches.low.filter(m => (m.meeting.meetingInfo?.meetingId || m.meeting.subject) !== meetingId),
          unmatched: matchResults.matches.unmatched.filter(m => (m.meeting.meetingInfo?.meetingId || m.meeting.subject) !== meetingId)
        }
      };
      setMatchResults(newMatchResults);
    }

    // Add a small delay before refreshing meetings to ensure the backend is updated
    await new Promise(resolve => setTimeout(resolve, 500));
    await fetchMeetings();
  };

  // Add reset handler after other handlers
  const handleReset = async () => {
    // Clear posted meetings from localStorage
    localStorage.removeItem('postedMeetingIds');
    setPostedMeetingIds([]);
    
    // Clear posted meetings from storage
    try {
      const response = await fetch('/api/meetings/posted', {
        method: 'DELETE'
      });
      
      if (response.ok) {
        toast("All posted meetings have been cleared.");
        // Refresh the posted meetings list
        setPostedMeetings([]);
        // Refresh meetings to show previously posted meetings again
        fetchMeetings();
      } else {
        toast("Failed to clear posted meetings.");
      }
    } catch (error) {
      console.error('Error resetting posted meetings:', error);
      toast("An error occurred while clearing posted meetings.");
    }
  };

  const getLastPostedDate = () => {
    if (postedMeetings.length === 0) return null;
    return postedMeetings[postedMeetings.length - 1].postedDate;
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const totalMeetings = meetingsData?.meetings?.length || 0;
  
  const averageAttendanceSeconds = totalMeetings > 0 ? Math.round(totalAttendanceSeconds / totalMeetings) : 0;

  const getDateRangeText = () => {
    if (!dateRange?.from || !dateRange?.to) return 'Select date range';
    return `${formatDate(dateRange.from.toISOString())} - ${formatDate(dateRange.to.toISOString())}`;
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'posted-meetings':
        return <PostedMeetingsView />;
      case 'ai-agent':
        return <AIAgentView />;
      default:
        return (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="w-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6">
                  <CardTitle className="text-sm font-medium">Meetings Overview</CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  <div className="text-xl sm:text-2xl font-bold">
                    {meetingsLoading ? (
                      <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                    ) : (
                      meetingsData?.meetings.length || 0
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Meetings waiting to be posted
                  </p>
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>Total meetings in period:</span>
                      <span className="font-medium">{rawMeetingsData?.meetings.length || 0}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {getDateRangeText()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="w-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6">
                  <CardTitle className="text-sm font-medium">Time Summary</CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  <div className="text-xl sm:text-2xl font-bold">
                    {meetingsLoading ? (
                      <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                    ) : (
                      formatDuration(meetingsData?.meetings.reduce((acc, meeting) => {
                        if (meeting.attendanceRecords?.length) {
                          const userRecord = meeting.attendanceRecords.find(record => record.name === session?.user?.name);
                          return acc + (userRecord?.duration || 0);
                        }
                        return acc;
                      }, 0) || 0)
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Time in meetings waiting to be posted
                  </p>
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>Total time in all meetings:</span>
                      <span className="font-medium">{formatDuration(rawMeetingsData?.meetings.reduce((acc, meeting) => {
                        if (meeting.attendanceRecords?.length) {
                          const userRecord = meeting.attendanceRecords.find(record => record.name === session?.user?.name);
                          return acc + (userRecord?.duration || 0);
                        }
                        return acc;
                      }, 0) || 0)}</span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="w-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 sm:px-6">
                  <CardTitle className="text-sm font-medium">Last Update</CardTitle>
                </CardHeader>
                <CardContent className="px-4 sm:px-6">
                  <div className="text-xl sm:text-2xl font-bold">
                    {meetingsLoading ? (
                      <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" />
                    ) : getLastPostedDate() ? (
                      new Date(getLastPostedDate()!).toLocaleDateString()
                    ) : (
                      'No posts yet'
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Most recent meeting posted to Intervals
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Meetings Section */}
            {!dateRange?.from || !dateRange?.to ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold">Add New Meeting</h2>
                  <p className="text-muted-foreground">Select a date range to fetch your meetings</p>
                </div>
                <DateRangePicker
                  dateRange={dateRange}
                  onDateRangeChange={handleDateRangeChange}
                />
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Fetched Meetings</h2>
                  <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleReset}
                      className="gap-2 w-full sm:w-auto"
                    >
                      <Loader2 className="h-4 w-4" />
                      Reset Posted
                    </Button>
                    <Button 
                      onClick={matchMeetings} 
                      disabled={isMatching} 
                      variant="default" 
                      size="sm"
                      className="w-full sm:w-auto"
                    >
                      {isMatching ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Matching...
                        </>
                      ) : (
                        'Match Tasks'
                      )}
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="inline-block min-w-full align-middle px-4 sm:px-0">
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="whitespace-nowrap bg-gray-50/75 px-4 py-3">Meeting</TableHead>
                            <TableHead className="whitespace-nowrap bg-gray-50/75 px-4 py-3 hidden md:table-cell">Time</TableHead>
                            <TableHead className="whitespace-nowrap bg-gray-50/75 px-4 py-3 hidden sm:table-cell">Duration</TableHead>
                            <TableHead className="whitespace-nowrap bg-gray-50/75 px-4 py-3">Attendance</TableHead>
                            <TableHead className="whitespace-nowrap bg-gray-50/75 px-4 py-3 text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {meetingsLoading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8">
                                <div className="flex items-center justify-center">
                                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                  <span>Loading meetings...</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : !meetingsData?.meetings.length && !rawMeetingsData?.meetings.length ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                No meetings found in selected date range
                              </TableCell>
                            </TableRow>
                          ) : !meetingsData?.meetings.length && rawMeetingsData?.meetings.length ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-8">
                                <div className="flex flex-col items-center justify-center gap-2">
                                  <p className="text-muted-foreground">All meetings in this date range have been posted</p>
                                  <p className="text-sm text-muted-foreground">Total meetings posted: {rawMeetingsData.meetings.length}</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : meetingsData && meetingsData.meetings ? (
                            meetingsData.meetings.map((meeting) => {
                              const scheduledDuration = (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 1000;
                              const startDate = new Date(meeting.startTime);
                              const endDate = new Date(meeting.endTime);
                              return (
                                <TableRow key={meeting.meetingInfo?.meetingId || meeting.subject}>
                                  <TableCell className="px-4 py-3">
                                    <div className="flex flex-col">
                                      <div className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
                                        {meeting.subject}
                                      </div>
                                      {meeting.isTeamsMeeting && (
                                        <Badge variant="secondary" className="w-fit mt-1">
                                          Teams
                                        </Badge>
                                      )}
                                      <div className="text-xs text-muted-foreground mt-1 md:hidden">
                                        {new Date(meeting.startTime).toLocaleTimeString([], { 
                                          hour: 'numeric',
                                          minute: '2-digit',
                                          hour12: true
                                        })}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-4 py-3 hidden md:table-cell">
                                    <div className="text-sm space-y-1">
                                      <div>{new Date(meeting.startTime).toLocaleDateString([], { 
                                        month: 'short',
                                        day: 'numeric'
                                      })}</div>
                                      <div className="text-muted-foreground">
                                        {new Date(meeting.startTime).toLocaleTimeString([], { 
                                          hour: 'numeric',
                                          minute: '2-digit',
                                          hour12: true
                                        })} - {new Date(meeting.endTime).toLocaleTimeString([], { 
                                          hour: 'numeric',
                                          minute: '2-digit',
                                          hour12: true
                                        })}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell px-4 py-3 text-sm text-muted-foreground">
                                    {formatDuration(scheduledDuration)}
                                  </TableCell>
                                  <TableCell className="px-4 py-3">
                                    {meeting.attendanceRecords.length > 0 ? (
                                      <div className="space-y-1">
                                        {meeting.attendanceRecords
                                          .filter(record => record.name === session?.user?.name)
                                          .map((record, index) => (
                                            <div key={index} className="text-sm">
                                              <span className="text-muted-foreground">
                                                {formatDuration(record.duration)}
                                              </span>
                                            </div>
                                          ))}
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">Not attended</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="px-4 py-3 text-center">
                                    <Badge variant={meeting.attendanceRecords.some(record => record.name === session?.user?.name) ? "default" : "secondary"}>
                                      {meeting.attendanceRecords.some(record => record.name === session?.user?.name) ? 'Attended' : 'Not attended'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : null}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Task Matches */}
            {matchResults && dateRange?.from && dateRange?.to && (
              <div className="space-y-3 sm:space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Task Matches</h2>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-muted-foreground">High: {matchResults.summary.highConfidence}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-muted-foreground">Medium: {matchResults.summary.mediumConfidence}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-muted-foreground">Low: {matchResults.summary.lowConfidence}</span>
                    </div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <MeetingMatches 
                    summary={matchResults.summary} 
                    matches={matchResults.matches}
                    onMeetingPosted={handleMeetingPosted}
                    postedMeetingIds={postedMeetingIds}
                  />
                </div>
              </div>
            )}
          </>
        );
    }
  };

  const handleIntervalSettings = () => {
    setDropdownOpen(false); // Close dropdown
    setShowApiKeyDialog(true);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar 
        className="hidden lg:flex" 
        currentView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b bg-background">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6">
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
            
            <div className="flex flex-1 items-center justify-between">
              <div className="flex items-center gap-4">
                <Logo size="md" />
              </div>

              <div className="flex items-center gap-4">
                {/* Only show DateRangePicker in header if meetings are fetched */}
                {meetingsData && dateRange?.from && dateRange?.to && (
                  <DateRangePicker
                    dateRange={dateRange}
                    onDateRangeChange={handleDateRangeChange}
                  />
                )}
                
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar>
                        <AvatarImage src={session?.user?.image || ''} />
                        <AvatarFallback>{session?.user?.name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {session?.user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleIntervalSettings}>
                      <Settings2 className="mr-2 h-4 w-4" />
                      <span>Intervals Settings</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                      <Sun className="mr-2 h-4 w-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0" />
                      <Moon className="absolute mr-2 h-4 w-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100" />
                      <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign Out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto relative min-h-[calc(100vh-4rem)]">
          <div className="container mx-auto p-4 sm:p-6 space-y-6 pb-16">
            {renderCurrentView()}
          </div>
          <footer className="fixed bottom-0 left-0 right-0 py-2 text-center text-xs text-muted-foreground bg-background border-t">
            <span className="opacity-70">Powered by ChatGPT-4o</span>
          </footer>
        </main>
      </div>

      {/* API Key Dialog */}
      <IntervalsKeyDialog
        open={showApiKeyDialog}
        onSubmit={handleApiKeySubmit}
        onClose={() => setShowApiKeyDialog(false)}
        existingApiKey={intervalsApiKey}
      />

      {/* Toaster */}
      <Toaster />
    </div>
  );
} 