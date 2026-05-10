# 🏸 Rally

<div align="center">
  <img src="https://img.shields.io/badge/React%20Native-0.76-blue?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-15+-blue?logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
</div>

<div align="center">
  <h3>🚀 A modern, real-time badminton session management platform</h3>
  <p>Create, join, and manage badminton sessions with intelligent pairing algorithms and live updates</p>
</div>

## ✨ Features

### Core
- 🏸 **Multi-Sport Support**: Badminton, pickleball, tennis, table tennis, volleyball
- ⚡ **Real-time Updates**: Live session status, game results, and chat via Socket.io
- 📱 **Cross-platform**: iOS, Android, and Web
- 🔐 **Authentication**: JWT + OAuth (Google, WeChat)
- 🔗 **Easy Sharing**: Share links + QR codes for quick session joining

### Sessions & Gameplay
- 🎯 **Smart Pairing**: Rotation-based fair pairing with manual override
- 📊 **Scoring & Stats**: Match recording, leaderboards, win/loss tracking
- 🏆 **Tournaments**: Bracket generation, scheduling, results
- ⏱️ **Player Status**: Active / Resting / Left management
- 📅 **Match Scheduling**: Calendar-based match planning

### Social & Community
- 👥 **Friend System**: Send/accept requests, block users, friend search
- 💬 **Messaging**: Direct messages + group chat with typing indicators
- 🌍 **Community Discovery**: Leaderboards, venue directory, player search
- 🎖️ **Achievements**: Badge system for milestones and performance
- 🔔 **Live Notifications**: Game ready, friend requests, messages

### Management
- 💰 **Deposit System**: Required deposits, pay/no-show tracking
- 🛡️ **Organizer Controls**: Claim flow, permissions, audit logging
- 📈 **Analytics**: Session stats, performance trends, CSV export
- 👤 **User Profiles**: Avatars, privacy settings, notification preferences

---

## 📊 Project Stats

<div align="center">
  <img src="https://img.shields.io/github/stars/yourusername/BadmintonGroup?style=social" alt="GitHub stars" />
  <img src="https://img.shields.io/github/forks/yourusername/BadmintonGroup?style=social" alt="GitHub forks" />
  <img src="https://img.shields.io/github/issues/yourusername/BadmintonGroup" alt="GitHub issues" />
  <img src="https://img.shields.io/github/issues-pr/yourusername/BadmintonGroup" alt="GitHub pull requests" />
  <img src="https://img.shields.io/github/last-commit/yourusername/BadmintonGroup" alt="Last commit" />
</div>

