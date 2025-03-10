import { NextResponse } from 'next/server';
import { AzureOpenAIClient } from '@/lib/azure-openai';

export async function GET() {
  try {
    // Log environment variables (redacting sensitive info)
    console.log('Azure OpenAI Config:', {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT ? 'Set' : 'Missing',
      apiKey: process.env.AZURE_OPENAI_API_KEY ? 'Set' : 'Missing',
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT ? 'Set' : 'Missing'
    });

    // Check if all required environment variables are set
    if (!process.env.AZURE_OPENAI_ENDPOINT || 
        !process.env.AZURE_OPENAI_API_KEY || 
        !process.env.AZURE_OPENAI_DEPLOYMENT) {
      return NextResponse.json({
        status: 'error',
        isAvailable: false,
        message: 'Azure OpenAI configuration is incomplete'
      });
    }

    const openai = new AzureOpenAIClient();
    await openai.getCompletion('Test connection');
    
    return NextResponse.json({
      status: 'success',
      isAvailable: true,
      message: 'Azure OpenAI is configured and working'
    });
  } catch (error: unknown) {
    console.error('Azure OpenAI Status Check Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle specific error cases
    if (errorMessage.includes('DeploymentNotFound')) {
      return NextResponse.json({
        status: 'pending',
        isAvailable: false,
        message: 'Azure OpenAI deployment is initializing. Please wait a few minutes.'
      });
    }
    
    if (errorMessage.includes('401')) {
      return NextResponse.json({
        status: 'error',
        isAvailable: false,
        message: 'Invalid Azure OpenAI credentials'
      });
    }
    
    return NextResponse.json({
      status: 'error',
      isAvailable: false,
      message: 'Failed to connect to Azure OpenAI'
    });
  }
} 