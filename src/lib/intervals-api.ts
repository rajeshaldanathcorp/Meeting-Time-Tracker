// Type definitions
interface UserAttributes {
    id: string;
    personid: string;
    firstname?: string;
    lastname?: string;
    name?: string;
    email?: string;
    active?: boolean;
    created?: string;
    updated?: string;
}

interface TaskAttributes {
    id: string;
    title: string;
    projectid: string;
    moduleid?: string;
    status?: string;
    priority?: number;
    description?: string;
    created?: string;
    updated?: string;
}

type User = UserAttributes;
type Task = TaskAttributes;

interface WorkType {
    id: string;
    worktype: string;
    worktypeid: string;
    projectid: string;
}

interface TimeEntryPayload {
    taskId: string;
    date: string;
    time: number;  // time in hours
    description: string;
    workType: string;
    billable?: boolean;
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

export class IntervalsAPI {
    private apiKey: string;
    private baseUrl = 'https://api.myintervals.com/';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private async request(endpoint: string, options: RequestInit = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
            'Accept': 'application/json'
        };

        const response = await fetch(url, {
            ...options,
            headers: {
                ...headers,
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(error.message || `HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    // Get current user information
    async getCurrentUser(): Promise<User> {
        return this.request('person/me');
    }

    // Get data from any Intervals endpoint
    private async getData(endpoint: string) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching data from ${endpoint}:`, error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    // Get project work types
    async getProjectWorkTypes(projectId?: string) {
        try {
            // First, try to get project-specific work types
            let workTypes = [];
            if (projectId) {
                const projectEndpoint = `/projectworktype/?projectid=${projectId}`;
                const projectResponse = await this.getData(projectEndpoint);
                if (projectResponse && projectResponse.projectworktype && Array.isArray(projectResponse.projectworktype)) {
                    workTypes = projectResponse.projectworktype;
                }
            }
            
            // If no project-specific work types or no project ID provided, get all work types
            if (workTypes.length === 0) {
                const allWorkTypesEndpoint = '/worktype';
                const allResponse = await this.getData(allWorkTypesEndpoint);
                if (allResponse && allResponse.worktype && Array.isArray(allResponse.worktype)) {
                    // Map the response to match the expected format
                    workTypes = allResponse.worktype.map((wt: any) => ({
                        id: wt.id,
                        worktype: wt.name,
                        worktypeid: wt.id,
                        projectid: projectId || ''
                    }));
                    console.log('Found global work types:', workTypes.map((wt: WorkType) => wt.worktype));
                }
            }
            
            if (workTypes.length === 0) {
                console.warn('No work types found for project or globally');
            } else {
                console.log(`Found ${workTypes.length} work types:`, workTypes.map((wt: WorkType) => wt.worktype));
            }
            
            return workTypes;
        } catch (error) {
            console.error('Error fetching work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }

    // Post a time entry
    async postTimeEntry(timeEntry: TimeEntryRequest) {
        try {
            if (!timeEntry.time || timeEntry.time <= 0) {
                throw new Error('Invalid time duration');
            }

            console.log('Posting time entry:', timeEntry);

            const response = await fetch(`${this.baseUrl}/time`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(timeEntry)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const result = await response.json();
            console.log(`Successfully posted time entry (${timeEntry.time} hours)`);
            return result;
        } catch (error) {
            console.error('Error posting time entry:', error instanceof Error ? error.message : 'Unknown error');
            throw error;
        }
    }

    // Get all tasks
    async getTasks() {
        const response = await this.request('task');
        if (!response || !response.task || !Array.isArray(response.task)) {
            console.warn('No tasks found or invalid response format');
            return [];
        }
        return response.task;
    }

    // Get project information
    async getProject(projectId: string | number) {
        try {
            const response = await this.getData(`/project/${projectId}`);
            if (!response || !response.project) {
                console.warn(`No project found with ID ${projectId}`);
                return null;
            }
            return response.project;
        } catch (error) {
            console.error('Error fetching project:', error instanceof Error ? error.message : 'Unknown error');
            return null;
        }
    }

    async getGlobalWorkTypes() {
        try {
            const endpoint = '/worktype';
            const response = await this.getData(endpoint);
            if (!response || !response.worktype || !Array.isArray(response.worktype)) {
                console.warn('No global work types found or invalid response format');
                return [];
            }
            
            // Map to a consistent format
            const workTypes = response.worktype.map((wt: any) => ({
                id: wt.id,
                worktype: wt.name,
                worktypeid: wt.id,
                projectid: ''
            }));
            
            console.log('Found global work types:', workTypes.map((wt: any) => wt.worktype));
            return workTypes;
        } catch (error) {
            console.error('Error fetching global work types:', error instanceof Error ? error.message : 'Unknown error');
            return [];
        }
    }

    async createTimeEntry(payload: TimeEntryPayload) {
        console.log('Creating time entry with payload:', payload);
        
        // Validate time duration (already in hours)
        if (!payload.time || payload.time <= 0) {
            throw new Error('Invalid time duration. Must be greater than 0 hours.');
        }

        // Get current user first to get their personid
        const user = await this.getCurrentUser();
        console.log('Current user:', user);

        // Get task details
        console.log('Fetching task details for ID:', payload.taskId);
        const tasks = await this.getTasks();
        const task = tasks.find((t: Task) => t.id === payload.taskId);
        
        if (!task) {
            console.error('Available tasks:', tasks.map((t: Task) => ({ id: t.id, title: t.title })));
            throw new Error(`Task not found with ID: ${payload.taskId}`);
        }
        console.log('Task details:', task);

        /* 
        // First try project-specific work types
        let workTypes = await this.getProjectWorkTypes(task.projectid);
        console.log('===== DEBUG: PROJECT WORK TYPES =====');
        workTypes.forEach((wt: WorkType) => {
            console.log(`Work Type: "${wt.worktype}", ID: ${wt.worktypeid}, Project ID: ${wt.projectid}`);
        });
        
        // Look for India-Meeting in project work types
        let indiaMeetingType = workTypes.find((wt: WorkType) => 
            wt.worktype.toLowerCase() === 'india-meeting'.toLowerCase()
        );
        
        // If not found in project work types, get global work types
        if (!indiaMeetingType) {
            console.log('India-Meeting not found in project work types, fetching global work types');
            const globalWorkTypes = await this.getGlobalWorkTypes();
            
            // Look for India-Meeting in global work types
            indiaMeetingType = globalWorkTypes.find((wt: WorkType) => 
                wt.worktype.toLowerCase() === 'india-meeting'.toLowerCase()
            );
            
            if (indiaMeetingType) {
                console.log('Found India-Meeting in global work types:', indiaMeetingType);
                // Associate it with the current project
                indiaMeetingType.projectid = task.projectid;
            }
        }
        
        if (!indiaMeetingType) {
            console.log('Work type we are looking for: India-Meeting');
            console.log('Available project work types:', workTypes.map((wt: WorkType) => wt.worktype).join(', '));
            throw new Error('India-Meeting work type not found. Please ensure this work type is available in your Intervals account.');
        }
        
        console.log('Using India-Meeting work type:', indiaMeetingType);
        */

        // TEMPORARY FIX: Use hardcoded worktype ID for India-Meeting
        console.log('Using hardcoded worktype ID 802279 for India-Meeting');
        const worktypeId = '802279'; // Hardcoded ID for India-Meeting

        const requestBody = {
            personid: user.personid,
            taskid: payload.taskId,
            projectid: task.projectid,
            moduleid: task.moduleid,
            date: payload.date,
            time: payload.time,
            description: payload.description,
            worktypeid: worktypeId, // Use hardcoded worktype ID
            billable: payload.billable ?? true
        };

        console.log('Posting time entry with request body:', requestBody);

        try {
            const response = await fetch(`${this.baseUrl}time`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(this.apiKey + ':X').toString('base64')}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Error response from Intervals:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorText
                });
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const result = await response.json();
            console.log('Successfully created time entry:', result);
            return result;
        } catch (error) {
            console.error('Failed to create time entry:', error);
            throw error;
        }
    }
}