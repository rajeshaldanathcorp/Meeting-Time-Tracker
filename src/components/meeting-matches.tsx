"use client";

import React, { useState, useEffect, type ReactElement } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatDate, formatDateWithTimezone, formatDateIST, DEFAULT_DATE_FORMAT, TIME_ONLY_FORMAT } from "@/lib/utils";
import type { Meeting, Task, MatchResult } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import type { 
  Command as CommandPrimitive,
  CommandInput as CommandInputPrimitive,
  CommandList as CommandListPrimitive,
  CommandEmpty as CommandEmptyPrimitive,
  CommandGroup as CommandGroupPrimitive,
  CommandItem as CommandItemPrimitive
} from 'cmdk';

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: {
    joinDateTime: string;
    leaveDateTime: string;
    durationInSeconds: number;
  }[];
  rawRecord: {
    identity: {
      displayName: string;
    };
    emailAddress: string;
    totalAttendanceInSeconds: number;
    attendanceIntervals: unknown[];
    role?: string;
  };
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

interface MatchDetails {
  titleSimilarity: number;
  projectRelevance: number;
  contextMatch: number;
  timeRelevance: number;
}

interface MatchSummary {
  total: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  unmatched: number;
}

interface MeetingMatchesProps {
  summary: MatchSummary;
  matches: {
    high: MatchResult[];
    medium: MatchResult[];
    low: MatchResult[];
    unmatched: MatchResult[];
  };
  onMeetingPosted: (meetingId: string) => void;
  postedMeetingIds: Set<string> | string[];
}

interface MatchDetailsBarProps {
  match: {
    meeting: Meeting;
    matchedTask: Task | null;
    confidence: number;
    reason: string;
  };
}

type MatchCategory = 'high' | 'medium' | 'low' | 'unmatched';

interface MatchGroups {
  high: MatchResult[];
  medium: MatchResult[];
  low: MatchResult[];
  unmatched: MatchResult[];
}

function generateMeetingKey(meeting: Meeting, userId: string): string {
  const meetingId = (meeting.meetingInfo?.meetingId || '').trim();
  const meetingName = meeting.subject.trim();
  const meetingTime = meeting.startTime.trim();
  const key = `${userId.trim()}_${meetingName}_${meetingId}_${meetingTime}`;
  console.log('Generated key:', key);
  return key;
}

export function MatchDetailsBar({ match }: MatchDetailsBarProps) {
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-4 p-2 text-sm">
      <div className="flex items-center gap-2">
        <div 
          className={`w-2 h-2 rounded-full ${getConfidenceColor(match.confidence)}`} 
        />
        <span>Confidence: {Math.round(match.confidence * 100)}%</span>
      </div>
      <div className="flex-1">
        <span className="text-muted-foreground">{match.reason}</span>
      </div>
    </div>
  );
}

interface MatchRowProps {
  result: MatchResult;
  onMeetingPosted?: (meetingId: string) => void;
  postedMeetingIds?: string[];
  selectedTasks: Map<string, Task>;
  onTaskSelect: (task: Task | null) => void;
  isSelected: boolean;
  onSelectChange: (selected: boolean) => void;
}

// Helper function to convert seconds to decimal hours with proper rounding
function convertSecondsToDecimalHours(seconds: number): number {
  if (!seconds || seconds <= 0) {
    throw new Error('Meeting duration must be greater than 0 seconds');
  }
  // Round to 2 decimal places for Intervals
  return Number((seconds / 3600).toFixed(2));
}

function formatMatchReason(reason: string): string {
  // Remove any trailing ellipsis
  let formatted = reason.replace(/\.{3,}$/, '');
  
  // Extract the key information based on common patterns
  if (formatted.includes('Found keyword matches:')) {
    // Check if it's an exact match
    const isExactMatch = formatted.includes('exact match') || 
                        formatted.toLowerCase().includes('identical') ||
                        formatted.includes('same to same');
    
    formatted = formatted.replace('Found keyword matches:', isExactMatch ? 'Exact match:' : 'Match:');
  } else if (formatted.includes('Matched common pattern')) {
    formatted = formatted.replace('Matched common pattern', 'Pattern:');
  } else if (formatted.includes('suggests a focus on')) {
    formatted = formatted.replace(/suggests a focus on (.*?)(,|\.).*$/, 'matches $1');
  }
  
  // Ensure it ends with a period
  if (!formatted.endsWith('.')) {
    formatted += '.';
  }
  
  return formatted;
}

