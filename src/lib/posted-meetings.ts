import { promises as fs } from 'fs';
import path from 'path';

interface PostedMeeting {
  id: string;
  subject: string;
  meetingDate: string;
  postedDate: string;
}

interface PostedMeetingsData {
  [userEmail: string]: PostedMeeting[];
}

export class PostedMeetingsStorage {
  private data: PostedMeetingsData = {};
  private readonly filePath: string;

  constructor() {
    this.filePath = path.join(process.cwd(), 'storage', 'posted-meetings.json');
  }

  private async loadData() {
    try {
      const fileContent = await fs.readFile(this.filePath, 'utf-8');
      this.data = JSON.parse(fileContent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist, initialize with empty data
        this.data = {};
        await this.saveData();
      } else {
        throw error;
      }
    }
  }

  private async saveData() {
    const dirPath = path.dirname(this.filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  public async addPostedMeeting(userEmail: string, meeting: { id: string, subject: string, startTime: string }) {
    await this.loadData();
    
    if (!this.data[userEmail]) {
      this.data[userEmail] = [];
    }

    this.data[userEmail].push({
      id: meeting.id,
      subject: meeting.subject,
      meetingDate: meeting.startTime,
      postedDate: new Date().toISOString()
    });

    await this.saveData();
  }

  public async getPostedMeetings(userEmail: string): Promise<PostedMeeting[]> {
    await this.loadData();
    return this.data[userEmail] || [];
  }

  public async clearPostedMeetings(userEmail: string) {
    await this.loadData();
    this.data[userEmail] = [];
    await this.saveData();
  }
} 