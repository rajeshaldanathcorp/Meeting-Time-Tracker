# Meeting Time Tracker - Release Notes

## Header Information
**Product Name:** Meeting Time Tracker  
**Release Number:** 2.1.0  
**Document Version:** 1.0  
**Release Date:** March 2024

## Overview
Meeting Time Tracker is a comprehensive solution for tracking and logging time spent in Microsoft Teams meetings. This release introduces significant improvements to both the manual time tracking workflow and the AI-powered automated time entry system. The application now provides a more streamlined experience for users to track their meeting attendance and create time entries in Intervals time tracking system, with enhanced user-specific data handling and improved task matching capabilities.

## Prerequisites
Before using the Meeting Time Tracker application, ensure you have the following:

### Account Requirements
- Microsoft 365 account with access to Teams meetings
- Intervals account with API access permissions
- Appropriate permissions to view meeting attendance records

### Technical Prerequisites
- Modern web browser (Chrome, Edge, Firefox recommended)
- Stable internet connection
- Screen resolution of at least 1280x720 for optimal experience

### API Access
- Microsoft Graph API access configured
- Intervals API key generated from your account
- Azure OpenAI API access (for AI agent functionality)

### Knowledge Prerequisites
- Basic understanding of Microsoft Teams meetings
- Familiarity with Intervals time tracking system
- Understanding of your organization's task structure

## New Features

### 1. Enhanced User-Specific Data Handling
- Improved data isolation between users for both manual and AI agent components
- Each user now sees only their own meetings, reviews, and posted time entries
- Fixed issues with shared data appearing across different user accounts

### 2. Improved AI Agent Task Matching
- Enhanced task matching algorithm with better confidence scoring
- Improved filtering of meetings based on user attendance
- Only meetings that the user actually attended are now processed
- User-specific duration is now used for time entries instead of other attendees' durations

### 3. Streamlined UI Experience
- Simplified AI Agent dashboard with focus on core functionality
- Removed unnecessary metrics and logs for cleaner interface
- Improved meeting review interface with better categorization of matches
- Added high, medium, and low confidence match sections for better organization

### 4. Attendance Verification
- Added verification of user attendance before creating time entries
- System now checks if the user actually attended the meeting
- Prevents creation of time entries for meetings the user didn't attend
- Uses the user's actual attendance duration for time entries

### 5. Improved Error Handling
- Better error messages for common issues
- Enhanced validation of time entry data
- Improved handling of API errors
- More informative feedback when meetings can't be processed

## Known Issues

1. **AI Agent Persistence**
   - The AI agent stops running when the browser is closed
   - Workaround: Keep the browser window open or implement a server-side scheduling solution

2. **Date Selection Offset**
   - Need to select one day after the actual required date to get real-time meeting information
   - Workaround: Select the following day in the date picker to view the intended meetings

3. **Unmatched Meeting Duration Issue**
   - When manually posting unmatched meetings in the AI agent, the system may not use the actual attendance timing
   - Workaround: Double-check the duration before confirming the time entry

4. **Meeting Persistence After Posting**
   - Meetings may still appear in the review section after being posted
   - Workaround: Refresh the page or wait for the next automatic refresh cycle

## Technical Requirements

### System Requirements
- Modern web browser (Chrome, Edge, Firefox, Safari)
- Microsoft 365 account with Teams meetings
- Intervals time tracking account with API access
- Stable internet connection

### Dependencies
- Microsoft Graph API for meeting data
- Intervals API for time entry creation
- Azure OpenAI services for AI-powered task matching
- NextAuth for authentication

