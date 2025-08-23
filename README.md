# 🏸 Badminton Group Management App

A comprehensive badminton pairing management application built with React Native, Node.js, Express, and PostgreSQL.

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
   git clone <repository-url>
   cd badminton-group
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

#### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token

#### Sessions
- `GET /sessions` - List user's sessions
- `POST /sessions` - Create new session
- `GET /sessions/:id` - Get session details
- `PUT /sessions/:id` - Update session
- `DELETE /sessions/:id` - Delete session

#### Health Check
- `GET /health` - Application health check

### Real-time Events (Socket.io)
- `join-session` - Join session room
- `leave-session` - Leave session room
- `player-status-update` - Update player status
- `session-updated` - Session data changed

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

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team

## 📊 Architecture Documentation

For detailed architecture information, see:
- [`docs/architecture.md`](docs/architecture.md) - System architecture
- [`docs/api-design.md`](docs/api-design.md) - API specifications
- [`docs/frontend-design.md`](docs/frontend-design.md) - Frontend architecture
- [`docs/deployment-strategy.md`](docs/deployment-strategy.md) - Deployment guide
- [`docs/technical-decisions.md`](docs/technical-decisions.md) - Technical decisions

---

**Built with ❤️ for badminton enthusiasts**