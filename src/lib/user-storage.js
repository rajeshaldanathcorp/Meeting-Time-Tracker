"use strict";
// import fs from 'fs';
// import path from 'path';
// import { mkdir, writeFile, readFile } from 'fs/promises';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStorage = void 0;
class UserStorage {
    constructor() {
        this.STORAGE_KEY = 'meeting-tracker-data';
        this.storagePath = '.data';
        this.storageFile = '.data/user-data.json';
        this.data = { users: [], postedMeetings: [] };
        this.loadData().catch(error => {
            console.error('Error loading data in constructor:', error);
        });
    }
    async loadData() {
        if (typeof window === 'undefined') {
            // Server-side: Read from file
            try {
                const { promises: fs } = await Promise.resolve().then(() => __importStar(require('fs')));
                const { join } = await Promise.resolve().then(() => __importStar(require('path')));
                const filePath = join(process.cwd(), this.storageFile);
                try {
                    const data = await fs.readFile(filePath, 'utf8');
                    this.data = JSON.parse(data);
                }
                catch (error) {
                    if (error.code === 'ENOENT') {
                        // File doesn't exist yet, use default empty data
                        await this.ensureStorageDirectory();
                        await this.saveData();
                    }
                    else {
                        console.error('Error reading storage file:', error);
                    }
                }
            }
            catch (error) {
                console.error('Error importing fs modules:', error);
            }
        }
        else {
            // Client-side: Read from localStorage
            try {
                const data = localStorage.getItem(this.STORAGE_KEY);
                if (data) {
                    this.data = JSON.parse(data);
                }
            }
            catch (error) {
                console.error('Error reading from localStorage:', error);
            }
        }
    }
    async ensureStorageDirectory() {
        if (typeof window === 'undefined') {
            try {
                const { promises: fs } = await Promise.resolve().then(() => __importStar(require('fs')));
                const { join } = await Promise.resolve().then(() => __importStar(require('path')));
                await fs.mkdir(join(process.cwd(), this.storagePath), { recursive: true });
            }
            catch (error) {
                console.error('Error creating storage directory:', error);
            }
        }
    }
    async saveData() {
        if (typeof window === 'undefined') {
            // Server-side: Save to file
            try {
                const { promises: fs } = await Promise.resolve().then(() => __importStar(require('fs')));
                const { join } = await Promise.resolve().then(() => __importStar(require('path')));
                await this.ensureStorageDirectory();
                await fs.writeFile(join(process.cwd(), this.storageFile), JSON.stringify(this.data, null, 2));
            }
            catch (error) {
                console.error('Error saving to file:', error);
            }
        }
        else {
            // Client-side: Save to localStorage
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
            }
            catch (error) {
                console.error('Error saving to localStorage:', error);
            }
        }
    }
    getUserApiKey(userId) {
        console.log('Getting API key for user:', userId);
        console.log('Current users in storage:', this.data.users);
        const user = this.data.users.find(u => u.userId === userId || u.email === userId);
        console.log('Found user:', user ? 'Yes' : 'No');
        return (user === null || user === void 0 ? void 0 : user.intervalsApiKey) || null;
    }
    async setUserApiKey(userId, email, apiKey) {
        console.log('Setting API key for user:', { userId, email });
        const existingUserIndex = this.data.users.findIndex(u => u.userId === userId || u.email === email);
        const userData = {
            userId,
            email,
            intervalsApiKey: apiKey,
            lastSync: new Date().toISOString()
        };
        if (existingUserIndex >= 0) {
            console.log('Updating existing user');
            this.data.users[existingUserIndex] = userData;
        }
        else {
            console.log('Adding new user');
            this.data.users.push(userData);
        }
        await this.saveData();
        console.log('Current users after save:', this.data.users);
    }
    addPostedMeeting(meeting) {
        this.data.postedMeetings.push(meeting);
        this.saveData();
    }
    getPostedMeetings(userId, startDate, endDate) {
        return this.data.postedMeetings.filter(meeting => {
            const meetingDate = new Date(meeting.date);
            return meetingDate >= new Date(startDate) && meetingDate <= new Date(endDate);
        });
    }
    isUserFirstLogin(userId) {
        return !this.data.users.some(u => u.userId === userId);
    }
    updateLastSync(userId) {
        const user = this.data.users.find(u => u.userId === userId);
        if (user) {
            user.lastSync = new Date().toISOString();
            this.saveData();
        }
    }
    getAllUsers() {
        return this.data.users;
    }
}
exports.UserStorage = UserStorage;
