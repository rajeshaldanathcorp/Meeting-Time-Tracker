export interface Task {
    id: string;
    title: string;
    description?: string;
    projectid: string;
    project: string;
    status: string;
    priority?: string;
    clientid: string;
    client: string;
    moduleid: string;
    module: string;
    assigneeid?: string;
}

export class IntervalsAPI {
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;

    constructor(apiToken: string) {
        this.baseUrl = 'https://api.myintervals.com';
        this.headers = {
            'Authorization': `Basic ${Buffer.from(apiToken + ':X').toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    async getTasks(): Promise<Task[]> {
        try {
            const response = await fetch(`${this.baseUrl}/task/`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch tasks: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (!data?.task || !Array.isArray(data.task)) {
                console.warn('No tasks found or invalid response format');
                return [];
            }

            return data.task.map((task: any) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                project: task.project?.name,
                status: task.status?.name || 'Unknown',
                priority: task.priority?.name
            }));
        } catch (error) {
            console.error('Error fetching tasks from Intervals:', error);
            return [];
        }
    }
} 