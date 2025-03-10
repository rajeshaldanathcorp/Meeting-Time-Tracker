# AI Agent Flow Documentation

## Overview

This document outlines the core workflows and architecture of the AI agent system. The system integrates with Microsoft Graph API and Intervals time tracking service to automate the process of analyzing meetings and creating time entries using Azure OpenAI services.

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  Microsoft      │     │  AI Agent       │     │  Intervals      │
│  Graph API      │◄────┤  System         ├────►│  API            │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │                 │
                        │  Azure OpenAI   │
                        │  Services       │
                        │                 │
                        └─────────────────┘
```

## Core Components

1. **Azure OpenAI Integration**
   - Handles authentication with Azure OpenAI services
   - Implements rate limiting and retry mechanisms
   - Uses specific prompts for different AI tasks
   - Manages token usage and request quotas

2. **Meeting Service**
   - Fetches and processes meeting data from Microsoft Graph API
   - Extracts attendance records and meeting duration
   - Uses AI to analyze meeting content and extract key information
   - Stores processed meeting data for future reference

3. **Task Service**
   - Integrates with Intervals API to fetch available tasks
   - Uses AI to match meetings with relevant tasks
   - Calculates confidence scores for task matches
   - Provides reasoning for each match

4. **Time Entry Service**
   - Creates time entries in Intervals based on meetings and matched tasks
   - Tracks which meetings have already been processed
   - Handles user authentication and API integration
   - Manages project and work type associations

5. **Storage Management**
   - Stores processed meetings and user data
   - Manages caching of API responses
   - Handles backup of important data
   - Prevents duplicate processing of meetings

## Key Workflows

### 1. Meeting Analysis Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │     │ Extract     │     │ Analyze     │     │ Store       │
│ Meeting     ├────►│ Attendance  ├────►│ Meeting     ├────►│ Processed   │
│ Data        │     │ Records     │     │ with AI     │     │ Meeting     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. Fetch meeting data from Microsoft Graph API
2. Extract attendance records to get actual duration
3. Use Azure OpenAI to analyze meeting content
4. Store the processed meeting for future reference

### 2. Task Matching Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Fetch       │     │ Format      │     │ Match Tasks │     │ Return      │
│ Available   ├────►│ Meeting &   ├────►│ Using       ├────►│ Matched     │
│ Tasks       │     │ Task Data   │     │ Azure OpenAI│     │ Tasks       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. Fetch available tasks from Intervals
2. Format meeting and task data for AI processing
3. Use Azure OpenAI to match meetings with relevant tasks
4. Calculate confidence scores and provide reasoning
5. Return the best matching tasks

### 3. Time Entry Creation Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Process     │     │ Match with  │     │ Create Time │     │ Store       │
│ Meeting     ├────►│ Relevant    ├────►│ Entry in    ├────►│ Posted      │
│ Data        │     │ Task        │     │ Intervals   │     │ Meeting     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. Take a processed meeting and matched task
2. Create a time entry in Intervals with the meeting duration
3. Store a record of the posted meeting
4. Handle error cases and retries

### 4. Manual Review Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Detect Low  │     │ Queue for   │     │ User        │     │ Create Time │
│ Confidence  ├────►│ Manual      ├────►│ Reviews &   ├────►│ Entry &     │
│ Match       │     │ Review      │     │ Selects Task│     │ Learn       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

1. System detects low confidence matches or AI service failures
2. Meeting is flagged for manual review in the dashboard
3. User reviews meeting details and available tasks
4. User selects the appropriate task or marks as "no time entry needed"
5. System creates the time entry and learns from the manual selection

## Data Flow

1. **User Authentication**
   - User provides Microsoft Graph and Intervals API credentials
   - System stores credentials securely for API access

2. **Meeting Data Collection**
   - System fetches meetings from Microsoft Graph API
   - Attendance records are extracted to determine actual duration

3. **AI Analysis**
   - Meeting data is sent to Azure OpenAI for analysis
   - Tasks are matched to meetings based on content relevance

4. **Time Entry Creation**
   - System creates time entries in Intervals
   - Entries include duration, task association, and meeting details

5. **Storage and Caching**
   - Processed meetings are stored to prevent duplicate processing
   - API responses are cached to reduce API calls

## Technical Implementation Details

- **Singleton Pattern**: Services are implemented as singletons to ensure consistent state
- **Rate Limiting**: Implements token bucket algorithm for API rate limiting
- **Error Handling**: Comprehensive error handling with exponential backoff for retries
- **Type Safety**: Uses TypeScript interfaces for type checking
- **Environment Configuration**: Uses environment variables for service configuration
- **Modular Architecture**: Clear separation of concerns between services

## Security Considerations

- API keys and credentials are stored securely
- Authentication tokens are refreshed as needed
- User data is isolated between different users
- API requests use proper authentication headers

## Dashboard Review Interface

### Purpose
The Review Interface provides a solution for handling cases where the AI fails to confidently match meetings with tasks, requiring human intervention.

### Components

1. **Review Queue Panel**
   - Displays meetings that need manual review
   - Shows meeting count badge on dashboard navigation
   - Sorts meetings by date (most recent first)
   - Provides filtering options (date range, confidence score, meeting type)

2. **Meeting Review Card**
   - Displays meeting details:
     - Subject, date, time, duration
     - Participants and their attendance duration
     - Meeting summary and key points (if available)
   - Shows AI-suggested tasks with confidence scores
   - Provides a search/dropdown interface to select the correct task
   - Includes options to:
     - Approve a suggested task
     - Select a different task
     - Mark as "No time entry needed"
     - Provide feedback on why the AI match failed

3. **Batch Processing Tools**
   - Allows selection of multiple similar meetings
   - Provides bulk assignment to the same task
   - Handles recurring meetings with similar patterns

4. **Feedback Collection**
   - Captures user feedback on incorrect matches
   - Provides a mechanism to explain why a match was incorrect
   - Uses feedback to improve future matching accuracy

### User Flow

1. **Notification**
   - User sees a badge on the dashboard indicating meetings needing review
   - Optional email notifications for pending reviews

2. **Review Process**
   - User navigates to the "Review" section
   - Selects a meeting from the queue
   - Reviews meeting details and suggested tasks
   - Selects the appropriate task or marks as "no time entry"
   - Submits the review

3. **Confirmation**
   - System confirms the time entry creation
   - Meeting is removed from the review queue
   - Dashboard updates to reflect the completed review

4. **Learning Mechanism**
   - System records the manual selection
   - Uses this data to improve future matching accuracy
   - Periodically retrains the matching algorithm

### Integration Points

1. **Task Service Integration**
   - Fetches available tasks for selection
   - Stores user task selections for learning

2. **Meeting Service Integration**
   - Flags meetings with low confidence matches
   - Updates meeting status after review

3. **Time Entry Service Integration**
   - Creates time entries based on user selections
   - Handles any errors in time entry creation

4. **Storage Integration**
   - Stores review status and history
   - Maintains an audit trail of manual reviews

## Future Enhancements

- Implement more sophisticated AI analysis of meeting content
- Add support for additional time tracking services
- Improve confidence scoring for task matching
- Develop a user interface for configuration and monitoring
- Add support for recurring meetings and patterns
- Enhance the review interface with AI-assisted recommendations
- Implement a learning system that improves matching based on user feedback
- Add batch processing capabilities for similar meetings 