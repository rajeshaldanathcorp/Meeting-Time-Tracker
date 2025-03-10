"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIAgentPostedMeetingsStorage = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class AIAgentPostedMeetingsStorage {
    constructor() {
        this.data = { meetings: [] };
        this.storagePath = path_1.default.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json', 'ai-agent-meetings.json');
    }
    async loadData() {
        try {
            const data = await fs_1.promises.readFile(this.storagePath, 'utf-8');
            const parsedData = JSON.parse(data);
            // Clean up the data to only keep time entry format
            this.data = {
                meetings: parsedData.meetings
                    .filter((m) => m.meetingId && m.timeEntry) // Only keep entries with time entry info
                    .map((m) => ({
                    meetingId: m.meetingId || m.id, // Handle both old and new format
                    userId: m.userId,
                    timeEntry: m.timeEntry,
                    rawResponse: m.rawResponse,
                    postedAt: m.postedAt || new Date().toISOString()
                }))
            };
            // Save cleaned data back to file
            await this.saveData();
        }
        catch (_a) {
            // If file doesn't exist or can't be read, use empty data
            this.data = { meetings: [] };
        }
    }
    async saveData() {
        try {
            const dir = path_1.default.dirname(this.storagePath);
            await fs_1.promises.mkdir(dir, { recursive: true });
            await fs_1.promises.writeFile(this.storagePath, JSON.stringify(this.data, null, 2));
        }
        catch (error) {
            console.error('Error saving posted meetings data:', error);
            throw error;
        }
    }
    async addPostedMeeting(userId, postedMeeting) {
        await this.loadData();
        // Check if meeting already exists
        const existingMeeting = this.data.meetings.find(m => m.meetingId === postedMeeting.meetingId);
        if (existingMeeting) {
            return;
        }
        // Add new meeting
        this.data.meetings.push({
            meetingId: postedMeeting.meetingId,
            userId: postedMeeting.userId,
            timeEntry: postedMeeting.timeEntry,
            rawResponse: postedMeeting.rawResponse,
            postedAt: postedMeeting.postedAt
        });
        await this.saveData();
    }
    async getPostedMeetings(userId) {
        await this.loadData();
        return this.data.meetings.filter(m => m.userId === userId);
    }
    async clearUserMeetings(userId) {
        await this.loadData();
        this.data.meetings = this.data.meetings.filter(m => m.userId !== userId);
        await this.saveData();
    }
    async isPosted(userId, meetingId) {
        await this.loadData();
        return this.data.meetings.some(m => m.meetingId === meetingId && m.userId === userId);
    }
}
exports.AIAgentPostedMeetingsStorage = AIAgentPostedMeetingsStorage;
