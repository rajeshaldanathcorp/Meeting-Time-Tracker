import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { apiKey } = await request.json();
        if (!apiKey) {
            return NextResponse.json({ error: 'API key is required' }, { status: 400 });
        }

        // Test the API key by making a request
        const intervalsApi = new IntervalsAPI(apiKey);
        try {
            await intervalsApi.getCurrentUser();
            console.log('API key validated successfully');

            // Save the API key
            try {
                const storage = new UserStorage();
                await storage.loadData();
                await storage.setUserApiKey(session.user.email, session.user.email, apiKey);

                console.log('API key saved for user:', session.user.email);
                return NextResponse.json({ success: true });
            } catch (storageError) {
                console.error('Error saving API key:', storageError);
                return NextResponse.json(
                    { error: 'Failed to save API key' },
                    { status: 500 }
                );
            }
        } catch (apiError) {
            console.error('API key validation failed:', apiError);
            return NextResponse.json(
                { error: 'Invalid API key' },
                { status: 401 }
            );
        }
    } catch (error) {
        console.error('Error in /api/intervals/validate:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to validate API key' },
            { status: 500 }
        );
    }
} 