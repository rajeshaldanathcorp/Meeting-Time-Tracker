import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { getAppGraphToken } from '@/lib/graph-app-auth';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';
import { IST_TIMEZONE } from '@/lib/utils';

// Add session type
interface ExtendedSession {
  user?: {
    email?: string | null;
    accessToken?: string;
  };
}

interface GraphMeeting {
  subject: string;
  start: {
    dateTime: string;
  };
  end: {
    dateTime: string;
  };
  onlineMeeting?: {
    joinUrl: string;
  };
  bodyPreview: string;
}

interface AttendanceInterval {
  joinDateTime: string;
  leaveDateTime: string;
  durationInSeconds: number;
}

interface RawAttendanceRecord {
  id: string;
  emailAddress: string;
  totalAttendanceInSeconds: number;
  role: string;
  identity: {
    id: string;
    displayName: string;
    tenantId: string;
  };
  attendanceIntervals: AttendanceInterval[];
}

interface AttendanceRecord {
  name: string;
  email: string;
  duration: number;
  intervals: AttendanceInterval[];
  rawRecord: RawAttendanceRecord;
}

interface MeetingData {
  subject: string;
  startTime: string;
  endTime: string;
  isTeamsMeeting: boolean;
  meetingInfo: ReturnType<typeof extractMeetingInfo> | null;
  attendanceRecords: AttendanceRecord[];
  rawData: GraphMeeting;
}

async function getAttendanceReport(organizerId: string, meetingId: string) {
  try {
    console.log('Fetching attendance for meeting:', {
      organizerId,
      meetingId
    });
    
    // Get app-level token instead of using user's token
    const appToken = await getAppGraphToken();
    
    // Get attendance reports
    const reportsResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!reportsResponse.ok) {
      console.log('Reports Response Error:', {
        status: reportsResponse.status,
        statusText: reportsResponse.statusText,
        text: await reportsResponse.text()
      });
      return null;
    }
    
    const reportsData = await reportsResponse.json();
    console.log('Reports Data:', JSON.stringify(reportsData, null, 2));
    
    if (!reportsData.value?.[0]?.id) return null;

    // Get attendance records
    const recordsResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerId}/onlineMeetings/${meetingId}/attendanceReports/${reportsData.value[0].id}/attendanceRecords`,
      {
        headers: {
          Authorization: `Bearer ${appToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!recordsResponse.ok) {
      console.log('Records Response Error:', {
        status: recordsResponse.status,
        statusText: recordsResponse.statusText,
        text: await recordsResponse.text()
      });
      return null;
    }
    
    const recordsData = await recordsResponse.json();
    console.log('Records Data:', JSON.stringify(recordsData, null, 2));
    return recordsData.value || [];
  } catch (error) {
    console.error('Error fetching attendance:', error);
    return null;
  }
}

function extractMeetingInfo(joinUrl: string, bodyPreview: string) {
  console.log('Extracting from:', { joinUrl, bodyPreview });
  
  // Extract meeting ID from body preview
  const meetingIdMatch = bodyPreview.match(/Meeting ID: (\d{3} \d{3} \d{3} \d{3})/);
  const meetingId = meetingIdMatch ? meetingIdMatch[1].replace(/\s/g, '') : null;
  
  // Extract thread ID from join URL
  const threadMatch = decodeURIComponent(joinUrl).match(/19:meeting_([^@]+)@thread\.v2/);
  const threadId = threadMatch ? threadMatch[1] : null;
  
  // Extract organizer ID from join URL
  const organizerMatch = decodeURIComponent(joinUrl).match(/"Oid":"([^"]+)"/);
  const organizerId = organizerMatch ? organizerMatch[1] : null;

  const result = { meetingId, threadId, organizerId };
  console.log('Extracted:', result);
  return result;
}

