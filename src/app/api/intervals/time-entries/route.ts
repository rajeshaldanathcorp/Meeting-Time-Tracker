import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';
import { reviewService } from '@/ai-agent/services/review/review-service';
import { AIAgentPostedMeetingsStorage } from '@/ai-agent/services/storage/posted-meetings';
import { StorageManager } from '@/ai-agent/data/storage/manager';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Initialize storage and load data
        const storage = new UserStorage();
        await storage.loadData();
        
        console.log('Getting API key for user:', session.user.email);
        const apiKey = await storage.getUserApiKey(session.user.email);
        console.log('API key found:', apiKey ? 'Yes' : 'No');

        if (!apiKey) {
            return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
        }

        const payload = await request.json();
        const { 
            taskId, date, time, description, workType, billable, 
            meetingId, subject, startTime, confidence, isManualPost,
            attendanceRecords 
        } = payload;

        console.log('Received time entry request:', {
            taskId,
            date,
            time: time ? `${time} seconds (${(time / 3600).toFixed(2)} hours)` : 'not provided',
            description,
            workType,
            billable,
            meetingId,
            subject,
            confidence,
            isManualPost,
            attendanceRecords: attendanceRecords ? 'provided' : 'not provided'
        });

        // Required fields validation
        if (!taskId) {
            return NextResponse.json({ error: 'Task ID is required' }, { status: 400 });
        }

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        if (!time && !isManualPost) {
            return NextResponse.json({ error: 'Time duration is required' }, { status: 400 });
        }

        const intervalsApi = new IntervalsAPI(apiKey);
        
        try {
            // For manual posts, verify the user actually attended the meeting if attendance records are provided
            let timeToUse = time;
            
            if (attendanceRecords && Array.isArray(attendanceRecords)) {
                console.log('Checking user attendance in provided records');
                const userEmail = session.user?.email || '';
                const userRecord = attendanceRecords.find(record => 
                    record.email.toLowerCase() === userEmail.toLowerCase()
                );
                
                if (userRecord) {
                    console.log(`Found user's attendance record with duration: ${userRecord.duration} seconds`);
                    // Use the user's actual duration if available
                    timeToUse = userRecord.duration;
                    
                    if (timeToUse <= 0) {
                        return NextResponse.json({ 
                            error: `You did not attend this meeting (duration: ${timeToUse} seconds). Cannot create time entry.` 
                        }, { status: 400 });
                    }
                } else if (!isManualPost) {
                    // Only block non-manual posts if user didn't attend
                    console.log(`User ${userEmail} did not attend this meeting`);
                    return NextResponse.json({ 
                        error: 'You did not attend this meeting. No attendance record found.' 
                    }, { status: 400 });
                }
            }
            
            // Validate time duration
            if (timeToUse <= 0 && !isManualPost) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 seconds.' 
                }, { status: 400 });
            }

            // Convert seconds to decimal hours for Intervals API
            const timeInHours = timeToUse ? Number((timeToUse / 3600).toFixed(2)) : 0;
            
            // For manual posts, allow user to specify time directly
            if (timeInHours <= 0 && !isManualPost) {
                return NextResponse.json({ 
                    error: 'Invalid time duration. Must be greater than 0 hours.' 
                }, { status: 400 });
            }
            
            // Create time entry with hours
            const result = await intervalsApi.createTimeEntry({
                taskId,
                date,
                time: timeInHours > 0 ? timeInHours : 0.01, // Minimum time entry of 0.01 hours for manual posts
                description: description || 'No description provided',
                workType: workType || 'Meeting',
                billable: billable ?? true
            });

            // Store in both storages regardless of manual or automated post
            const postedMeetingsStorage = new PostedMeetingsStorage();
            await postedMeetingsStorage.loadData();
            await postedMeetingsStorage.addPostedMeeting(
                session.user.email,
                {
                    id: meetingId || '',
                    subject: subject || 'No subject',
                    startTime: startTime || new Date().toISOString()
                }
            );
            
            // Also store in AI agent storage
            const aiAgentStorage = new AIAgentPostedMeetingsStorage();
            await aiAgentStorage.addPostedMeeting(
                session.user.email,
                {
                    meetingId: meetingId || '',
                    userId: session.user.email,
                    timeEntry: result.time,
                    rawResponse: result,
                    postedAt: date // Use the actual meeting date
                }
            );
            
            // Remove the meeting from reviews.json after successful posting
            try {
                const storageManager = StorageManager.getInstance();
                // Create a decision to mark the meeting as 'approved'
                await storageManager.updateReviewStatus({
                    meetingId: meetingId || '',
                    status: 'approved',
                    decidedAt: new Date().toISOString(),
                    decidedBy: session.user.email,
                    feedback: 'Meeting successfully posted to Intervals'
                });
                console.log(`Marked meeting ${meetingId} as approved in reviews.json`);
            } catch (error) {
                console.error('Error updating meeting status in reviews.json:', error);
                // Don't fail the request if this fails
            }

            console.log('Successfully created time entry:', result);
            return NextResponse.json({
                success: true,
                message: `Successfully logged ${timeInHours} hours`,
                result
            });
        } catch (error) {
            console.error('Error from Intervals API:', error);
            return NextResponse.json({ 
                error: error instanceof Error ? error.message : 'Failed to create time entry in Intervals'
            }, { status: 500 });
        }
    } catch (error) {
        console.error('Error in time entries endpoint:', error);
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Failed to process time entry request' 
        }, { status: 500 });
    }
} 