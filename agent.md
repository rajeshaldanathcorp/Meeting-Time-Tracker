# AI Agent Architecture Documentation

## Overview
This document outlines the architecture and functionality of our AI agent system powered by Azure OpenAI. The agent operates autonomously to understand meetings, match tasks, and create time entries using natural language processing and contextual understanding.

## Directory Structure
```
├── ai-agent/                    # Azure OpenAI Agent Core
│   ├── core/                   # Core AI Components
│   │   ├── azure-openai/      # Required Code Components
│   │   │   ├── client.ts      # Azure OpenAI Client (Code)
│   │   │   ├── prompts/       # Prompt Templates
│   │   │   │   ├── meeting-analysis.ts
│   │   │   │   ├── task-matching.ts
│   │   │   │   └── description-generation.ts
│   │   │   ├── models.ts      # Model Configurations (Code)
│   │   │   └── api.ts         # API Utilities (Code)
│   │   │
│   │   ├── engine/            # Prompt-Driven Engines
│   │   │   ├── scheduler.ts   # AI-Driven Scheduling
│   │   │   ├── matcher.ts     # AI-Driven Matching
│   │   │   ├── sync.ts        # AI-Driven Synchronization
│   │   │   └── monitor.ts     # AI-Driven Monitoring
│   │   │
│   │   └── learning/          # Prompt-Driven Learning
│   │       ├── patterns.ts    # AI-Driven Pattern Recognition
│   │       ├── evolution.ts   # AI-Driven System Evolution
│   │       └── feedback.ts    # AI-Driven Feedback Processing
│   │
│   ├── services/              # Azure OpenAI-Driven Services
│   │   ├── meeting/          # Meeting Understanding
│   │   │   └── openai.ts     # Direct Azure OpenAI Integration
│   │   │
│   │   ├── task/            # Task Understanding
│   │   │   └── openai.ts    # Direct Azure OpenAI Integration
│   │   │
│   │   └── time-entry/      # Time Entry Creation
│   │       └── openai.ts    # Direct Azure OpenAI Integration
│   │
│   ├── data/                 # Required Code Components
│   │   ├── cache/           # Cache Management (Code)
│   │   │   ├── memory.ts    # Memory Operations
│   │   │   └── storage.ts   # Storage Operations
│   │   │
│   │   ├── storage/         # Storage Management (Code)
│   │   │   ├── json/        # JSON Storage Files
│   │   │   │   ├── user-patterns.json     # Stores user behavior patterns and preferences
│   │   │   │   ├── neural-state.json      # AI model state and learning data
│   │   │   │   ├── feedback-history.json   # User corrections and feedback data
│   │   │   │   ├── confidence-metrics.json # AI matching confidence history
│   │   │   │   ├── sync-state.json        # Synchronization status tracking
│   │   │   │   └── posted-meetings.json    # Successfully processed meetings
│   │   │   │
│   │   │   └── manager.ts   # Storage Operations
│   │   │
│   │   └── backup/          # Backup Management (Code)
│   │       ├── scheduler.ts  # Backup Operations
│   │       └── manager.ts    # Backup Control
│   │
│   ├── config/              # Required Code Components
│   │   ├── azure-openai.ts  # OpenAI Configuration (Code)
│   │   ├── api.ts           # API Configuration (Code)
│   │   ├── cache.ts         # Cache Settings (Code)
│   │   └── storage.ts       # Storage Settings (Code)
│   │
│   └── utils/               # Mixed Components
│       ├── logger.ts        # Logging Operations (Code)
│       ├── error.ts         # Error Handling (Code)
│       ├── validation.ts    # AI-Driven Validation
│       └── metrics.ts       # AI-Driven Metrics Analysis
│
└── interfaces/              # Required Code Components
    ├── azure-openai.ts      # Type Definitions (Code)
    ├── meetings.ts          # Type Definitions (Code)
    ├── tasks.ts            # Type Definitions (Code)
    └── time-entries.ts     # Type Definitions (Code)
```

## Directory Structure Details and Connections

### 1. Core AI Components (`ai-agent/core/`)

#### Azure OpenAI Integration (`azure-openai/`)
- **client.ts**
  - Primary interface for Azure OpenAI API communication
  - Manages API authentication and session handling
  - Used by all services (`meeting/`, `task/`, `time-entry/`) for AI operations
  - Implements rate limiting and token management