function getConfidenceDisplay(confidence: number, reason: string): { value: number, display: string } {
  // Check if it's an exact match based on the reason text
  const isExactMatch = reason.toLowerCase().includes('exact match') || 
                      reason.toLowerCase().includes('identical') ||
                      reason.toLowerCase().includes('same to same');

  if (isExactMatch) {
    return { value: 100, display: '100%' };
  }

  // For non-exact matches, cap at 90%
  const adjustedConfidence = Math.min(Math.round(confidence * 100), 90);
  return { value: adjustedConfidence, display: `${adjustedConfidence}%` };
}

function MatchRow({ 
  result, 
  onMeetingPosted, 
  postedMeetingIds, 
  selectedTasks, 
  onTaskSelect,
  isSelected,
  onSelectChange 
}: MatchRowProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isPosting, setIsPosting] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [isTaskSelectOpen, setIsTaskSelectOpen] = useState(false);
  
  const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');
  const selectedTask = selectedTasks.get(meetingKey) || result.matchedTask || null;

  // Fetch available tasks
  const fetchTasks = async () => {
    if (availableTasks.length > 0) return availableTasks; // Return cached tasks if available
    
    setIsLoadingTasks(true);
    try {
      const response = await fetch('/api/intervals/tasks');
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const tasks = await response.json();
      setAvailableTasks(tasks);
      return tasks;
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast("Failed to load tasks. Please try again.");
      return [];
    } finally {
      setIsLoadingTasks(false);
    }
  };

  // Preload tasks on component mount
  useEffect(() => {
    fetchTasks();
  }, []); // Empty dependency array to load once

  const handleTaskSelect = () => {
    setIsTaskSelectOpen(true);
  };

  // Add this function to handle task changes
  const handleTaskChange = (task: Task | null) => {
    const meetingKey = generateMeetingKey(result.meeting, session?.user?.email || '');
    onTaskSelect(task);
    setIsTaskSelectOpen(false);
  };

  const handlePostToIntervals = async () => {
    if (!selectedTask) {
      toast("Please select a task first");
      return;
    }

    setIsPosting(true);
    try {
      const userAttendance = result.meeting.attendanceRecords.find(
        record => record.name === session?.user?.name
      );

      if (!userAttendance) {
        toast.error("You were not present in this meeting", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
        return;
      }

      if (!userAttendance.duration || userAttendance.duration <= 0) {
        toast.error("Invalid meeting duration. Must be greater than 0 seconds.", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
        return;
      }

      const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
      const durationInSeconds = userAttendance.duration;
      
      const response = await fetch('/api/intervals/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedTask.id,
          date: meetingDate,
          time: durationInSeconds,
          description: result.meeting.subject,
          meetingId: result.meeting.meetingInfo?.meetingId || result.meeting.subject,
          subject: result.meeting.subject,
          startTime: result.meeting.startTime,
          confidence: result.confidence,
          isManualPost: true
        }),
      });

      const postResult = await response.json();
      if (postResult.success) {
        const decimalHours = Number((durationInSeconds / 3600).toFixed(2));
        toast.success(`Successfully posted ${decimalHours} hours to Intervals`, {
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
        onMeetingPosted?.(meetingKey);
      } else if (postResult.needsReview) {
        toast.error("This meeting requires manual review before posting", {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
      } else {
        const errorMessage = typeof postResult.error === 'string' ? postResult.error : 'Failed to post meeting';
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error posting meeting:', error);
      toast(error instanceof Error ? error.message : 'Failed to post meeting');
    } finally {
      setIsPosting(false);
    }
  };

  const confidenceInfo = getConfidenceDisplay(result.confidence, result.reason);

  return (
    <TableRow>
      <TableCell className="py-2 pl-2 sm:pl-4">
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelectChange}
        />
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-col space-y-1">
          <div className="font-medium truncate max-w-[200px] sm:max-w-[300px] text-foreground">
            {result.meeting.subject}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px]">
        {selectedTask ? (
          <div className="space-y-1">
            <div className="truncate font-medium text-foreground">{selectedTask.title}</div>
            <div className="text-xs text-muted-foreground dark:text-gray-400 truncate">{selectedTask.project}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTaskSelect}
              disabled={isLoadingTasks}
              className="w-full text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              Change Task
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTaskSelect}
            disabled={isLoadingTasks}
            className="w-full"
          >
            {isLoadingTasks ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              'Select Task'
            )}
          </Button>
        )}
        
        <Dialog open={isTaskSelectOpen} onOpenChange={setIsTaskSelectOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {selectedTask ? 'Change Task for Meeting' : 'Select Task for Meeting'}
              </DialogTitle>
              <DialogDescription>
                {selectedTask 
                  ? `Choose a different task to associate with "${result.meeting.subject}"`
                  : `Choose a task to associate with "${result.meeting.subject}"`
                }
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              <div className="rounded-lg border shadow-md">
                <div className="p-2">
                  <input
                    className="w-full border-none bg-transparent outline-none placeholder:text-muted-foreground"
                    placeholder="Search tasks..."
                    onChange={(e) => {
                      // Implement task filtering here if needed
                      console.log('Search:', e.target.value);
                    }}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {availableTasks.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      No tasks found.
                    </div>
                  ) : (
                    <div className="p-1">
                      {availableTasks.map((task) => (
                        <button
                          key={task.id}
                          className="w-full rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                          onClick={() => handleTaskChange(task)}
                        >
                          <div className="text-left">
                            <div className="font-medium">{task.title}</div>
                            <div className="text-sm text-muted-foreground">{task.project}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>
      <TableCell className="w-[100px]">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${
            confidenceInfo.value >= 90 ? 'bg-green-500' :
            confidenceInfo.value >= 50 ? 'bg-yellow-500' :
            'bg-red-500'
          }`} />
          <span className="text-sm text-muted-foreground dark:text-gray-400">{confidenceInfo.display}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[300px]">
        <div className="text-sm text-foreground dark:text-gray-100">
          {formatMatchReason(result.reason)}
        </div>
      </TableCell>
      <TableCell>
        {(result.matchedTask || selectedTask) && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={handlePostToIntervals}
            disabled={isPosting}
            className="whitespace-nowrap"
          >
            {isPosting ? (
              <>
                <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function MeetingMatches({ summary, matches, onMeetingPosted, postedMeetingIds }: MeetingMatchesProps): ReactElement {
  const { data: session } = useSession();
  const { toast } = useToast();
  const userId = session?.user?.email || '';
  const [selectedMeetings, setSelectedMeetings] = useState<Record<string, boolean>>({});
  const [isPostingMultiple, setIsPostingMultiple] = useState(false);
  const [activeTab] = useState('unmatched');
  const [selectedTasks, setSelectedTasks] = useState<Map<string, Task>>(new Map());
  const [selectedMeetingKeys, setSelectedMeetingKeys] = useState<Set<string>>(new Set());
  
  const filterMeetings = (matchResults: MatchResult[]) => {
    console.log('Posted Meeting IDs:', postedMeetingIds);
    // Convert postedMeetingIds to a Set if it isn't already one
    const postedIds = postedMeetingIds instanceof Set ? postedMeetingIds : new Set(postedMeetingIds);
    return matchResults.filter((m: MatchResult) => {
      const meetingKey = generateMeetingKey(m.meeting, userId);
      
      // Check if meeting is already posted
      const isPosted = postedIds.has(meetingKey);
      
      // Check if meeting has valid duration from start and end times
      let hasDuration = true;
      if (m.meeting.startTime && m.meeting.endTime) {
        const startTime = new Date(m.meeting.startTime);
        const endTime = new Date(m.meeting.endTime);
        const durationMs = endTime.getTime() - startTime.getTime();
        hasDuration = durationMs > 0;
      }
      
      // Only include meetings that are not posted and have duration
      const isIncluded = !isPosted && hasDuration;
      
      if (!hasDuration) {
        console.log('Filtering out meeting with zero duration:', m.meeting.subject);
      }
      
      console.log('Meeting:', m.meeting.subject, 'Key:', meetingKey, 'Is Visible:', isIncluded);
      return isIncluded;
    });
  };

  const [meetings, setMeetings] = useState<MatchGroups>(() => ({
      high: filterMeetings(matches.high),
      medium: filterMeetings(matches.medium),
      low: filterMeetings(matches.low),
      unmatched: filterMeetings(matches.unmatched)
  }));

  // Update meetings when props change
  useEffect(() => {
    setMeetings({
      high: filterMeetings(matches.high),
      medium: filterMeetings(matches.medium),
      low: filterMeetings(matches.low),
      unmatched: filterMeetings(matches.unmatched)
    });
  }, [matches, postedMeetingIds, userId]);

  // Add useEffect to remove meetings from UI when they are posted
  useEffect(() => {
    if (postedMeetingIds) {
      setMeetings(prev => ({
        high: filterMeetings(prev.high),
        medium: filterMeetings(prev.medium),
        low: filterMeetings(prev.low),
        unmatched: filterMeetings(prev.unmatched)
      }));
    }
  }, [postedMeetingIds]);

  // Update handleMeetingPosted to immediately remove the meeting from UI
  const handleMeetingPosted = (meetingId: string): void => {
    if (onMeetingPosted) {
      onMeetingPosted(meetingId);
    }

    // Immediately remove the meeting from all categories
    setMeetings(prev => ({
      high: prev.high.filter(m => generateMeetingKey(m.meeting, userId) !== meetingId),
      medium: prev.medium.filter(m => generateMeetingKey(m.meeting, userId) !== meetingId),
      low: prev.low.filter(m => generateMeetingKey(m.meeting, userId) !== meetingId),
      unmatched: prev.unmatched.filter(m => generateMeetingKey(m.meeting, userId) !== meetingId)
    }));
  };

  // Add postAllMeetings function
  const postAllMeetings = async () => {
    setIsPostingMultiple(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Get meetings based on active tab
      const meetingsToPost = activeTab === 'matched' 
        ? meetings.high.filter(m => {
            const meetingKey = generateMeetingKey(m.meeting, userId);
            return m.matchedTask && selectedMeetingKeys.has(meetingKey);
          })
        : meetings.unmatched.filter(m => {
            const meetingKey = generateMeetingKey(m.meeting, userId);
            return selectedTasks.has(meetingKey) && selectedMeetingKeys.has(meetingKey);
          });

      const postedIds = new Set<string>();

      for (const result of meetingsToPost) {
        try {
          const userAttendance = result.meeting.attendanceRecords.find(
            record => record.name === session?.user?.name
          );

          if (!userAttendance) {
            failCount++;
            continue;
          }

          // Skip meetings with zero duration
          if (!userAttendance.duration || userAttendance.duration <= 0) {
            console.log(`Skipping meeting "${result.meeting.subject}" due to zero duration`);
            failCount++;
            continue;
          }

          const meetingDate = new Date(result.meeting.startTime).toISOString().split('T')[0];
          const durationInSeconds = userAttendance.duration;
          const meetingKey = generateMeetingKey(result.meeting, userId);
          const taskToUse = activeTab === 'matched' ? result.matchedTask! : selectedTasks.get(meetingKey)!;
          
          const response = await fetch('/api/intervals/time-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              taskId: taskToUse.id,
              date: meetingDate,
              time: durationInSeconds,
              description: result.meeting.subject,
              meetingId: result.meeting.meetingInfo?.meetingId || result.meeting.subject,
              subject: result.meeting.subject,
              startTime: result.meeting.startTime,
              confidence: result.confidence,
              isManualPost: true
            }),
          });

          const postResult = await response.json();
          if (postResult.success) {
            successCount++;
            postedIds.add(meetingKey);
            onMeetingPosted?.(meetingKey);
          } else {
            failCount++;
          }
        } catch (error) {
          console.error('Error posting meeting:', error);
          failCount++;
        }
      }

      // Update the meetings state to remove posted meetings
      setMeetings(prev => ({
        ...prev,
        [activeTab === 'matched' ? 'high' : 'unmatched']: 
          prev[activeTab === 'matched' ? 'high' : 'unmatched']
            .filter(m => !postedIds.has(generateMeetingKey(m.meeting, userId)))
      }));

      // Clear selected tasks for posted meetings
      const updatedSelectedTasks = new Map(selectedTasks);
      postedIds.forEach(id => updatedSelectedTasks.delete(id));
      setSelectedTasks(updatedSelectedTasks);

      // Show notifications sequentially
      if (successCount > 0) {
        toast.success(`Successfully posted ${successCount} meetings`, {
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

        // Wait for success notification to complete before showing failure
      if (failCount > 0) {
          setTimeout(() => {
            toast.error(`Failed to post ${failCount} meetings`, {
              position: "top-center",
              duration: 4000,
              style: {
                backgroundColor: "#ef4444",
                color: "white",
                fontSize: "16px",
                borderRadius: "8px",
                padding: "12px 24px"
              }
            });
          }, 3500); // Wait for success notification to finish (3000ms) plus a small gap (500ms)
        }
      } else if (failCount > 0) {
        // If no success, show failure immediately
        toast.error(`Failed to post ${failCount} meetings`, {
          position: "top-center",
          duration: 4000,
          style: {
            backgroundColor: "#ef4444",
            color: "white",
            fontSize: "16px",
            borderRadius: "8px",
            padding: "12px 24px"
          }
        });
      }
    } finally {
      setIsPostingMultiple(false);
    }
  };

  // Update getPostableMeetingsCount function
  const getPostableMeetingsCount = () => {
    if (activeTab === 'matched') {
      return meetings.high.filter(m => {
        const hasAttendance = m.meeting.attendanceRecords.some(
          record => record.name === session?.user?.name && record.duration > 0
        );
        const meetingKey = generateMeetingKey(m.meeting, userId);
        return m.matchedTask && hasAttendance && selectedMeetingKeys.has(meetingKey);
      }).length;
    } else if (activeTab === 'unmatched') {
      return meetings.unmatched.filter(m => {
        const hasAttendance = m.meeting.attendanceRecords.some(
          record => record.name === session?.user?.name && record.duration > 0
        );
        const meetingKey = generateMeetingKey(m.meeting, userId);
        return selectedTasks.has(meetingKey) && hasAttendance && selectedMeetingKeys.has(meetingKey);
      }).length;
    }
    return 0;
  };

  // Add useEffect to initialize selected meetings
  useEffect(() => {
    // Initialize selected meetings when meetings change
    const newSelectedMeetings = new Set<string>();
    
    if (activeTab === 'matched') {
      meetings.high.forEach(m => {
        const meetingKey = generateMeetingKey(m.meeting, userId);
        if (m.matchedTask) {
          newSelectedMeetings.add(meetingKey);
        }
      });
    }
    
    setSelectedMeetingKeys(newSelectedMeetings);
  }, [meetings, activeTab, userId]);

  // Helper functions for unmatched meetings
  const isSelected = (meetingId: string) => !!selectedMeetings[meetingId];
  
  const handleSelectChange = (meetingId: string, checked: boolean) => {
    setSelectedMeetings(prev => ({
      ...prev,
      [meetingId]: checked
    }));
  };
  
  const areAllUnmatchedSelected = () => {
    if (meetings.unmatched.length === 0) return false;
    return meetings.unmatched.every(m => 
      isSelected(m.meeting.meetingInfo?.meetingId || m.meeting.subject || '')
    );
  };
  
  const toggleAllUnmatched = (checked: boolean) => {
    const newSelected = { ...selectedMeetings };
    meetings.unmatched.forEach(m => {
      const id = m.meeting.meetingInfo?.meetingId || m.meeting.subject || '';
      newSelected[id] = !!checked;
    });
    setSelectedMeetings(newSelected);
  };

  const isPosted = (meetingId: string) => {
    return Array.isArray(postedMeetingIds) 
      ? postedMeetingIds.includes(meetingId)
      : Array.from(postedMeetingIds).includes(meetingId);
  };

  return (
    <div className="bg-background">
      {/* Header with Post All button */}
      <div className="border-b">
        <div className="flex items-center justify-end px-6 py-2">
          {getPostableMeetingsCount() > 0 && (
            <Button
              onClick={postAllMeetings}
              disabled={isPostingMultiple}
              size="sm"
            >
              {isPostingMultiple ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  Posting...
                </>
              ) : (
                <>Post All ({getPostableMeetingsCount()})</>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="divide-y">
        {/* High Confidence Matches */}
        {meetings.high.length > 0 && (
          <div>
            <div className="p-4 bg-green-50 dark:bg-green-900/10">
              <h3 className="text-sm font-medium text-green-900 dark:text-green-100">High Confidence Matches</h3>
            </div>
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={meetings.high.every(match => 
                          selectedMeetingKeys.has(generateMeetingKey(match.meeting, userId))
                        )}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedMeetingKeys);
                          meetings.high.forEach(match => {
                            const key = generateMeetingKey(match.meeting, userId);
                            if (checked) {
                              newSelected.add(key);
                            } else {
                              newSelected.delete(key);
                            }
                          });
                          setSelectedMeetingKeys(newSelected);
                        }}
                      />
                    </TableHead>
                    <TableHead>Meeting</TableHead>
                    <TableHead className="w-[200px]">Task</TableHead>
                    <TableHead className="w-[100px]">Confidence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.high.map((result, index) => (
                    <MatchRow
                      key={`high-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      onTaskSelect={(task) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        const updatedTasks = new Map(selectedTasks);
                        if (task) {
                          updatedTasks.set(meetingKey, task);
                          setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                        } else {
                          updatedTasks.delete(meetingKey);
                          setSelectedMeetingKeys(prev => {
                            const next = new Set(prev);
                            next.delete(meetingKey);
                            return next;
                          });
                        }
                        setSelectedTasks(updatedTasks);
                      }}
                      isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                      onSelectChange={(selected) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        setSelectedMeetingKeys(prev => {
                          const next = new Set(prev);
                          if (selected) {
                            next.add(meetingKey);
                          } else {
                            next.delete(meetingKey);
                          }
                          return next;
                        });
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Medium Confidence Matches */}
        {meetings.medium.length > 0 && (
          <div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10">
              <h3 className="text-sm font-medium text-yellow-900 dark:text-yellow-100">Medium Confidence Matches</h3>
            </div>
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={meetings.medium.every(match => 
                          selectedMeetingKeys.has(generateMeetingKey(match.meeting, userId))
                        )}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedMeetingKeys);
                          meetings.medium.forEach(match => {
                            const key = generateMeetingKey(match.meeting, userId);
                            if (checked) {
                              newSelected.add(key);
                            } else {
                              newSelected.delete(key);
                            }
                          });
                          setSelectedMeetingKeys(newSelected);
                        }}
                      />
                    </TableHead>
                    <TableHead>Meeting</TableHead>
                    <TableHead className="w-[200px]">Task</TableHead>
                    <TableHead className="w-[100px]">Confidence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.medium.map((result, index) => (
                    <MatchRow
                      key={`medium-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      onTaskSelect={(task) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        const updatedTasks = new Map(selectedTasks);
                        if (task) {
                          updatedTasks.set(meetingKey, task);
                          setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                        } else {
                          updatedTasks.delete(meetingKey);
                          setSelectedMeetingKeys(prev => {
                            const next = new Set(prev);
                            next.delete(meetingKey);
                            return next;
                          });
                        }
                        setSelectedTasks(updatedTasks);
                      }}
                      isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                      onSelectChange={(selected) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        setSelectedMeetingKeys(prev => {
                          const next = new Set(prev);
                          if (selected) {
                            next.add(meetingKey);
                          } else {
                            next.delete(meetingKey);
                          }
                          return next;
                        });
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Low Confidence Matches */}
        {meetings.low.length > 0 && (
          <div>
            <div className="p-4 bg-red-50 dark:bg-red-900/10">
              <h3 className="text-sm font-medium text-red-900 dark:text-red-100">Low Confidence Matches</h3>
            </div>
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={meetings.low.every(match => 
                          selectedMeetingKeys.has(generateMeetingKey(match.meeting, userId))
                        )}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedMeetingKeys);
                          meetings.low.forEach(match => {
                            const key = generateMeetingKey(match.meeting, userId);
                            if (checked) {
                              newSelected.add(key);
                            } else {
                              newSelected.delete(key);
                            }
                          });
                          setSelectedMeetingKeys(newSelected);
                        }}
                      />
                    </TableHead>
                    <TableHead>Meeting</TableHead>
                    <TableHead className="w-[200px]">Task</TableHead>
                    <TableHead className="w-[100px]">Confidence</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.low.map((result, index) => (
                    <MatchRow
                      key={`low-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      onTaskSelect={(task) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        const updatedTasks = new Map(selectedTasks);
                        if (task) {
                          updatedTasks.set(meetingKey, task);
                          setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                        } else {
                          updatedTasks.delete(meetingKey);
                          setSelectedMeetingKeys(prev => {
                            const next = new Set(prev);
                            next.delete(meetingKey);
                            return next;
                          });
                        }
                        setSelectedTasks(updatedTasks);
                      }}
                      isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                      onSelectChange={(selected) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        setSelectedMeetingKeys(prev => {
                          const next = new Set(prev);
                          if (selected) {
                            next.add(meetingKey);
                          } else {
                            next.delete(meetingKey);
                          }
                          return next;
                        });
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Unmatched Meetings */}
        {meetings.unmatched.length > 0 ? (
          <div>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/10">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Unmatched Meetings</h3>
            </div>
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={areAllUnmatchedSelected()}
                        onCheckedChange={toggleAllUnmatched}
                        aria-label="Select all unmatched"
                      />
                    </TableHead>
                    <TableHead>Meeting</TableHead>
                    <TableHead className="w-[200px]">Task</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.unmatched.map((result, index) => (
                    <MatchRow
                      key={`unmatched-${result.meeting.meetingInfo?.meetingId || result.meeting.subject}-${index}`}
                      result={result}
                      onMeetingPosted={handleMeetingPosted}
                      postedMeetingIds={Array.from(postedMeetingIds)}
                      selectedTasks={selectedTasks}
                      onTaskSelect={(task) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        const updatedTasks = new Map(selectedTasks);
                        if (task) {
                          updatedTasks.set(meetingKey, task);
                          setSelectedMeetingKeys(prev => new Set([...prev, meetingKey]));
                        } else {
                          updatedTasks.delete(meetingKey);
                          setSelectedMeetingKeys(prev => {
                            const next = new Set(prev);
                            next.delete(meetingKey);
                            return next;
                          });
                        }
                        setSelectedTasks(updatedTasks);
                      }}
                      isSelected={selectedMeetingKeys.has(generateMeetingKey(result.meeting, userId))}
                      onSelectChange={(selected) => {
                        const meetingKey = generateMeetingKey(result.meeting, userId);
                        setSelectedMeetingKeys(prev => {
                          const next = new Set(prev);
                          if (selected) {
                            next.add(meetingKey);
                          } else {
                            next.delete(meetingKey);
                          }
                          return next;
                        });
                        handleSelectChange(result.meeting.meetingInfo?.meetingId || result.meeting.subject || '', selected);
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-muted-foreground">
            No unmatched meetings found
          </div>
        )}

        {/* Show message when no meetings at all */}
        {meetings.high.length === 0 && meetings.medium.length === 0 && 
         meetings.low.length === 0 && meetings.unmatched.length === 0 && (
          <div className="px-6 py-8 text-center text-muted-foreground">
            No meetings found
          </div>
        )}
      </div>
    </div>
  );
} 