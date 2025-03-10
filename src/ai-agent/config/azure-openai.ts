export const AzureOpenAIConfig = {
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
    
    // Rate limits
    tokensPerMinute: 8000,
    requestsPerMinute: 48,
    
    // Model settings
    defaultModel: 'gpt-4o',
    defaultTemperature: 0.7,
    defaultMaxTokens: 8000,
    
    // Retry settings
    maxRetries: 3,
    retryDelay: 1000, // ms
    
    // Timeout settings
    requestTimeout: 30000, // ms
    
    // Batch settings
    maxBatchSize: 10,
    batchDelayMs: 100,
};

// Validate required environment variables
export const validateConfig = (): void => {
    const required = ['AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required Azure OpenAI configuration: ${missing.join(', ')}`);
    }
}; 