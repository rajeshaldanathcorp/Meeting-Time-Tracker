# Frontend-Backend Integration for AI Agent Dashboard

This document explains how the AI Agent Dashboard frontend connects with the backend API endpoints.

## Overview

The AI Agent Dashboard is a React-based frontend that communicates with several backend API endpoints to:
1. Fetch posted meetings
2. Process new meetings
3. Create time entries
4. Continuously monitor for new meetings (AI Agent mode)

## Key Components

### Frontend Component: `AIAgentView`

The main frontend component responsible for the Agent Dashboard UI is `AIAgentView` located in `src/components/ai-agent-view.tsx`. This component:

- Displays the dashboard UI with statistics, meeting lists, and action buttons
- Manages state for meetings data, loading states, and logs
- Makes API calls to the backend endpoints
- Controls the AI Agent continuous processing mode

### Data Flow

```
┌─────────────────┐      HTTP Requests      ┌─────────────────┐
│                 │ ─────────────────────>  │                 │
│  Frontend       │                         │  Backend API    │
│  (AIAgentView)  │ <─────────────────────  │  Endpoints      │
│                 │      JSON Responses     │                 │
└─────────────────┘                         └─────────────────┘
```

## AI Agent Continuous Processing

The dashboard supports an "AI Agent" mode that continuously checks for new meetings:

### Implementation

```typescript
// In AIAgentView component
const [agentEnabled, setAgentEnabled] = useState(false);
const intervalRef = useRef<NodeJS.Timeout | null>(null);

// Initialize agent state from localStorage on component mount
useEffect(() => {
  const storedAgentState = localStorage.getItem('aiAgentEnabled');
  if (storedAgentState === 'true') {
    toggleAgent(true);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

const toggleAgent = (enabled: boolean) => {
  setAgentEnabled(enabled);
  
  // Store the state in localStorage
  localStorage.setItem('aiAgentEnabled', enabled.toString());
  
  if (enabled) {
    // Start the interval
    processMeetings(); // Process immediately when enabled
    
    intervalRef.current = setInterval(() => {
      processMeetings();
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
  } else {
    // Clear the interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }
};

// Clean up interval on component unmount
useEffect(() => {
  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };
}, []);
```

### State Persistence

The AI Agent's enabled/disabled state is persisted in the browser's localStorage:

1. When the agent is enabled or disabled, the state is saved to localStorage
2. On page load/refresh, the component checks localStorage for the saved state
3. If the agent was previously enabled, it automatically restarts
4. This ensures the agent continues running even after page refreshes

### User Interface

The UI provides:
- A toggle switch to enable/disable the AI Agent
- Visual indicators showing the agent's status
- Logs of automated processing activities
- Disables manual processing when the agent is active

### Behavior

When enabled:
1. The agent immediately processes any pending meetings
2. Sets up an interval to check for new meetings every 5 minutes
3. Continues running until explicitly disabled or the page is closed
4. Automatically refreshes the dashboard data after each processing cycle
5. Persists across page refreshes and browser sessions

## API Endpoints

### 1. `/api/posted-meetings`

**Purpose**: Fetches all meetings that have been processed and posted as time entries.

**Frontend Implementation**:
```typescript
// In AIAgentView component
const fetchPostedMeetings = async () => {
  try {
    setIsLoading(true);
    const response = await fetch('/api/posted-meetings');
    if (!response.ok) {
      throw new Error('Failed to fetch meetings');
    }
    
    const data = await response.json();
    // Process and update state with the received data
    setPostedMeetings(data.meetings || []);
    // ...
  } catch (err) {
    // Error handling
  } finally {
    setIsLoading(false);
  }
};
```

**Expected Response Format**:
```json
{
  "success": true,
  "meetings": [
    {
      "meetingId": "string",
      "userId": "string",
      "timeEntry": {
        "id": "string",
        "projectid": "string",
        "moduleid": "string",
        "taskid": "string",
        "worktypeid": "string",
        "personid": "string",
        "date": "string",
        "datemodified": "string",
        "time": "string",
        "description": "string",
        "billable": "string",
        "worktype": "string",
        "milestoneid": null,
        "ogmilestoneid": null,
        "module": "string"
      },
      "postedAt": "string"
    }
  ],
  "unmatchedMeetings": [
    {
      "id": "string",
      "subject": "string",
      "startTime": "string",
      "duration": number,
      "reason": "string"
    }
  ]
}
```

