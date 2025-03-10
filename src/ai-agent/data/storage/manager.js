"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageManager = exports.StorageManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
class StorageManager {
    constructor() {
        this.storagePath = path_1.default.join(process.cwd(), 'src', 'ai-agent', 'data', 'storage', 'json');
        this.meetingsFile = path_1.default.join(this.storagePath, 'ai-agent-meetings.json');
        this.reviewsPath = path_1.default.join(this.storagePath, 'reviews.json');
        this.decisionsPath = path_1.default.join(this.storagePath, 'review-decisions.json');
        this.initializeStorage();
    }
    static getInstance() {
        if (!StorageManager.instance) {
            StorageManager.instance = new StorageManager();
        }
        return StorageManager.instance;
    }
    async initializeStorage() {
        try {
            // Create storage directory if it doesn't exist
            await promises_1.default.mkdir(this.storagePath, { recursive: true });
            // Create meetings file with empty array if it doesn't exist
            try {
                await promises_1.default.access(this.meetingsFile);
            }
            catch (_a) {
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
            }
        }
        catch (error) {
            console.error('Error initializing storage:', error);
            throw new Error('Failed to initialize storage');
        }
    }
    getFilePath(fileName) {
        return path_1.default.join(this.storagePath, fileName);
    }
    async loadMeetings() {
        try {
            const data = await promises_1.default.readFile(this.meetingsFile, 'utf-8');
            try {
                // Clean the data before parsing
                const cleanData = data.trim().replace(/^\uFEFF/, ''); // Remove BOM if present
                const parsedData = JSON.parse(cleanData);
                return parsedData.meetings || [];
            }
            catch (parseError) {
                console.error('Error parsing meetings JSON:', parseError);
                // If JSON is invalid, backup the corrupted file and create a new empty one
                const backupPath = path_1.default.join(this.storagePath, `corrupted-meetings-${Date.now()}.json`);
                await promises_1.default.writeFile(backupPath, data, 'utf-8');
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                // If file doesn't exist, create it with empty array
                await promises_1.default.writeFile(this.meetingsFile, JSON.stringify({ meetings: [] }, null, 2), 'utf-8');
                return [];
            }
            console.error('Error loading meetings:', error);
            throw new Error('Failed to load meetings');
        }
    }
    async saveMeeting(meeting) {
        try {
            const meetings = await this.loadMeetings();
            const existingIndex = meetings.findIndex(m => m.id === meeting.id);
            if (existingIndex >= 0) {
                meetings[existingIndex] = meeting;
            }
            else {
                meetings.push(meeting);
            }
            // Save with the correct structure
            const data = {
                meetings: meetings
            };
            // Ensure clean JSON output
            const cleanJson = JSON.stringify(data, null, 2).trim() + '\n';
            await promises_1.default.writeFile(this.meetingsFile, cleanJson, 'utf-8');
        }
        catch (error) {
            console.error('Error saving meeting:', error);
            throw new Error('Failed to save meeting');
        }
    }
    async getMeeting(id) {
        try {
            const meetings = await this.loadMeetings();
            return meetings.find(m => m.id === id) || null;
        }
        catch (error) {
            console.error('Error getting meeting:', error);
            throw new Error('Failed to get meeting');
        }
    }
    async listMeetings(userId) {
        try {
            const meetings = await this.loadMeetings();
            return meetings.filter(m => m.userId === userId);
        }
        catch (error) {
            console.error('Error listing meetings:', error);
            throw new Error('Failed to list meetings');
        }
    }
    async saveMeetings(meetings) {
        try {
            const data = {
                meetings: meetings
            };
            await promises_1.default.writeFile(this.meetingsFile, JSON.stringify(data, null, 2));
        }
        catch (error) {
            console.error('Error saving meetings:', error);
            throw new Error('Failed to save meetings');
        }
    }
    // Backup functionality
    async createBackup() {
        try {
            const meetings = await this.loadMeetings();
            const backupPath = this.getFilePath(`backup-${new Date().toISOString()}.json`);
            await promises_1.default.writeFile(backupPath, JSON.stringify(meetings, null, 2));
        }
        catch (error) {
            console.error('Error creating backup:', error);
            throw new Error('Failed to create backup');
        }
    }
    async restoreFromBackup(backupFileName) {
        try {
            const backupPath = this.getFilePath(backupFileName);
            const backupData = await promises_1.default.readFile(backupPath, 'utf-8');
            const meetings = JSON.parse(backupData);
            await this.saveMeetings(meetings);
        }
        catch (error) {
            console.error('Error restoring from backup:', error);
            throw new Error('Failed to restore from backup');
        }
    }
    // Review-related methods
    async storeMeetingForReview(meeting) {
        const reviews = await this.readReviews();
        // Check if this meeting already exists in the reviews
        const existingMeetingIndex = reviews.findIndex(review => review.id === meeting.id);
        if (existingMeetingIndex !== -1) {
            // Meeting already exists, update it instead of adding a duplicate
            console.log(`Meeting with ID ${meeting.id} already exists in reviews, updating instead of adding duplicate`);
            reviews[existingMeetingIndex] = meeting;
        }
        else {
            // Meeting doesn't exist, add it
            console.log(`Adding new meeting with ID ${meeting.id} to reviews`);
            reviews.push(meeting);
        }
        await this.writeReviews(reviews);
    }
    async getPendingReviews(userId) {
        const reviews = await this.readReviews();
        return reviews.filter(review => review.status === 'pending');
    }
    async getAllReviews(userId) {
        return this.readReviews();
    }
    async getMeetingForReview(meetingId) {
        const reviews = await this.readReviews();
        return reviews.find(review => review.id === meetingId) || null;
    }
    async updateReviewStatus(decision) {
        const reviews = await this.readReviews();
        const reviewIndex = reviews.findIndex(review => review.id === decision.meetingId);
        if (reviewIndex !== -1) {
            reviews[reviewIndex].status = decision.status;
            await this.writeReviews(reviews);
        }
    }
    async storeReviewDecision(decision) {
        const decisions = await this.readDecisions();
        decisions.push(decision);
        await this.writeDecisions(decisions);
    }
    // Private helper methods
    async readReviews() {
        try {
            const content = await promises_1.default.readFile(this.reviewsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return [];
        }
    }
    async writeReviews(reviews) {
        await promises_1.default.writeFile(this.reviewsPath, JSON.stringify(reviews, null, 2));
    }
    async readDecisions() {
        try {
            const content = await promises_1.default.readFile(this.decisionsPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            return [];
        }
    }
    async writeDecisions(decisions) {
        await promises_1.default.writeFile(this.decisionsPath, JSON.stringify(decisions, null, 2));
    }
}
exports.StorageManager = StorageManager;
exports.storageManager = StorageManager.getInstance();
