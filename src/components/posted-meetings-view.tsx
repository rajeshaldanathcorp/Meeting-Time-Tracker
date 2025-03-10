import { PostedMeetings } from "./posted-meetings";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
}

export function PostedMeetingsView() {
  const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);

  useEffect(() => {
    const fetchPostedMeetings = async () => {
      try {
        const response = await fetch('/api/meetings/posted');
        if (response.ok) {
          const data = await response.json();
          setPostedMeetings(data.meetings || []);
        }
      } catch (error) {
        console.error('Error fetching posted meetings:', error);
      }
    };

    fetchPostedMeetings();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Posted Meetings</h2>
        <div className="text-sm text-muted-foreground">
          Total Posted: {postedMeetings.length}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <div className="inline-block min-w-full align-middle">
                <PostedMeetings meetings={postedMeetings} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 