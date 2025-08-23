# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Backend Development
```bash
cd backend
npm run dev          # Start development server with auto-reload
npm run build        # Build TypeScript to JavaScript
npm run start        # Run production build
npm test             # Run tests (currently placeholder)

# Database commands
npm run prisma:generate  # Generate Prisma client
npm run prisma:push      # Push schema to database
npm run prisma:studio    # Open Prisma Studio GUI
npm run prisma:migrate   # Run database migrations
```

### Frontend Development
```bash
cd frontend/BadmintonGroup
npm start            # Start Expo development server
npm run ios          # Run on iOS simulator
npm run android      # Run on Android emulator
npm run lint         # Run ESLint
npm test             # Run Jest tests
```

### Docker Development
```bash
cd docker
docker-compose up -d     # Start all services (PostgreSQL, Redis)
docker-compose down      # Stop all services
docker-compose logs -f   # View logs
```

## Project Architecture

This is a badminton pairing management application with a React Native frontend and Node.js backend.

### Current Implementation Status
- **MVP Phase**: No authentication system - uses simple name-based player identification
- **Database**: Dual schema design with MvpSession/MvpPlayer (MVP) and User/Session models (future)
- **Share Links**: Sessions are shared via unique shareCodes instead of user invitations

### Tech Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Frontend**: React Native + Expo + TypeScript + Redux Toolkit
- **Real-time**: Socket.io (configured but not yet implemented)
- **Database**: PostgreSQL with Prisma migrations

### Key Architecture Patterns

#### MVP Data Models (Currently Active)
- `MvpSession`: Sessions without user accounts, identified by shareCode
- `MvpPlayer`: Players identified by name + deviceId only
- Sessions are shared via links containing the shareCode

#### Future Data Models (Implemented but not used)
- `User`: Full user accounts with authentication
- `Session` + `SessionPlayer`: Full featured sessions with user relationships

### Code Structure

#### Backend (`/backend`)
- `src/server.ts` - Main Express server
- `src/routes/` - API route handlers
- `src/middleware/` - Express middleware (auth, error handling)
- `src/config/` - Database and Socket.io configuration
- `src/utils/` - Utility functions (JWT, password, validation)
- `prisma/schema.prisma` - Database schema with dual model design

#### Frontend (`/frontend/BadmintonGroup`)
- `src/screens/` - React Native screens
- `src/navigation/` - Navigation configuration
- `src/store/` - Redux store and slices
- `src/services/` - API calls and data services
- `src/hooks/` - Custom React hooks

### Development Guidelines

#### Database Changes
- Use Prisma migrations: `npm run prisma:migrate`
- Always regenerate client after schema changes: `npm run prisma:generate`
- Current focus is on MvpSession/MvpPlayer models

#### API Development
- Routes are in `backend/src/routes/`
- Use Joi validation for request validation
- Error handling middleware is configured

#### Frontend Development
- Uses Expo for React Native development
- Redux Toolkit for state management
- React Navigation for navigation
- Currently targeting MVP functionality without authentication

### Current Development Focus
Based on the PRD, the current priority is implementing the MVP version which includes:
1. No-authentication session creation
2. Share link functionality
3. Simple player management by name only
4. Basic rotation algorithms

The full authentication system and advanced features are planned for later phases.