import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { PostedMeetingsStorage } from '@/lib/posted-meetings-storage';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const storage = new PostedMeetingsStorage();
        const meetings = await storage.getPostedMeetings(session.user.email);

        return NextResponse.json({
            meetings
        });
    } catch (error) {
        console.error('Error fetching posted meetings:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch posted meetings' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const storage = new PostedMeetingsStorage();
        await storage.clearUserMeetings(session.user.email);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error clearing posted meetings:', error);
        return NextResponse.json(
            { error: 'Failed to clear posted meetings' },
            { status: 500 }
        );
    }
} 