- **prompts/** Directory
  - Contains specialized prompt templates for different AI operations
  - **meeting-analysis.ts**
    - Templates for meeting context understanding
    - Used by `services/meeting/openai.ts`
    - Connects with `learning/patterns.ts` for improvement
  
  - **task-matching.ts**
    - Templates for task-meeting association
    - Used by `services/task/openai.ts`
    - Integrates with `engine/matcher.ts`
  
  - **description-generation.ts**
    - Templates for time entry descriptions
    - Used by `services/time-entry/openai.ts`
    - Connects with `learning/feedback.ts` for improvement

- **models.ts**
  - Defines Azure OpenAI model configurations
  - Used by `client.ts` for API calls
  - Referenced by `config/azure-openai.ts`

- **api.ts**
  - Common API utilities and helper functions
  - Used across all OpenAI integrations
  - Implements error handling with `utils/error.ts`

#### Engine Components (`engine/`)
- **scheduler.ts**
  - Manages AI-driven scheduling decisions
  - Integrates with `services/meeting/openai.ts`
  - Uses `data/storage/json/user-patterns.json` for optimization

- **matcher.ts**
  - Core logic for task-meeting matching
  - Connects with `services/task/openai.ts`
  - Uses `data/storage/json/confidence-metrics.json`

- **sync.ts**
  - Manages data synchronization
  - Interacts with all storage components
  - Uses `data/storage/json/sync-state.json`

- **monitor.ts**
  - System monitoring and health checks
  - Connects with `utils/metrics.ts`
  - Logs through `utils/logger.ts`

#### Learning System (`learning/`)
- **patterns.ts**
  - Analyzes user behavior patterns
  - Updates `data/storage/json/user-patterns.json`
  - Feeds back to all service components

- **evolution.ts**
  - Manages system improvement logic
  - Updates `data/storage/json/neural-state.json`
  - Connects with all AI operations

- **feedback.ts**
  - Processes user feedback
  - Updates `data/storage/json/feedback-history.json`
  - Improves prompt templates and matching logic

### 2. Services (`services/`)

#### Meeting Understanding (`meeting/`)
- **openai.ts**
  - Implements meeting analysis logic
  - Uses `core/azure-openai/prompts/meeting-analysis.ts`
  - Stores results in `data/storage/json/posted-meetings.json`
  - Connects with `engine/scheduler.ts`

#### Task Understanding (`task/`)
- **openai.ts**
  - Implements task analysis and matching
  - Uses `core/azure-openai/prompts/task-matching.ts`
  - Interacts with `engine/matcher.ts`
  - Updates `data/storage/json/confidence-metrics.json`

#### Time Entry Creation (`time-entry/`)
- **openai.ts**
  - Generates time entries
  - Uses `core/azure-openai/prompts/description-generation.ts`
  - Stores entries in `data/storage/json/posted-meetings.json`
  - Uses feedback from `learning/feedback.ts`

### 3. Data Management (`data/`)

#### Cache Management (`cache/`)
- **memory.ts**
  - Implements in-memory caching
  - Used by all services for performance
  - Configured through `config/cache.ts`

- **storage.ts**
  - Manages cache persistence
  - Interacts with `data/storage/`
  - Uses `config/storage.ts`

#### Storage Management (`storage/`)
- **json/** Directory
  - Contains all persistent storage files
  - Managed by `storage/manager.ts`
  - Each JSON file has specific connections:
    - `user-patterns.json` ↔ `learning/patterns.ts`
    - `neural-state.json` ↔ `learning/evolution.ts`
    - `feedback-history.json` ↔ `learning/feedback.ts`
    - `confidence-metrics.json` ↔ `engine/matcher.ts`
    - `sync-state.json` ↔ `engine/sync.ts`
    - `posted-meetings.json` ↔ All services

- **manager.ts**
  - Centralizes storage operations
  - Used by all components needing persistence
  - Implements backup strategies

#### Backup Management (`backup/`)
- **scheduler.ts**
  - Manages backup timing
  - Uses `config/storage.ts`
  - Connects with `utils/logger.ts`

- **manager.ts**
  - Implements backup operations
  - Works with `storage/manager.ts`
  - Uses `utils/error.ts` for reliability

### 4. Configuration (`config/`)
- **azure-openai.ts**
  - Configures Azure OpenAI settings
  - Used by `core/azure-openai/client.ts`
  - Manages API keys and endpoints

- **api.ts**
  - General API configuration
  - Used by all service components
  - Manages endpoints and timeouts

- **cache.ts**
  - Cache configuration settings
  - Used by `data/cache/`
  - Optimizes performance

- **storage.ts**
  - Storage configuration
  - Used by `data/storage/` and `data/backup/`
  - Manages file paths and backup settings

### 5. Utilities (`utils/`)
- **logger.ts**
  - Centralized logging
  - Used by all components
  - Connects with monitoring systems

- **error.ts**
  - Error handling utilities
  - Used throughout the system
  - Ensures graceful failure handling

- **validation.ts**
  - AI-driven input validation
  - Used by all services
  - Connects with learning system

- **metrics.ts**
  - Performance and quality metrics
  - Used by `engine/monitor.ts`
  - Feeds into `learning/evolution.ts`

### 6. Interfaces (`interfaces/`)
- **azure-openai.ts**
  - Type definitions for Azure OpenAI operations
  - Used by core components
  - Ensures type safety

- **meetings.ts**
  - Meeting-related type definitions
  - Used by meeting service
  - Ensures data consistency

- **tasks.ts**
  - Task-related type definitions
  - Used by task service
  - Maintains type safety

- **time-entries.ts**
  - Time entry type definitions
  - Used by time entry service
  - Ensures data integrity

This detailed structure ensures:
1. Clear separation of concerns
2. Efficient data flow
3. Proper error handling
4. Scalable architecture
5. Maintainable codebase
6. Type safety throughout the system
7. Efficient caching and storage
8. Robust monitoring and logging
9. Reliable backup systems
10. Continuous learning and improvement

## System Architecture

### Core Components

#### 1. Azure OpenAI Integration (`ai-agent/core/azure-openai/`)
- **Client Management**: Handles Azure OpenAI API interactions
- **Prompt Templates**: Specialized prompts for different operations
  - Meeting analysis templates
  - Task matching templates
  - Description generation templates
- **Model Configuration**: Azure OpenAI model settings and parameters
- **API Utilities**: Helper functions for API interactions

#### 2. AI Engines (`ai-agent/core/engine/`)
- **Scheduler**: AI-driven scheduling and timing decisions
- **Matcher**: Intelligent task-meeting association
- **Sync**: Synchronization of data and operations
- **Monitor**: System monitoring and health checks

#### 3. Learning System (`ai-agent/core/learning/`)
- **Pattern Recognition**: Identifies user and system patterns
- **System Evolution**: Improves decision-making over time
- **Feedback Processing**: Incorporates user feedback for improvement

### Service Layer

#### 1. Meeting Understanding Service
- Contextual analysis of meeting data
- Relevance determination
- Key information extraction
- Adaptive processing

#### 2. Task Understanding Service
- Intuitive task-meeting matching
- Confidence scoring
- Optimal suggestion generation
- Dynamic matching algorithms

#### 3. Time Entry Creation Service
- Automated entry generation
- Natural language descriptions
- Duration determination
- Intelligent categorization

### Data Management

#### 1. Storage System
- **User Patterns**: Stores behavioral patterns and preferences
- **Neural State**: AI model state and learning data
- **Feedback History**: User corrections and feedback
- **Confidence Metrics**: AI matching confidence tracking
- **Sync State**: Synchronization status
- **Posted Meetings**: Processed meeting records

#### 2. Cache Management
- In-memory operations
- Performance optimization
- Temporary data handling

## Frontend Architecture

### Dashboard Structure

#### 1. Main Dashboard Components
```
├── dashboard/                    # Main Dashboard Directory
│   ├── components/             # Reusable UI Components
│   │   ├── meetings/          # Meeting-related Components
│   │   │   ├── MeetingList.tsx
│   │   │   ├── MeetingCard.tsx
│   │   │   ├── MeetingAnalysis.tsx
│   │   │   └── MeetingFilters.tsx
│   │   │
│   │   ├── tasks/            # Task-related Components
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskMatching.tsx
│   │   │   └── TaskFilters.tsx
│   │   │
│   │   ├── time-entries/     # Time Entry Components
│   │   │   ├── TimeEntryList.tsx
│   │   │   ├── TimeEntryCard.tsx
│   │   │   └── TimeEntryFilters.tsx
│   │   │
│   │   └── common/           # Shared Components
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       ├── Loading.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── pages/                # Main Application Pages
│   │   ├── Dashboard.tsx     # Main Dashboard View
│   │   ├── Meetings.tsx      # Meetings Management
│   │   ├── Tasks.tsx         # Tasks Management
│   │   ├── TimeEntries.tsx   # Time Entries View
│   │   ├── Analytics.tsx     # System Analytics
│   │   └── Settings.tsx      # System Configuration
│   │
│   ├── services/             # Frontend Services
│   │   ├── api/             # API Integration
│   │   │   ├── meetings.ts  # Meeting API Calls
│   │   │   ├── tasks.ts     # Task API Calls
│   │   │   └── time.ts      # Time Entry API Calls
│   │   │
│   │   └── state/          # State Management
│   │       ├── store.ts    # Central State Store
│   │       ├── actions.ts  # State Actions
│   │       └── reducers.ts # State Reducers
│   │
│   └── utils/              # Frontend Utilities
       ├── formatters.ts    # Data Formatting
       ├── validators.ts    # Input Validation
       └── helpers.ts       # Helper Functions
```

### Dashboard Features

#### 1. Meeting Management
- **Real-time Meeting Analysis**
  - Live meeting context understanding
  - Relevance scoring visualization
  - Key points extraction display
  - Meeting patterns visualization

- **Meeting Overview**
  - Calendar integration
  - Meeting categorization
  - Priority indicators
  - AI-driven insights display

#### 2. Task Management
- **Task-Meeting Association**
  - Visual task-meeting matching
  - Confidence score indicators
  - Manual override options
  - Pattern learning feedback

- **Task Analytics**
  - Task completion tracking
  - Time allocation analysis
  - Pattern recognition insights
  - Productivity metrics

#### 3. Time Entry Dashboard
- **Automated Time Entries**
  - AI-generated entry preview
  - Manual editing interface
  - Batch processing view
  - Historical entry analysis

- **Time Analytics**
  - Time utilization charts
  - Category distribution
  - Trend analysis
  - Optimization suggestions

#### 4. System Analytics
- **Performance Metrics**
  - AI accuracy tracking
  - System health monitoring
  - Response time analytics
  - Resource utilization

- **Learning Insights**
  - Pattern recognition results
  - System evolution metrics
  - Feedback implementation tracking
  - Improvement suggestions

### User Interface Components

#### 1. Navigation
- **Header**
  - Quick actions
  - Notifications
  - User settings
  - System status

- **Sidebar**
  - Main navigation
  - Context-aware menu
  - Quick filters
  - System metrics

#### 2. Data Visualization
- **Charts and Graphs**
  - Time allocation charts
  - Meeting distribution
  - Task completion rates
  - System performance metrics

- **Interactive Elements**
  - Drag-and-drop interfaces
  - Real-time updates
  - Interactive filters
  - Dynamic sorting

#### 3. Feedback Mechanisms
- **User Input**
  - Rating systems
  - Comment interfaces
  - Correction tools
  - Suggestion boxes

- **AI Interaction**
  - Confidence indicators
  - Override options
  - Learning feedback
  - Pattern suggestions

### Integration Points

#### 1. Backend Communication
- **API Integration**
  - RESTful endpoints
  - WebSocket connections
  - Error handling
  - Rate limiting

- **Data Sync**
  - Real-time updates
  - Offline capability
  - Conflict resolution
  - Cache management

#### 2. External Systems
- **Calendar Integration**
  - Meeting sync
  - Schedule management
  - Availability tracking
  - Conflict detection

- **Task Systems**
  - Task import/export
  - Status synchronization
  - Priority mapping
  - Category alignment

### Security Features

#### 1. Authentication
- Secure login system
- Role-based access
- Session management
- Multi-factor authentication

#### 2. Data Protection
- Encrypted communication
- Secure storage
- Access logging
- Audit trails

### Performance Optimization

#### 1. Loading Strategies
- Lazy loading
- Progressive rendering
- Data pagination
- Cache management

#### 2. Resource Management
- Asset optimization
- Bundle splitting
- Memory management
- Network optimization

This frontend architecture ensures:
1. Seamless integration with the AI agent backend
2. Intuitive user experience
3. Real-time data visualization
4. Efficient performance
5. Secure operation
6. Scalable structure
7. Maintainable codebase
8. Responsive design
9. Accessible interface
10. Extensible architecture

## Operational Parameters

### Azure OpenAI Service Limits
- Tokens per Minute: 8,000
- Requests per Minute: 48

### Key Capabilities

1. **Autonomous Decision Making**
   - Independent reasoning
   - Contextual understanding
   - Adaptive learning

2. **Natural Language Processing**
   - Context comprehension
   - Semantic analysis
   - Information extraction

3. **Pattern Recognition**
   - User behavior analysis
   - System optimization
   - Trend identification

4. **Quality Assurance**
   - Confidence scoring
   - Validation checks
   - Error handling

## System Workflow

1. **Data Ingestion**
   - Meeting data reception
   - Task information processing
   - Context gathering

2. **AI Processing**
   - Natural language understanding
   - Pattern matching
   - Decision making

3. **Output Generation**
   - Time entry creation
   - Task matching
   - Description generation

4. **Learning and Adaptation**
   - Feedback incorporation
   - Pattern recognition
   - System evolution

## Security and Compliance

1. **Data Protection**
   - Secure storage
   - Encryption
   - Access control

2. **Rate Limiting**
   - API request management
   - Resource optimization
   - Usage monitoring

3. **Error Handling**
   - Graceful degradation
   - Recovery procedures
   - Error logging

## Monitoring and Maintenance

1. **System Health**
   - Performance monitoring
   - Resource usage tracking
   - Error detection

2. **Quality Metrics**
   - Accuracy tracking
   - Confidence scoring
   - User satisfaction

3. **Backup and Recovery**
   - Regular backups
   - State preservation
   - Recovery procedures

## Future Enhancements

1. **Scalability**
   - Increased processing capacity
   - Enhanced parallel operations
   - Improved resource management

2. **Learning Capabilities**
   - Advanced pattern recognition
   - Improved decision making
   - Enhanced adaptation

3. **Integration Options**
   - Additional service connections
   - Extended API capabilities
   - New feature support

## Implementation Notes

### Project Setup & Structure
1. Directory Placement
   - `ai-agent` directory will be created inside `src/`
   - Follow the directory structure defined in this document
   - Keeps AI agent code separate but within main application

### Authentication System
1. Existing Authentication (NextAuth)
   - Already implemented and working
   - No need for new authentication system
   - Leverage existing NextAuth session management

2. Dual Authentication Levels
   a. Delegation Permissions
   - Purpose: Website login (NextAuth)
   - Uses: `AZURE_AD_CLIENT_ID`
   - Status: Already implemented
   
   b. Application Permissions
   - Purpose: Fetching meetings
   - Uses: `AZURE_AD_APP_CLIENT_ID`
   - No additional auth needed
   - Independent of user authentication

### User Management
1. User Data Storage
   - Location: `.data/user-data.json`
   - Contains:
     - User IDs
     - Email addresses
     - Intervals API keys
     - Last sync timestamps
   - Current user accessible via NextAuth session
   - No need for new user management system

### Configuration Management
1. Environment Configuration
   - Single source: `.env.local`
   - Contains all necessary configurations:
     ```
     # Delegation Permissions
     AZURE_AD_CLIENT_ID
     AZURE_AD_CLIENT_SECRET
     AZURE_AD_TENANT_ID

     # Application Permissions
     AZURE_AD_APP_CLIENT_ID
     AZURE_AD_APP_CLIENT_SECRET
     AZURE_AD_APP_TENANT_ID

     # NextAuth Configuration
     NEXTAUTH_URL
     NEXTAUTH_SECRET

     # Azure OpenAI Configuration
     AZURE_OPENAI_ENDPOINT
     AZURE_OPENAI_API_KEY
     AZURE_OPENAI_DEPLOYMENT
     ```

### Implementation Priorities
1. Initial Focus
   - Fetch raw meeting data
   - Use application permissions for meeting access
   - Get current user context from session
   - Implement AI agent core components

2. Key Development Points
   - Don't modify existing authentication
   - Don't create new user management
   - Focus on AI agent implementation
   - Use existing session management
   - Azure OpenAI configuration is ready

3. Development Approach
   - Start with backend implementation
   - Focus on core AI functionality first
   - Ensure stable API contracts
   - Build frontend after backend stability
   - Maintain separation of concerns

### Important Reminders
1. Authentication
   - Use existing NextAuth system
   - Don't create new auth mechanisms
   - Leverage current session management

2. User Data
   - Use existing user data storage
   - Access through current session
   - No need for new user system

3. Configuration
   - All configs in `.env.local`
   - No need for additional config files
   - Use existing environment setup

4. Development Focus
   - Priority on meeting data retrieval
   - Focus on AI agent core functionality
   - Build on existing infrastructure
   - Maintain clean separation from existing code

These notes serve as a reference guide during implementation to ensure consistency and proper integration with existing systems. 