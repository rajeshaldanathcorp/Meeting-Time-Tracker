export interface ProjectWorkType {
    id: string;
    projectid: string;
    worktypeid: string;
    worktype: string;
    active: string;
}

export interface WorkType {
    id: string;
    name: string;
    projectId?: string;
    workTypeId?: string;
    projectWorkTypeId?: string;
}

export interface Person {
    id: string;
    firstname: string;
    lastname: string;
    email: string;
}

export interface TimeEntry {
    id?: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;           // YYYY-MM-DD format
    time: number;           // Decimal hours (e.g., 0.5 for 30 minutes)
    description: string;
    billable: boolean;
    datemodified?: string;   // Optional for initial creation
}

export interface TimeEntryResponse extends TimeEntry {
    created: string;
    updated: string;
} 