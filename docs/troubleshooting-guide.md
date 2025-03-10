# Troubleshooting Guide: Agent Dashboard

This guide provides solutions for common issues with the Agent Dashboard, particularly focusing on scenarios where the API is working but data isn't displaying in the UI.

## API Working But Data Not Displaying in UI

### Symptoms
- API endpoints return successful responses with data
- Dashboard UI shows "No meetings posted yet" or empty tables
- No console errors are visible

### Possible Causes and Solutions

#### 1. Data Structure Mismatch

**Problem**: The frontend component expects a different data structure than what the API is returning.

**Solution**:
1. Compare the interface definitions in the frontend with the actual API response
2. Check for nested objects that might be structured differently
3. Update the interface to match the actual API response

Example fix for a data structure mismatch:
```typescript
// Before: Incorrect interface
interface PostedMeeting {
  meetingId: string;
  userId: string;
  timeEntry: {
    personid: number;
    status: string;
    code: number;
    time: {
      id: string;
      date: string;
      time: string;
      description: string;
      worktype: string;
      module: string;
    };
  };
  postedAt: string;
}

// After: Corrected interface to match API response
interface PostedMeeting {
  meetingId: string;
  userId: string;
  timeEntry: {
    id: string;
    projectid: string;
    moduleid: string;
    taskid: string;
    worktypeid: string;
    personid: string;
    date: string;
    datemodified: string;
    time: string;
    description: string;
    billable: string;
    worktype: string;
    milestoneid: string | null;
    ogmilestoneid: string | null;
    module: string;
  };
  postedAt: string;
}
```

#### 2. Data Filtering Issues

**Problem**: The filtering logic in the frontend might be incorrectly filtering out valid data.

**Solution**:
1. Check the filtering conditions in the `fetchPostedMeetings` function
2. Ensure the property paths used in filters match the actual data structure
3. Add console logs to see what data is being filtered out

Example fix:
```typescript
// Before: Incorrect property path
const validMeetings = (data.meetings || []).filter((meeting: PostedMeeting) => 
  meeting?.timeEntry?.time?.date
);

// After: Corrected property path
const validMeetings = (data.meetings || []).filter((meeting: PostedMeeting) => 
  meeting?.timeEntry?.date
);
```

#### 3. Data Rendering Issues

**Problem**: The table rendering logic might be using incorrect property paths.

**Solution**:
1. Check the table row rendering code
2. Ensure property paths match the actual data structure
3. Add fallbacks for missing properties

Example fix:
```typescript
// Before: Incorrect property paths
<TableCell>{meeting.timeEntry?.time?.date ? formatDate(meeting.timeEntry.time.date) : 'N/A'}</TableCell>
<TableCell>{meeting.timeEntry?.time?.description || 'N/A'}</TableCell>

// After: Corrected property paths
<TableCell>{meeting.timeEntry?.date ? formatDate(meeting.timeEntry.date) : 'N/A'}</TableCell>
<TableCell>{meeting.timeEntry?.description || 'N/A'}</TableCell>
```

#### 4. API Response Validation

**Problem**: The API might be returning a successful response but with invalid or empty data.

**Solution**:
1. Add console logs to inspect the API response
2. Check for empty arrays or null values
3. Verify that the API is returning the expected data structure

Example debugging code:
```typescript
const fetchPostedMeetings = async () => {
  try {
    setIsLoading(true);
    const response = await fetch('/api/posted-meetings');
    if (!response.ok) {
      throw new Error('Failed to fetch meetings');
    }
    
    const data = await response.json();
    console.log('API Response:', data); // Add this line to inspect the response
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch meetings');
    }
    
    // Rest of the function...
  } catch (err) {
    // Error handling...
  }
};
```

#### 5. Authentication Issues

**Problem**: The API might be returning different data based on authentication status.

**Solution**:
1. Verify that the user is properly authenticated
2. Check that the correct user ID is being used in API queries
3. Ensure the session is being properly passed to API calls

#### 6. Database Connection Issues

**Problem**: The backend might be unable to connect to the database.

**Solution**:
1. Check database connection logs
2. Verify database credentials
3. Ensure the database schema matches the expected structure

## General Debugging Steps

1. **Inspect API Responses**: Use browser developer tools to inspect network requests and responses
2. **Add Console Logs**: Add strategic console logs to track data flow
3. **Check Component State**: Use React DevTools to inspect component state
4. **Verify Data Transformations**: Ensure data transformations are working as expected
5. **Test with Mock Data**: Try rendering the component with mock data to isolate the issue

## Common Code Fixes

### Updating Property Paths

```typescript
// Before
meeting?.timeEntry?.time?.date
meeting?.timeEntry?.time?.description
meeting?.timeEntry?.time?.time

// After
meeting?.timeEntry?.date
meeting?.timeEntry?.description
meeting?.timeEntry?.time
```

### Adding Fallbacks

```typescript
// Before
<TableCell>{meeting.timeEntry.date}</TableCell>

// After
<TableCell>{meeting.timeEntry?.date || 'N/A'}</TableCell>
```

### Debugging API Responses

```typescript
// Add this before processing the data
console.log('Raw API response:', data);
console.log('Meetings count:', data.meetings?.length || 0);
console.log('First meeting:', data.meetings?.[0]);
```

## When to Seek Further Help

If you've tried all the solutions above and are still experiencing issues:

1. Check the application logs for any errors
2. Review recent code changes that might have affected the dashboard
3. Consult with the backend team to ensure API contracts haven't changed
4. Consider opening an issue in the project repository with detailed reproduction steps 