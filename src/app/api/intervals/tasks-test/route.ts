import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/auth';
import { IntervalsAPI } from '@/lib/intervals-api';
import { UserStorage } from '@/lib/user-storage';

interface Task {
  id: string;
  title: string;
  project: string;
  module: string;
  status: string;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storage = new UserStorage();
    const apiKey = storage.getUserApiKey(session.user.email);
    if (!apiKey) {
      return NextResponse.json({ error: 'Intervals API key not configured' }, { status: 400 });
    }

    const intervalsApi = new IntervalsAPI(apiKey);
    const tasks = await intervalsApi.getTasks();

    // Return first 5 tasks for easier viewing
    const sampleTasks = tasks.slice(0, 5).map((task: Task) => ({
      id: task.id,
      title: task.title,
      project: task.project,
      module: task.module,
      status: task.status
    }));

    return NextResponse.json(sampleTasks);
  } catch (error) {
    console.error('Error in /api/intervals/tasks-test:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
} 