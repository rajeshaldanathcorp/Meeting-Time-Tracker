import { NextResponse } from 'next/server';
import { IntervalsAPI } from '@/lib/intervals-api';

export async function GET() {
  try {
    // Use the test API key directly for now
    const apiKey = '9bf2smemqha';
    console.log('Testing Intervals API with key:', apiKey);

    const intervalsApi = new IntervalsAPI(apiKey);
    
    console.log('Making request to /me endpoint...');
    const user = await intervalsApi.getCurrentUser();
    console.log('Response from /me:', user);

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Error testing Intervals API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect to Intervals' },
      { status: 500 }
    );
  }
} 