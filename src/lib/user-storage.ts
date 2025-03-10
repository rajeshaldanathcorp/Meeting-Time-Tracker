// import fs from 'fs';
// import path from 'path';
// import { mkdir, writeFile, readFile } from 'fs/promises';

interface UserData {
  userId: string;
  email: string;
  intervalsApiKey: string;
  lastSync?: string;
}

interface PostedMeeting {
  id: string;
  subject: string;
  date: string;
  postedDate: string;
  userId: string;
}

interface StorageData {
  users: UserData[];
  postedMeetings: PostedMeeting[];
}

export class UserStorage {
  private data: StorageData;
  private readonly STORAGE_KEY = 'meeting-tracker-data';
  private readonly storagePath = '.data';
  private readonly storageFile = '.data/user-data.json';

  constructor() {
    this.data = { users: [], postedMeetings: [] };
    this.loadData().catch(error => {
      console.error('Error loading data in constructor:', error);
    });
  }

  public async loadData(): Promise<void> {
    if (typeof window === 'undefined') {
      // Server-side: Read from file
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        const filePath = join(process.cwd(), this.storageFile);
        
        try {
          const data = await fs.readFile(filePath, 'utf8');
          this.data = JSON.parse(data);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist yet, use default empty data
            await this.ensureStorageDirectory();
            await this.saveData();
          } else {
            console.error('Error reading storage file:', error);
          }
        }
      } catch (error) {
        console.error('Error importing fs modules:', error);
      }
    } else {
      // Client-side: Read from localStorage
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          this.data = JSON.parse(data);
        }
      } catch (error) {
        console.error('Error reading from localStorage:', error);
      }
    }
  }

  private async ensureStorageDirectory(): Promise<void> {
    if (typeof window === 'undefined') {
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        await fs.mkdir(join(process.cwd(), this.storagePath), { recursive: true });
      } catch (error) {
        console.error('Error creating storage directory:', error);
      }
    }
  }

  private async saveData(): Promise<void> {
    if (typeof window === 'undefined') {
      // Server-side: Save to file
      try {
        const { promises: fs } = await import('fs');
        const { join } = await import('path');
        await this.ensureStorageDirectory();
        await fs.writeFile(
          join(process.cwd(), this.storageFile),
          JSON.stringify(this.data, null, 2)
        );
      } catch (error) {
        console.error('Error saving to file:', error);
      }
    } else {
      // Client-side: Save to localStorage
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
      } catch (error) {
        console.error('Error saving to localStorage:', error);
      }
    }
  }

  getUserApiKey(userId: string): string | null {
    console.log('Getting API key for user:', userId);
    console.log('Current users in storage:', this.data.users);
    const user = this.data.users.find(u => u.userId === userId || u.email === userId);
    console.log('Found user:', user ? 'Yes' : 'No');
    return user?.intervalsApiKey || null;
  }

  async setUserApiKey(userId: string, email: string, apiKey: string): Promise<void> {
    console.log('Setting API key for user:', { userId, email });
    const existingUserIndex = this.data.users.findIndex(u => u.userId === userId || u.email === email);
    const userData: UserData = {
      userId,
      email,
      intervalsApiKey: apiKey,
      lastSync: new Date().toISOString()
    };

    if (existingUserIndex >= 0) {
      console.log('Updating existing user');
      this.data.users[existingUserIndex] = userData;
    } else {
      console.log('Adding new user');
      this.data.users.push(userData);
    }

    await this.saveData();
    console.log('Current users after save:', this.data.users);
  }

  addPostedMeeting(meeting: PostedMeeting): void {
    this.data.postedMeetings.push(meeting);
    this.saveData();
  }

  getPostedMeetings(userId: string, startDate: string, endDate: string): PostedMeeting[] {
    return this.data.postedMeetings.filter(meeting => {
      const meetingDate = new Date(meeting.date);
      return meetingDate >= new Date(startDate) && meetingDate <= new Date(endDate);
    });
  }

  isUserFirstLogin(userId: string): boolean {
    return !this.data.users.some(u => u.userId === userId);
  }

  updateLastSync(userId: string): void {
    const user = this.data.users.find(u => u.userId === userId);
    if (user) {
      user.lastSync = new Date().toISOString();
      this.saveData();
    }
  }
} 