### Environment Variables
The following environment variables must be configured:
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint
- `AZURE_OPENAI_API_KEY`: Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT`: Azure OpenAI deployment name
- Microsoft Graph API credentials
- NextAuth configuration

## Detailed Workflow Diagrams

### Manual App Workflow Diagram
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Sign In with   │────►│  Configure      │────►│  Select Date    │────►│  View Meetings  │
│  Microsoft      │     │  Intervals API  │     │  Range          │     │  List           │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  View Posted    │◄────│  Confirm Time   │◄────│  Select Task    │◄────│  Choose Meeting │
│  Time Entries   │     │  Entry Creation │     │  for Meeting    │     │  to Log         │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

### AI Agent Workflow Diagram
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  Sign In with   │────►│  Configure      │────►│  Enable AI      │────►│  AI Fetches     │
│  Microsoft      │     │  Intervals API  │     │  Agent          │     │  Meetings       │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
                                                                                │
                                                                                ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │     │                 │
│  View Posted    │◄────│  Auto-Post or   │◄────│  AI Matches     │◄────│  AI Analyzes    │
│  Time Entries   │     │  Manual Review  │     │  Tasks          │     │  Meetings       │
│                 │     │                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Detailed Step-by-Step Workflows

### Manual App Workflow (Step-by-Step)

#### 1. Authentication and Setup
1. Navigate to the Meeting Time Tracker application URL
2. Click "Sign in with Microsoft" button
3. Enter your Microsoft 365 credentials
4. Authorize the application to access your meeting data
5. If prompted, enter your Intervals API key in the settings dialog
6. Verify connection to both Microsoft Graph and Intervals APIs

#### 2. Meeting Retrieval and Selection
1. On the dashboard, select the date range for meetings using the date picker
   - Note: Select one day after your intended date due to the date offset issue
2. Click "Fetch Meetings" to retrieve your Microsoft Teams meetings
3. Wait for the system to load meetings and attendance data
4. Review the list of meetings displayed in the dashboard
5. Verify that the meetings shown are ones you've attended
6. Click on a meeting you want to log time for

#### 3. Task Selection and Time Entry Creation
1. In the meeting details panel, review the meeting information:
   - Meeting title, date, and time
   - Your attendance duration
   - Other participants (if available)
2. Click the "Select Task" dropdown to view available Intervals tasks
3. Search or browse for the appropriate task
4. Select the task that corresponds to the meeting work
5. Verify the time duration is correct (based on your actual attendance)
6. Add any additional notes or description if needed
7. Click "Create Time Entry" button to post to Intervals
8. Wait for confirmation that the time entry was created successfully

#### 4. Review and Verification
1. Navigate to the "Posted Meetings" tab in the sidebar
2. Verify that your newly created time entry appears in the list
3. Check that the details are correct:
   - Meeting subject
   - Date and time
   - Duration
   - Task association
4. If needed, view the entry directly in Intervals for further verification

### AI Agent Workflow (Step-by-Step)

#### 1. Authentication and Setup
1. Navigate to the Meeting Time Tracker application URL
2. Click "Sign in with Microsoft" button
3. Enter your Microsoft 365 credentials
4. Authorize the application to access your meeting data
5. If prompted, enter your Intervals API key in the settings dialog
6. Navigate to the "AI Agent" tab in the sidebar

#### 2. AI Agent Configuration and Activation
1. Review the AI Agent dashboard
2. Toggle the "Enable AI Agent" switch to ON
3. Verify that the agent status shows as "Running"
4. Optionally, click "Process Meetings Now" to trigger immediate processing
5. Keep the browser window open for the agent to continue running

#### 3. Automated Meeting Processing
1. The AI agent automatically fetches your recent Microsoft Teams meetings
2. Meetings are filtered to include only those you actually attended
3. For each meeting, the agent:
   - Extracts meeting details (subject, time, duration)
   - Verifies your attendance and actual duration
   - Analyzes the meeting content and context
   - Attempts to match with appropriate Intervals tasks
   - Calculates confidence scores for each potential match

#### 4. Task Matching and Time Entry Creation
1. For high-confidence matches (if enabled):
   - The agent automatically creates time entries in Intervals
   - Entries use your actual attendance duration
   - Meetings are marked as posted in the system
2. For low-confidence or unmatched meetings:
   - Meetings are queued for manual review
   - You'll see them in the "Meeting Review" section

#### 5. Manual Review of AI Suggestions
1. In the "Meeting Review" section, review meetings by confidence level:
   - High confidence matches
   - Medium confidence matches
   - Low confidence matches
   - Unmatched meetings
2. For each meeting requiring review:
   - Review the meeting details and suggested tasks
   - Accept the suggested task or select a different one
   - Verify the duration is correct
   - Click "Post" to create the time entry
3. After posting, the meeting should be removed from the review list
   - If it persists, refresh the page

#### 6. Monitoring and Verification
1. Check the "Recently Posted Meetings" section to verify entries
2. Confirm that time entries appear in Intervals
3. Periodically check for new meetings requiring review
4. If needed, manually trigger processing with "Process Meetings Now"

## Installation and Upgrade Instructions

### New Installation
1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables in `.env.local`:
   ```
   AZURE_OPENAI_ENDPOINT=your_endpoint
   AZURE_OPENAI_API_KEY=your_key
   AZURE_OPENAI_DEPLOYMENT=your_deployment
   ```
4. Set up Microsoft Graph API and NextAuth configuration
5. Build the application:
   ```
   npm run build
   ```
6. Start the server:
   ```
   npm run start
   ```

### Upgrade from Previous Version
1. Pull the latest changes from the repository
2. Install any new dependencies:
   ```
   npm install
   ```
3. Update environment variables if needed
4. Rebuild the application:
   ```
   npm run build
   ```
5. Restart the server:
   ```
   npm run start
   ```

### Post-Installation Steps
1. Sign in with your Microsoft 365 account
2. Configure your Intervals API key in the settings
3. Verify that meetings are being fetched correctly
4. Test the AI agent by processing a few meetings manually

For any issues or questions, please contact the development team. 
