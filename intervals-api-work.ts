// Type definitions
interface User {
    id: string;
    name: string;
    email: string;
    personid: string;
    [key: string]: any; // For other potential user properties
}

interface Project {
    id: string;
    name: string;
    [key: string]: any; // For other potential project properties
}

interface Module {
    id: string;
    name: string;
}

interface Task {
    id: string;
    title: string;
    projectid: string;
    [key: string]: any;
}

interface WorkType {
    id: string;
    worktype: string;
    worktypeid: string;
    projectid: string;
}

interface TimeEntryPayload {
    person: User;
    date: string;
    time: number;
    project: Project;
    module: Module;
    task: Task;
    workType: WorkType;
    billable?: boolean;
    description?: string;
}

interface TimeEntryRequest {
    personid: string;
    date: string;
    time: number;
    projectid: string;
    moduleid: string;
    taskid: string;
    description: string;
    billable: boolean;
    worktypeid: string;
}

interface ApiResponse<T> {
    [key: string]: T[] | undefined;
}

interface ProjectResponse {
    project: Project;
}

// Intervals API Integration
class IntervalsAPI {
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;

    constructor(apiToken: string) {
        this.baseUrl = 'https://api.myintervals.com';
        this.headers = {
            'Authorization': `Basic ${Buffer.from(apiToken + ':').toString('base64')}`,
            'Content-Type': 'application/json'
        };
    }

    // Get current user information
    async getCurrentUser(): Promise<User> {
        try {
            const response = await fetch(`${this.baseUrl}/me`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as ApiResponse<User>;
            if (!data || !data.me || !Array.isArray(data.me) || data.me.length === 0) {
                throw new Error('Invalid response format from API');
            }

            return data.me[0];
        } catch (error) {
            console.error('Error fetching user:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    // Get data from any Intervals endpoint
    private async getData<T>(endpoint: string): Promise<T | null> {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            return await response.json() as T;
        } catch (error) {
            console.error(`Error fetching data from ${endpoint}:`, error instanceof Error ? error.message : error);
            return null;
        }
    }

    // Get project work types
    async getProjectWorkTypes(): Promise<WorkType[]> {
        try {
            const response = await this.getData<ApiResponse<WorkType>>('/projectworktype');
            if (!response?.projectworktype || !Array.isArray(response.projectworktype)) {
                console.warn('No project work types found or invalid response format');
                return [];
            }
            return response.projectworktype;
        } catch (error) {
            console.error('Error fetching project work types:', error instanceof Error ? error.message : error);
            return [];
        }
    }

    // Post a time entry
    async postTimeEntry({
        person,
        date,
        time,
        project,
        module,
        task,
        workType,
        billable = true,
        description = ''
    }: TimeEntryPayload): Promise<any | null> {
        try {
            // Clean description
            const cleanDescription = description
                .replace(/[^\x00-\x7F]+/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const timeEntry: TimeEntryRequest = {
                personid: person.id || person.personid,
                date,
                time,
                projectid: project.id,
                moduleid: module.id,
                taskid: task.id,
                description: cleanDescription,
                billable,
                worktypeid: workType.worktypeid
            };

            console.log('Posting time entry:', timeEntry);

            const response = await fetch(`${this.baseUrl}/time`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(timeEntry)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const result = await response.json();
            console.log(`Successfully posted time entry (${time} hours)`);
            return result;
        } catch (error) {
            console.error('Error posting time entry:', error instanceof Error ? error.message : error);
            return null;
        }
    }

    // Get all tasks
    async getTasks(): Promise<Task[]> {
        try {
            const response = await this.getData<ApiResponse<Task>>('/task');
            if (!response?.task || !Array.isArray(response.task)) {
                console.warn('No tasks found or invalid response format');
                return [];
            }
            return response.task;
        } catch (error) {
            console.error('Error fetching tasks:', error instanceof Error ? error.message : error);
            return [];
        }
    }

    // Get project information
    async getProject(projectId: string): Promise<Project | null> {
        try {
            const response = await this.getData<ProjectResponse>(`/project/${projectId}`);
            if (!response?.project) {
                console.warn(`No project found with ID ${projectId}`);
                return null;
            }
            return response.project;
        } catch (error) {
            console.error('Error fetching project:', error instanceof Error ? error.message : error);
            return null;
        }
    }
}

// Example usage
async function testIntervalsAPI(): Promise<void> {
    console.log('Starting Intervals API Test...');
    const api = new IntervalsAPI('9bf2smemqha');

    try {
        // Get current user
        const user = await api.getCurrentUser();
        if (!user) {
            throw new Error('Failed to get user information');
        }

        // Get tasks
        console.log('\nFetching tasks...');
        const tasks = await api.getTasks();
        if (tasks.length === 0) {
            throw new Error('No tasks available');
        }
        console.log('Available tasks:', tasks.map(task => ({
            id: task.id,
            title: task.title,
            projectid: task.projectid
        })));

        // Find task for our project
        const projectTask = tasks.find(task => task.projectid === '1415488');
        if (!projectTask) {
            throw new Error('No task found for project 1415488');
        }
        console.log('\nUsing task:', {
            id: projectTask.id,
            title: projectTask.title,
            projectid: projectTask.projectid
        });

        // Get project work types
        console.log('\nFetching project work types...');
        const workTypes = await api.getProjectWorkTypes();
        if (workTypes.length === 0) {
            throw new Error('No project work types available');
        }
        console.log('Available work types:', workTypes.map(wt => ({
            id: wt.id,
            worktype: wt.worktype,
            worktypeid: wt.worktypeid,
            projectid: wt.projectid
        })));

        // Find work type for our project
        const projectWorkType = workTypes.find(wt => 
            wt.projectid === '1415488' && 
            wt.worktype === 'Engineering / Development'
        ) || workTypes.find(wt => wt.projectid === '1415488') || workTypes[0];
        
        console.log('\nUsing work type:', {
            id: projectWorkType.id,
            projectid: projectWorkType.projectid,
            worktypeid: projectWorkType.worktypeid,
            worktype: projectWorkType.worktype
        });

        // Example time entry based on the interface
        const timeEntry: TimeEntryPayload = {
            person: user,
            date: '2025-01-04', // Format: YYYY-MM-DD
            time: 1.0,
            project: { 
                id: '1415488',
                name: 'WD Project'
            },
            module: { 
                id: '548275',
                name: 'Development'
            },
            task: projectTask,
            workType: projectWorkType,
            billable: true,
            description: 'API Test Entry'
        };

        console.log('\nPosting time entry...');
        const result = await api.postTimeEntry(timeEntry);
        
        if (result) {
            console.log('Time entry successfully posted!');
            console.log('Result:', result);
        } else {
            console.log('Failed to post time entry.');
        }

    } catch (error) {
        console.error('\nTest failed:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Run the test
testIntervalsAPI(); 