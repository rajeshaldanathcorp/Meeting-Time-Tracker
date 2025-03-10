import { useEffect, useState } from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { formatDateIST, DEFAULT_DATE_FORMAT, TIME_ONLY_FORMAT, DATE_ONLY_FORMAT } from "@/lib/utils";

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
}

interface PostedMeetingsProps {
  meetings: PostedMeeting[];
}

export function PostedMeetings({ meetings }: PostedMeetingsProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [meetings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!meetings.length) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        No meetings have been posted yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="sm:block hidden">
          <CardTitle>Posted Meetings</CardTitle>
          <CardDescription>
            Meetings that have been posted to Intervals
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Meeting Subject</TableHead>
                <TableHead className="hidden sm:table-cell">Meeting Date</TableHead>
                <TableHead>Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meetings.map((meeting) => (
                <TableRow key={meeting.id}>
                  <TableCell className="font-medium">
                    <div className="truncate max-w-[200px] sm:max-w-[300px]">
                      {meeting.subject || 'Untitled Meeting'}
                    </div>
                    <div className="text-xs text-muted-foreground sm:hidden">
                      {formatDateIST(meeting.meetingDate, DEFAULT_DATE_FORMAT)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell whitespace-nowrap">
                    {formatDateIST(meeting.meetingDate, DEFAULT_DATE_FORMAT)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="hidden sm:inline">{formatDateIST(meeting.postedDate, DEFAULT_DATE_FORMAT)}</span>
                    <span className="sm:hidden">{formatDateIST(meeting.postedDate, TIME_ONLY_FORMAT)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
} 