import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { UserStorage } from '@/lib/user-storage';
import { IntervalsAPI } from '@/lib/intervals-api';

interface IntervalsApiError extends Error {
  response?: {
    status?: number;
  };
  message: string;
}

function isIntervalsApiError(error: unknown): error is IntervalsApiError {
  return error instanceof Error &&
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('response' in error || true);
}

export async function GET() {
  try {
    console.log('Starting tasks endpoint...');
    const session = await getServerSession(authOptions);
    console.log('Session:', session);

    if (!session?.user?.email) {
      console.error('No session or email found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Session user email:', session.user.email);

    // Initialize storage and load data
    const storage = new UserStorage();
    await storage.loadData(); // Wait for data to load
    const apiKey = storage.getUserApiKey(session.user.email);

    // Add API key format validation
    if (!apiKey) {
      return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
    }

    if (apiKey.length !== 11) {
      return NextResponse.json({ 
        error: 'Invalid Intervals API key format. The key should be exactly 11 characters long (e.g., 9bf2smemqha)' 
      }, { status: 401 });
    }

    // If no API key in storage, use the default test key
    // TODO: Remove this in production, only for testing
    const finalApiKey = apiKey || '9bf2smemqha';
    console.log('Using API key:', apiKey ? 'From storage' : 'Default test key');

    console.log('Initializing Intervals API with key...');
    const intervalsApi = new IntervalsAPI(finalApiKey);
    
    // First verify we can connect by getting the user info
    console.log('Verifying API connection...');
    try {
      const user = await intervalsApi.getCurrentUser();
      console.log('Successfully connected to Intervals as user:', user.firstname, user.lastname);

      // If we're using the test key and it worked, save it to storage
      if (!apiKey) {
        console.log('Saving working API key to storage...');
        await storage.setUserApiKey(session.user.email, session.user.email, finalApiKey);
      }
    } catch (error: unknown) {
      console.error('Failed to verify Intervals connection:', error);
      
      if (isIntervalsApiError(error)) {
        // Check for specific error types
        if (error.response?.status === 401) {
          return NextResponse.json({ 
            error: 'Invalid Intervals API key. Please check your key and try again.' 
          }, { status: 401 });
        }
        
        if (error.message?.includes('bad auth')) {
          return NextResponse.json({ 
            error: 'Authentication failed. Please verify your API key is correct.' 
          }, { status: 401 });
        }

        return NextResponse.json({ 
          error: 'Failed to connect to Intervals. Please check your API key and try again.' 
        }, { status: 401 });
      }
    }
    
    console.log('Fetching tasks from Intervals...');
    const tasks = await intervalsApi.getTasks();
    
    if (!tasks || tasks.length === 0) {
      console.log('No tasks found in Intervals');
      return NextResponse.json([]);
    }

    // Transform the response to match our Task interface
    const formattedTasks = tasks.map((task: { 
      id: string; 
      title?: string; 
      project?: string; 
      module?: string; 
      status?: string; 
    }) => ({
      id: task.id,
      title: task.title || 'Untitled Task',
      project: task.project || 'No Project',
      module: task.module || 'No Module',
      status: task.status || 'Unknown'
    }));

    console.log(`Successfully fetched ${formattedTasks.length} tasks`);
    return NextResponse.json(formattedTasks);
  } catch (error) {
    console.error('Error in /api/intervals/tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
} 