## 📋 Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Development](#development)
- [Deployment](#deployment)
- [API Documentation](#api-documentation)

## 🏗️ Architecture Overview

This application follows a modern full-stack architecture:

### Backend (Node.js + Express + PostgreSQL)
- **Authentication**: JWT with refresh tokens
- **Real-time**: Socket.io for live updates
- **Database**: Prisma ORM with PostgreSQL
- **Validation**: Joi schema validation
- **Security**: Helmet, CORS, rate limiting

### Frontend (React Native)
- **Cross-platform**: iOS, Android, and Web support
- **State Management**: Redux Toolkit + RTK Query
- **Navigation**: React Navigation
- **Offline Support**: AsyncStorage with optimistic updates

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Database**: PostgreSQL with connection pooling
- **Cache**: Redis for session management
- **Deployment**: Ready for AWS ECS/Kubernetes

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL 15+
- **ORM**: Prisma
- **Authentication**: JWT + Bcrypt
- **Real-time**: Socket.io
- **Validation**: Joi
- **Logging**: Winston

### Frontend
- **Framework**: React Native 0.72+
- **Language**: TypeScript
- **State Management**: Redux Toolkit
- **Navigation**: React Navigation 6
- **API Client**: Custom fetch wrapper
- **Storage**: AsyncStorage

### DevOps
- **Containerization**: Docker
- **Orchestration**: Docker Compose
- **CI/CD**: GitHub Actions
- **Database**: Prisma Migrate
- **Monitoring**: Health checks

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- Git

### Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/BadmintonGroup.git
   cd BadmintonGroup
   ```

2. **Start the backend services**
   ```bash
   cd docker
   docker-compose up -d
   ```

3. **Set up the database**
   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma db seed
   ```

4. **Start the backend server**
   ```bash
   npm run dev
   ```

5. **Set up the frontend**
   ```bash
   cd frontend
   npm install
   npx react-native run-ios    # or run-android
   ```

### Manual Setup

#### Backend Setup

1. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Set up PostgreSQL and Redis**
   ```bash
   # Using Docker
   docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=password123 postgres:15
   docker run -d --name redis -p 6379:6379 redis:7-alpine
   ```

4. **Initialize database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

#### Frontend Setup

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **iOS Setup**
   ```bash
   cd ios
   pod install
   cd ..
   npx react-native run-ios
   ```

3. **Android Setup**
   ```bash
   npx react-native run-android
   ```

4. **Web Setup**
   ```bash
   npm run web
   ```

## 🏗️ Development

### Backend Development

```bash
cd backend

# Development with auto-reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Database management
npm run prisma:studio    # Open Prisma Studio
npm run prisma:migrate   # Run migrations
npm run prisma:generate  # Regenerate Prisma client
```

### Frontend Development

```bash
cd frontend

# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on Web
npm run web

# Run tests
npm test
```
# Start the expo:
npx expo start --clear --localhost
```

### Database Management

```bash
# View database
npx prisma studio

# Reset database
npx prisma migrate reset

# Create migration
npx prisma migrate dev --name <migration-name>

# Generate client
npx prisma generate
```

## 🐳 Docker Development

### Using Docker Compose

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild services
docker-compose up -d --build
```

### Individual Services

```bash
# Backend only
docker build -f backend/Dockerfile.dev -t badminton-backend .
docker run -p 3001:3001 badminton-backend

# Database only
docker run -d --name postgres -p 5432:5432 \
  -e POSTGRES_PASSWORD=password123 \
  postgres:15
```

## 📡 API Documentation

### Base URL
- **Development**: `http://localhost:3001/api/v1`
- **Production**: `https://api.badmintongroup.com/api/v1`

### Authentication
All API endpoints except authentication require JWT token:
```
Authorization: Bearer <jwt_token>
```

### Key Endpoints

| Category | Endpoints |
|----------|-----------|
| **Auth** | `register`, `login`, `refresh`, OAuth (Google/WeChat) |
| **MVP Sessions** | `create`, `join`, `leave`, `claim organizer`, player status |
| **Users** | `profile`, `avatar upload`, `settings`, `search` |
| **Friends** | `send/accept/decline requests`, `block`, `stats`, `suggestions` |
| **Messaging** | `threads`, `direct messages`, `group chat`, `read receipts` |
| **Scoring** | `record scores`, `leaderboard`, `edit/delete with audit trail` |
| **Tournaments** | `create`, `brackets`, `schedule`, `results` |
| **Community** | `leaderboard`, `venue directory`, `trending sessions`, `nearby players` |
| **Statistics** | `player stats`, `session analytics`, `performance trends` |
| **Achievements** | `badge system`, `milestone tracking` |
| **Match Scheduling** | `calendar planning`, `conflict detection` |
| **Deposits** | `required deposits`, `pay/no-show tracking` |

> Full route listing: `backend/src/routes/index.ts` — 25+ active route modules.

### Real-time Events (Socket.io)
- `messaging:new-message`, `messaging:user-typing` — real-time chat
- `mvp-session-updated` — live session state changes
- `presence:user-online`, `presence:user-offline` — friend presence
- `friend_request_received` — instant friend notifications

## 🚀 Deployment

### Environment Variables

#### Backend
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/database
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
REDIS_URL=redis://host:6379
CORS_ORIGIN=https://yourdomain.com
```

### Production Deployment

1. **Build and push Docker images**
   ```bash
   docker build -t badminton-backend ./backend
   docker tag badminton-backend your-registry/badminton-backend:latest
   docker push your-registry/badminton-backend:latest
   ```

2. **Deploy with Docker Compose**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Database migrations**
   ```bash
   npx prisma migrate deploy
   ```

### Monitoring

The application includes built-in health checks:
- `GET /health` - Basic health check
- Database connectivity check
- Redis connectivity check (if configured)

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Integration Tests
```bash
# Coming soon
npm run test:integration
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Submit a pull request

### Development Setup

See our [Environment Setup Guide](docs/ENVIRONMENT_SETUP.md) for detailed configuration instructions.

## 🔗 Useful Links

- 📘 [API Documentation](docs/API.md)
- 🏢 [Architecture Guide](docs/ARCHITECTURE.md)
- 🛠️ [Environment Setup](docs/ENVIRONMENT_SETUP.md)
- 🐛 [Issue Templates](/.github/ISSUE_TEMPLATE/)
- 📋 [Project Roadmap](../../projects)
- 📊 [Changelog](CHANGELOG.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

We're here to help! If you have questions or need assistance:

- 📝 [Create an issue](../../issues) for bug reports or feature requests
- 💬 [Join discussions](../../discussions) for general questions
- 📖 Check our [documentation](docs/) for detailed guides
- 🔍 Search [existing issues](../../issues?q=is%3Aissue) to see if your question has been answered

## 🌟 Show Your Support

If you find this project helpful, please consider:
- ⭐ Starring the repository
- 🐛 Reporting bugs
- 💡 Suggesting new features
- 🤝 Contributing code
- 📢 Sharing with the badminton community

## 📊 Architecture Documentation

For detailed architecture information, see:
- [`docs/architecture.md`](docs/architecture.md) - System architecture
- [`docs/api-design.md`](docs/api-design.md) - API specifications
- [`docs/frontend-design.md`](docs/frontend-design.md) - Frontend architecture
- [`docs/deployment-strategy.md`](docs/deployment-strategy.md) - Deployment guide
- [`docs/technical-decisions.md`](docs/technical-decisions.md) - Technical decisions

---

**Built with ❤️ for badminton enthusiasts**