### 2. `/api/test-time-entry`

**Purpose**: Processes new meetings and creates time entries.

**Frontend Implementation**:
```typescript
// In AIAgentView component
const processMeetings = async () => {
  if (isProcessing) return; // Prevent multiple simultaneous processing
  
  setIsProcessing(true);
  
  try {
    const response = await fetch('/api/test-time-entry');
    if (!response.ok) {
      throw new Error('Failed to process meetings');
    }
    
    const data = await response.json();
    // Process response data and update logs
    // ...
    
    // Refresh posted meetings after processing
    await fetchPostedMeetings();
  } catch (err) {
    // Error handling
  } finally {
    setIsProcessing(false);
  }
};
```

**Expected Response Format**:
```json
{
  "success": true,
  "data": {
    "meetings": [
      {
        "subject": "string",
        "startTime": "string",
        "duration": number
      }
    ],
    "matchResults": [
      {
        "meetingSubject": "string",
        "matchedTasks": [
          {
            "taskTitle": "string",
            "taskId": "string"
          }
        ]
      }
    ],
    "timeEntries": [
      {
        "meetingSubject": "string",
        "error": "string" // Optional
      }
    ],
    "uniqueMeetings": number
  }
}
```

## State Management

The `AIAgentView` component manages several pieces of state:

```typescript
const [isProcessing, setIsProcessing] = useState(false);
const [isLoading, setIsLoading] = useState(true);
const [postedMeetings, setPostedMeetings] = useState<PostedMeeting[]>([]);
const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
const [unmatchedMeetings, setUnmatchedMeetings] = useState<UnmatchedMeeting[]>([]);
const [totalMeetings, setTotalMeetings] = useState(0);
const [successRate, setSuccessRate] = useState(0);
const [logs, setLogs] = useState<LogEntry[]>([]);
const [agentEnabled, setAgentEnabled] = useState(false);
const intervalRef = useRef<NodeJS.Timeout | null>(null);
```

These state variables are updated based on API responses and user interactions.

## Data Processing

The frontend processes the API response data to:

1. Filter valid meetings
2. Calculate daily meeting counts
3. Compute success rates
4. Format dates and durations for display
5. Generate logs for user feedback

## Error Handling

The frontend implements error handling for API calls:

```typescript
try {
  // API call
} catch (err) {
  console.error('Error:', err);
  const message = err instanceof Error ? err.message : 'Failed operation';
  error(message); // Display toast notification
  addLog(message, 'error'); // Add to log viewer
} finally {
  // Reset loading state
}
```

## UI Components

The dashboard UI consists of several components:

1. **Header Card**: Displays the dashboard title
2. **Actions Card**: Contains the "Enable AI Agent" toggle and "Process Meetings Now" button
3. **Log Viewer**: Shows processing logs in real-time
4. **Stats Cards**: Display metrics like total meetings and success rate
5. **Daily Counts Card**: Shows meetings posted per day
6. **Posted Meetings Card**: Lists recently posted meetings
7. **Unmatched Meetings Card**: Shows meetings that couldn't be processed

## Implementation Notes

- The frontend uses React hooks for state management and side effects
- API calls are made using the Fetch API
- The UI is built using a component library with cards, tables, and buttons
- Loading states are managed to show spinners during API calls
- Error handling provides user feedback via toast notifications and logs
- The AI Agent uses `setInterval` for continuous processing
- Cleanup is handled with `useEffect` return function

## Troubleshooting

If meetings are not displaying in the UI:

1. Check browser console for errors
2. Verify the API endpoint `/api/posted-meetings` is returning data in the expected format
3. Ensure the data structure in the frontend matches what the API returns
4. Check that the filtering logic in `fetchPostedMeetings()` is correctly identifying valid meetings 