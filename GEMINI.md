# 🏸 Badminton Group Management App

## Project Overview

This is a full-stack application designed to manage badminton group sessions, with a strong focus on creating a fair and intelligent player rotation system. The project is built with a modern tech stack, featuring a TypeScript backend and a React Native mobile application for iOS and Android.

The core problem it solves is ensuring equitable playtime for all participants in a drop-in badminton session by automatically managing who plays, who sits out, and who is up next based on defined rules.

The architecture consists of:
*   **Backend:** A Node.js/Express server using TypeScript. It connects to a PostgreSQL database via the Prisma ORM. Real-time communication is handled with WebSockets (Socket.io).
*   **Frontend:** A React Native (Expo) mobile application written in TypeScript, using Redux for state management.
*   **Web Join Interface:** A simple, server-rendered HTML page allows users to quickly join a session via a shared link without needing to install the full mobile app.
*   **Database:** The Prisma schema is designed for a phased rollout, starting with an MVP model that doesn't require user authentication, and evolving to a full-featured system with user accounts.

## Building and Running

The project is containerized with Docker for streamlined development.

### 1. Start Backend Services

The PostgreSQL database and Redis cache are managed by Docker Compose.

```bash
# Navigate to the docker directory
cd docker

# Start the services in detached mode
docker-compose up -d
```

### 2. Set Up and Run the Backend

The backend server handles the API, WebSockets, and database interactions.

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Run database migrations to set up the schema
npx prisma migrate dev

# Start the development server (with hot-reloading)
npm run dev
```
The backend will be running on `http://localhost:3001`.

### 3. Set Up and Run the Frontend

The frontend is a React Native application managed with Expo.

```bash
# Navigate to the frontend directory
cd frontend/BadmintonGroup

# Install dependencies
npm install

# Start the Metro bundler with Expo
npx expo start
```
This will open the Expo developer tools in your browser. You can then run the app on a simulator (iOS/Android) or on your physical device using the Expo Go app.

## Key Commands

*   **Run all tests:** `npm test` (run from within `backend` or `frontend/BadmintonGroup`).
*   **View database with Prisma Studio:** `npx prisma studio` (run from `backend`).
*   **Build backend for production:** `npm run build` (run from `backend`).

## Development Conventions

*   **Full-Stack TypeScript:** Both the backend and frontend are written in TypeScript, ensuring type safety across the entire application.
*   **Monorepo-like Structure:** The project is organized with separate `frontend` and `backend` directories, each with its own `package.json` and dependencies.
*   **Database Migrations:** Database schema changes are managed declaratively using `schema.prisma` and applied with `npx prisma migrate dev`.
*   **API-Driven:** The frontend communicates with the backend via a REST API for most actions and uses WebSockets for real-time updates (e.g., player list changes, game status).
*   **Phased Rollout:** The `PRD.md` and database schema indicate a clear plan to launch with an auth-less MVP and progressively add more complex features like user accounts, authentication, and advanced statistics.
*   **Code Style:** The presence of `.eslintrc.js` and `.prettierrc.js` suggests that the project uses ESLint and Prettier to maintain a consistent code style.