async function getMeetings(accessToken: string, startDate: Date, endDate: Date) {
  const filter = encodeURIComponent(
    `start/dateTime ge '${startDate.toISOString()}' and end/dateTime le '${endDate.toISOString()}'`
  );

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/events?$filter=${filter}&$select=id,subject,start,end,onlineMeeting,bodyPreview,organizer`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': `outlook.timezone="${IST_TIMEZONE}"`
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Graph API Error:', errorData);
    throw new Error(`Failed to fetch meetings: ${response.status}`);
  }

  const data = await response.json();
  console.log('Meetings Data:', JSON.stringify(data, null, 2));
  
  // Fetch attendance for each meeting
  const meetingsWithAttendance = await Promise.all(
    data.value.map(async (meeting: GraphMeeting) => {
      const meetingData: MeetingData = {
        subject: meeting.subject,
        startTime: meeting.start.dateTime,
        endTime: meeting.end.dateTime,
        isTeamsMeeting: false,
        meetingInfo: null,
        attendanceRecords: [],
        rawData: meeting
      };

      if (meeting.onlineMeeting) {
        meetingData.isTeamsMeeting = true;
        const meetingInfo = extractMeetingInfo(
          meeting.onlineMeeting.joinUrl,
          meeting.bodyPreview
        );
        meetingData.meetingInfo = meetingInfo;

        if (meetingInfo.threadId && meetingInfo.organizerId) {
          const formattedString = `1*${meetingInfo.organizerId}*0**19:meeting_${meetingInfo.threadId}@thread.v2`;
          const base64MeetingId = Buffer.from(formattedString).toString('base64');
          
          console.log('Attempting to fetch attendance with:', {
            organizerId: meetingInfo.organizerId,
            threadId: meetingInfo.threadId,
            formattedString,
            base64MeetingId
          });

          const attendanceRecords = await getAttendanceReport(
            meetingInfo.organizerId,
            base64MeetingId
          );
          
          if (attendanceRecords) {
            meetingData.attendanceRecords = attendanceRecords.map((record: RawAttendanceRecord) => ({
              name: record.identity.displayName,
              email: record.emailAddress,
              duration: record.totalAttendanceInSeconds,
              intervals: record.attendanceIntervals,
              rawRecord: record
            }));
          }
        }
      }

      return meetingData;
    })
  );

  return {
    totalMeetings: meetingsWithAttendance.length,
    timeRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    meetings: meetingsWithAttendance
  };
}

// Helper function to format date in IST
function formatToIST(date: Date): string {
    console.log('\n=== TIME CONVERSION DEBUG ===');
    console.log('Input UTC Date:', date.toISOString());
    
    // Add 5 hours and 30 minutes to convert to IST
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    console.log('After adding 5:30 hours:', istDate.toISOString());
    
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };

    const formattedDate = new Intl.DateTimeFormat('en-IN', options).format(istDate);
    const finalResult = formattedDate + ' IST';
    console.log('Formatted IST result:', finalResult);
    console.log('===========================\n');
    return finalResult;
}

// Helper function to convert UTC to IST
function convertToIST(utcTimeString: string): string {
    console.log('\n=== UTC STRING CONVERSION DEBUG ===');
    console.log('Input UTC string:', utcTimeString);
    const utcDate = new Date(utcTimeString);
    console.log('Parsed as Date:', utcDate.toISOString());
    const result = formatToIST(utcDate);
    console.log('Final IST result:', result);
    console.log('================================\n');
    return result;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions) as ExtendedSession;
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse date range from query parameters
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'Date range is required' }, { status: 400 });
    }

    // Parse the dates and set proper time boundaries
    const startDate = new Date(from);
    const endDate = new Date(to);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);

    console.log('\n=== DATE RANGE DEBUG ===');
    console.log('Original from:', from);
    console.log('Original to:', to);
    console.log('Parsed start date UTC:', startDate.toISOString());
    console.log('Parsed end date UTC:', endDate.toISOString());
    console.log('Start date IST:', formatToIST(startDate));
    console.log('End date IST:', formatToIST(endDate));
    console.log('======================\n');

    // Get access token
    const accessToken = session.user.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    // Get meetings data
    const meetingsData = await getMeetings(accessToken, startDate, endDate);

    // Filter meetings by date range first
    const dateFilteredMeetings = meetingsData.meetings.filter(meeting => {
        const meetingDate = new Date(meeting.startTime);
        const isInRange = meetingDate >= startDate && meetingDate <= endDate;
        
        console.log('\n=== MEETING FILTER DEBUG ===');
        console.log('Meeting:', {
            subject: meeting.subject,
            originalStartTime: meeting.startTime,
            meetingDateUTC: meetingDate.toISOString(),
            meetingDateIST: formatToIST(meetingDate),
            startDateIST: formatToIST(startDate),
            endDateIST: formatToIST(endDate),
            isInRange
        });
        console.log('=========================\n');
        
        return isInRange;
    });

    console.log(`\nFiltered ${meetingsData.meetings.length} meetings to ${dateFilteredMeetings.length} within date range`);

    // Get posted meetings storage
    const postedMeetingsStorage = new PostedMeetingsStorage();
    
    // Get all posted meetings for logging and debugging
    const postedMeetings = await postedMeetingsStorage.getPostedMeetings(session.user.email);
    console.log('\n==== MEETINGS FILTERING DEBUG ====');
    console.log(`User Email: ${session.user.email}`);
    console.log(`Total meetings fetched: ${dateFilteredMeetings.length}`);
    console.log(`Total posted meetings: ${postedMeetings.length}`);
    
    console.log('\nProcessing current meetings:');
    const filteredMeetings = [];
    for (const meeting of dateFilteredMeetings) {
        // Normalize the meeting subject
        const normalizedSubject = meeting.subject
            .trim()
            .replace(/\s+/g, ' ')    // normalize spaces
            .replace(/[^\w\s-]/g, '') // remove special chars except hyphen
            .trim();
        
        // Generate consistent ID using the same format as stored data
        const meetingId = `${session.user.email.toLowerCase()}_${normalizedSubject}_${normalizedSubject}_${meeting.startTime}`;
        
        // Check if meeting is already posted
        const isPosted = postedMeetings.some(posted => posted.id === meetingId);
        console.log('Meeting:', meeting.subject, 'ID:', meetingId, 'Is Posted:', isPosted);
        
        if (!isPosted) {
            console.log('Adding to filtered meetings list');
            filteredMeetings.push(meeting);
        }
    }

    console.log('\n=== FINAL RESPONSE DEBUG ===');
    console.log('Time range:', {
        fromIST: convertToIST(startDate.toISOString()),
        toIST: convertToIST(endDate.toISOString()),
        fromUTC: startDate.toISOString(),
        toUTC: endDate.toISOString()
    });
    console.log('First meeting times (if any):', filteredMeetings[0] ? {
        subject: filteredMeetings[0].subject,
        displayStartTime: convertToIST(filteredMeetings[0].startTime),
        displayEndTime: convertToIST(filteredMeetings[0].endTime)
    } : 'No meetings');
    console.log('===========================\n');

    return NextResponse.json({
      total: filteredMeetings.length,
      timeRange: {
        from: convertToIST(startDate.toISOString()),
        to: convertToIST(endDate.toISOString()),
        fromUTC: startDate.toISOString(),
        toUTC: endDate.toISOString()
      },
      meetings: filteredMeetings
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch meetings' },
      { status: 500 }
    );
  }
} 