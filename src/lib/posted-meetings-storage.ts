import { promises as fs } from 'fs';
import path from 'path';

interface PostedMeeting {
    id: string;  // This will be our unique key: userId_meetingName_meetingId_time
    subject: string;
    meetingDate: string;
    postedDate: string;
}

interface UserMeetings {
    email: string;
    lastPostedDate: string;
    meetings: PostedMeeting[];
}

interface StorageData {
    [email: string]: UserMeetings;
}

export class PostedMeetingsStorage {
    private storagePath: string;
    private data: StorageData = {};

    constructor() {
        this.storagePath = path.join(process.cwd(), 'storage', 'posted-meetings.json');
    }

    async loadData() {
        try {
            const data = await fs.readFile(this.storagePath, 'utf-8');
            this.data = JSON.parse(data);
        } catch {
            // If file doesn't exist or can't be read, use empty data
            this.data = {};
        }
    }

    async saveData() {
        await fs.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
    }

    async addPostedMeeting(email: string, meeting: { id: string; subject: string; startTime: string; threadId?: string }) {
        await this.loadData();
        console.log('\n=== ADDING POSTED MEETING ===');
        
        // Normalize the meeting subject
        const normalizedSubject = meeting.subject 
            ? meeting.subject
                .trim()
                .replace(/\s+/g, ' ')    // normalize spaces
                .replace(/[^\w\s-]/g, '') // remove special chars except hyphen
                .trim()
            : 'unnamed-meeting';
        
        // Generate consistent ID using the same format as stored data (repeating subject)
        const meetingId = `${email.toLowerCase()}_${normalizedSubject}_${normalizedSubject}_${meeting.startTime || new Date().toISOString()}`;

        console.log('Adding meeting:', {
            email,
            originalId: meeting.id,
            normalizedId: meetingId,
            subject: meeting.subject,
            normalizedSubject,
            startTime: meeting.startTime
        });

        // Initialize user data if it doesn't exist
        if (!this.data[email]) {
            this.data[email] = {
                email,
                lastPostedDate: new Date().toISOString(),
                meetings: []
            };
        }

        // Check if meeting is already posted using normalized ID
        const existingMeeting = this.data[email].meetings.some(m => m.id === meetingId);

        if (existingMeeting) {
            console.log('Meeting already exists in storage');
            console.log('===========================\n');
            return;
        }

        // Add new meeting
        this.data[email].meetings.push({
            id: meetingId,
            subject: meeting.subject,
            meetingDate: meeting.startTime,
            postedDate: new Date().toISOString()
        });

        // Update last posted date
        this.data[email].lastPostedDate = new Date().toISOString();

        await this.saveData();
        console.log('Successfully added meeting');
        console.log('===========================\n');
    }

    async getPostedMeetings(email: string): Promise<PostedMeeting[]> {
        await this.loadData();
        console.log('Getting posted meetings:', {
            email,
            hasData: !!this.data[email],
            totalMeetings: this.data[email]?.meetings?.length || 0
        });
        
        if (!this.data[email]?.meetings) {
            return [];
        }

        // Sort meetings by posted date, most recent first
        return [...this.data[email].meetings].sort(
            (a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
        );
    }

    async getLastPostedDate(email: string): Promise<string | null> {
        await this.loadData();
        return this.data[email]?.lastPostedDate || null;
    }

    async isPosted(email: string, meetingId: string): Promise<boolean> {
        await this.loadData();
        
        console.log('\n=== POSTED MEETING CHECK ===');
        console.log('Looking for meeting:', meetingId);
        
        if (!this.data[email]?.meetings) {
            console.log('No stored meetings found for user');
            console.log('=========================\n');
            return false;
        }

        // Direct ID comparison since IDs are now normalized consistently
        const isPosted = this.data[email].meetings.some(m => m.id === meetingId);

        console.log('Comparing IDs:', {
            lookingFor: meetingId,
            found: isPosted
        });
        console.log('=========================\n');
        
        return isPosted;
    }

    async filterPostedMeetings(email: string, meetingIds: string[]): Promise<string[]> {
        await this.loadData();
        const postedIds = new Set(this.data[email]?.meetings.map(m => m.id) || []);
        return meetingIds.filter(id => !postedIds.has(id));
    }

    async clearUserMeetings(userEmail: string): Promise<void> {
        await this.loadData();
        this.data[userEmail] = {
            email: userEmail,
            lastPostedDate: new Date().toISOString(),
            meetings: []
        };
        await this.saveData();
    }
} 