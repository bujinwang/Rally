# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Backend Development
```bash
cd backend
npm run dev          # Start development server with auto-reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Run production build
npm test             # Run backend tests

# Database commands
npx prisma generate   # Generate Prisma client (after schema changes)
npx prisma db push    # Push schema to database (no migration files)
npx prisma studio     # Open Prisma Studio GUI
```

### Frontend Development
```bash
cd frontend/Rally
npm start            # Start Expo development server
npm run ios          # Run on iOS simulator
npm run android      # Run on Android emulator
```

## Project Architecture

Rally — badminton/pickleball session management with React Native + Node.js.

### Current Implementation Status
- **MVP Phase**: No authentication — uses deviceId + name identification
- **Real-time**: Socket.io fully implemented (presence, session rooms, messaging, discovery, geo-filtering)
- **AI Features**: ELO ratings, snake-draft team balancer, court optimizer, regular group detection, personalized player insights
- **Clubs**: Club accounts with member management, auto-invite on club sessions
- **Cost Sharing**: 5 cost models (split/BYOB/organizer/per-player/per-court), per-game birdie tracking

### Tech Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Frontend**: React Native + Expo + TypeScript + Redux Toolkit
- **Real-time**: Socket.io (fully implemented — presence, session rooms, messaging, discovery)
- **Database**: PostgreSQL with Prisma (db push, no migration files)

### Data Models

#### Active (MVP)
- `MvpSession`: session with shareCode, clubId, costModel, birdie tracking
- `MvpPlayer`: player by name + deviceId, status (ACTIVE/RESTING/LEFT/PENDING)
- `Club` + `ClubMember`: club accounts with admin/member roles
- `MvpGame` + `MvpMatch`: game/match tracking with birdiesUsed per game
- `SessionTemplate`: reusable session presets

#### Future (Schema exists, not used)
- `User`: full user accounts with authentication
- `Session` + `SessionPlayer`: authenticated session model

### Backend Services (`/backend/src/services/`)
| Service | Purpose |
|---------|---------|
| `clubService` | Club create/join/discover, club session auto-invite |
| `costSharingService` | 5 cost models, birdie tracking, per-player cost calculation |
| `regularGroupService` | Detect recurring player groups, predict next session |
| `smartInsightsService` | ELO ratings, team balancer, court optimizer, player insights |
| `rankingService` | Session/global rankings, ELO decay |
| `statisticsService` | Game/match stats, leaderboards, partnership tracking |
| `cacheService` | In-memory cache for performance |
| `messagingService` | Chat messaging between players |

### API Routes (`/backend/src/routes/`)
Key endpoints registered in `index.ts`:
- `/mvp-sessions` — session CRUD, auto-invite via invitePlayerNames
- `/clubs` — club accounts, club session creation
- `/session-costs` — cost breakdown, birdie tracking
- `/session-insights` — AI-powered insights, balanced teams, player tips
- `/session-suggestions` — regular group detection
- `/rankings` — session/global rankings, decay
- `/statistics` — trends, streaks, percentiles, leaderboard
- `/session-templates` — reusable session presets

### Frontend Components (`/frontend/Rally/src/`)
- `SessionShareModal` — share card with location/time/players for WeChat/WhatsApp
- `SessionSuggestions` — regular group detection cards
- `TrendsDashboardScreen` — 5-tab analytics (trends/streaks/percentiles/leaderboard/heatmap)
- `CreateSessionScreen` — accepts prefill from suggestions, sends invitePlayerNames

### Development Guidelines
- Schema changes: `npx prisma generate` then `npx prisma db push`
- Routes auto-registered in `index.ts` — add import + router.use()
- MVP players use deviceId for identity, no JWT required
- SyncManager uses API_BASE_URL + X-Device-ID header for offline sync
- All tests in `backend/` — Jest + Supertest