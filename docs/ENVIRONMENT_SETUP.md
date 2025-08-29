# Environment Configuration Guide

This document explains how to configure the BadmintonGroup application for different environments.

## 📋 Quick Setup

### Backend Configuration

1. **Copy the environment template:**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Update the `.env` file with your values:**
   - Set your PostgreSQL database URL
   - Generate secure JWT secrets
   - Configure CORS origins
   - Set up Redis (optional)

### Frontend Configuration

1. **Copy the environment template:**
   ```bash
   cd frontend/BadmintonGroup
   cp .env.example .env
   ```

2. **Update the `.env` file:**
   - Set the backend API URL
   - Configure Socket.io URL
   - Set app-specific variables

## 🔧 Environment Variables

### Backend Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `JWT_SECRET` | Secret for signing access tokens | `your-secure-secret-key` |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | `your-refresh-secret-key` |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Application environment | `development` |
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `LOG_LEVEL` | Logging level | `info` |
| `RATE_LIMIT_WINDOW_MS` | Rate limiting window | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |
| `BCRYPT_ROUNDS` | Password hashing rounds | `12` |

### Frontend Environment Variables

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API endpoint | `http://localhost:3001/api/v1` |
| `EXPO_PUBLIC_SOCKET_URL` | Socket.io server URL | `http://localhost:3001` |

#### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_APP_NAME` | Application name | `BadmintonGroup` |
| `EXPO_PUBLIC_APP_VERSION` | Application version | `1.0.0` |
| `EXPO_PUBLIC_ENVIRONMENT` | Environment name | `development` |
| `EXPO_PUBLIC_DEBUG_MODE` | Enable debug features | `true` |

## 🚀 Environment-Specific Configurations

### Development Environment

**Backend (.env):**
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://postgres:password123@localhost:5432/badminton_dev
JWT_SECRET=dev-jwt-secret-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=debug
```

**Frontend (.env):**
```env
EXPO_PUBLIC_API_URL=http://localhost:3001/api/v1
EXPO_PUBLIC_SOCKET_URL=http://localhost:3001
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_DEBUG_MODE=true
```

### Production Environment

**Backend (.env):**
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@prod-host:5432/badminton_prod
JWT_SECRET=your-super-secure-production-jwt-secret
JWT_REFRESH_SECRET=your-super-secure-production-refresh-secret
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=warn
REDIS_URL=redis://redis-host:6379
```

**Frontend (.env):**
```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
EXPO_PUBLIC_SOCKET_URL=https://api.yourdomain.com
EXPO_PUBLIC_ENVIRONMENT=production
EXPO_PUBLIC_DEBUG_MODE=false
```

### Testing Environment

**Backend (.env.test):**
```env
NODE_ENV=test
PORT=3002
DATABASE_URL=postgresql://postgres:password123@localhost:5432/badminton_test
JWT_SECRET=test-jwt-secret
JWT_REFRESH_SECRET=test-refresh-secret
LOG_LEVEL=error
```

## 🔒 Security Best Practices

### JWT Secrets
- **Development**: Use simple secrets for convenience
- **Production**: Generate cryptographically secure secrets
  ```bash
  # Generate secure secrets
  openssl rand -base64 64
  ```

### Database Configuration
- Use connection pooling in production
- Enable SSL for production databases
- Regularly rotate database passwords

### CORS Configuration
- **Development**: Allow localhost origins
- **Production**: Restrict to specific domains only
- Never use `*` for production CORS origins

## 🐳 Docker Configuration

The `docker-compose.yml` includes environment variables for containerized deployment:

```yaml
backend:
  environment:
    - DATABASE_URL=postgresql://postgres:password123@postgres:5432/badminton_dev
    - JWT_SECRET=development-jwt-secret-key
    - JWT_REFRESH_SECRET=development-refresh-secret-key
    - REDIS_URL=redis://redis:6379
```

For production Docker deployment, use environment files or Docker secrets.

## 🔍 Troubleshooting

### Common Issues

**Database Connection Errors**
- Verify DATABASE_URL format
- Ensure PostgreSQL is running
- Check network connectivity

**JWT Token Issues**
- Verify JWT secrets are set
- Check token expiration times
- Ensure consistent secrets across instances

**CORS Errors**
- Verify CORS_ORIGIN matches frontend URL
- Check for trailing slashes in URLs
- Ensure protocol (http/https) matches

**Port Conflicts**
- Change PORT variable if default is occupied
- Update frontend API_URL to match backend port
- Check firewall settings

### Validation

You can validate your environment configuration by running:

```bash
# Backend validation
cd backend
npm run validate-env

# Frontend validation
cd frontend/BadmintonGroup
npm run validate-env
```

## 📚 Additional Resources

- [Prisma Environment Variables](https://www.prisma.io/docs/guides/development-environment/environment-variables)
- [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [React Native Security](https://reactnative.dev/docs/security)