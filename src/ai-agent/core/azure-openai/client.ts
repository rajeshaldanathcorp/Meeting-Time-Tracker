import { AzureOpenAIConfig, validateConfig } from '../../config/azure-openai';
import { RateLimiter } from 'limiter';
import { generateMeetingAnalysisPrompt } from './prompts/meeting-analysis';

interface OpenAIResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

class AzureOpenAIClient {
    private static instance: AzureOpenAIClient;
    private tokenLimiter: RateLimiter;
    private requestLimiter: RateLimiter;

    private constructor() {
        validateConfig();
        
        // Initialize rate limiters
        this.tokenLimiter = new RateLimiter({
            tokensPerInterval: AzureOpenAIConfig.tokensPerMinute,
            interval: 'minute'
        });
        
        this.requestLimiter = new RateLimiter({
            tokensPerInterval: AzureOpenAIConfig.requestsPerMinute,
            interval: 'minute'
        });
    }

    public static getInstance(): AzureOpenAIClient {
        if (!AzureOpenAIClient.instance) {
            AzureOpenAIClient.instance = new AzureOpenAIClient();
        }
        return AzureOpenAIClient.instance;
    }

    private async waitForCapacity(tokens: number): Promise<void> {
        await Promise.all([
            this.tokenLimiter.removeTokens(tokens),
            this.requestLimiter.removeTokens(1)
        ]);
    }

    private async retryWithExponentialBackoff<T>(
        operation: () => Promise<T>,
        retryCount: number = 0
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retryCount >= AzureOpenAIConfig.maxRetries) {
                throw error;
            }

            const delay = AzureOpenAIConfig.retryDelay * Math.pow(2, retryCount);
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.retryWithExponentialBackoff(operation, retryCount + 1);
        }
    }

    public async sendRequest(prompt: string, options: {
        temperature?: number;
        maxTokens?: number;
        model?: string;
    } = {}): Promise<string> {
        const estimatedTokens = Math.ceil(prompt.length / 4);
        await this.waitForCapacity(estimatedTokens);

        return this.retryWithExponentialBackoff(async () => {
            const response = await fetch(
                `${AzureOpenAIConfig.endpoint}/openai/deployments/${AzureOpenAIConfig.deployment}/chat/completions?api-version=2024-02-15-preview`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-key': AzureOpenAIConfig.apiKey as string
                    },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: prompt }],
                        temperature: options.temperature ?? AzureOpenAIConfig.defaultTemperature,
                        max_tokens: options.maxTokens ?? AzureOpenAIConfig.defaultMaxTokens,
                        model: options.model ?? AzureOpenAIConfig.defaultModel
                    })
                }
            );

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}\n${errorBody}`);
            }

            const data: OpenAIResponse = await response.json();
            
            if (!data.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from Azure OpenAI API');
            }

            return data.choices[0].message.content;
        });
    }

    public async analyzeMeeting(meetingData: string): Promise<string> {
        const prompt = generateMeetingAnalysisPrompt(meetingData);
        return this.sendRequest(prompt, {
            temperature: 0.3, // Lower temperature for more focused analysis
            maxTokens: 1500  // Increased for detailed analysis
        });
    }
}

export const openAIClient = AzureOpenAIClient.getInstance(); 