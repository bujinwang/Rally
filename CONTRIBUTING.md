# Contributing to BadmintonGroup

We welcome contributions to the BadmintonGroup project! This document provides guidelines for contributing to the project.

## 🤝 How to Contribute

### Reporting Issues

Before creating an issue, please:
1. Check if the issue already exists in our [GitHub Issues](../../issues)
2. Provide a clear description of the problem
3. Include steps to reproduce the issue
4. Mention your environment (OS, Node.js version, React Native version)
5. Add relevant logs or screenshots

### Suggesting Features

We're always looking for ways to improve BadmintonGroup! When suggesting a feature:
1. Check existing [feature requests](../../issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
2. Provide a clear description of the feature
3. Explain the use case and benefits
4. Consider the impact on existing functionality

### Code Contributions

#### Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/BadmintonGroup.git
   cd BadmintonGroup
   ```

2. **Set up the development environment**
   ```bash
   # Backend setup
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npx prisma generate
   npx prisma db push
   npm run dev

   # Frontend setup (in another terminal)
   cd frontend/BadmintonGroup
   npm install
   npx expo start
   ```

3. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Guidelines

**Code Style**
- Follow TypeScript best practices
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Follow the existing code style in the project

**Backend Development**
- Use Prisma for database operations
- Implement proper error handling
- Add input validation using Joi schemas
- Follow RESTful API conventions
- Add appropriate middleware for security

**Frontend Development**
- Use React Native best practices
- Implement proper error boundaries
- Use Redux Toolkit for state management
- Follow React Navigation patterns
- Ensure cross-platform compatibility (iOS/Android)

**Testing**
- Write unit tests for new functionality
- Ensure existing tests pass
- Add integration tests for API endpoints
- Test on both iOS and Android platforms

#### Pull Request Process

1. **Before submitting**
   - Ensure all tests pass
   - Update documentation if needed
   - Check that your code follows the style guidelines
   - Rebase your branch on the latest main branch

2. **Pull Request Requirements**
   - Provide a clear description of changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure CI/CD checks pass

3. **Review Process**
   - At least one maintainer review is required
   - Address feedback promptly
   - Be open to suggestions and improvements

## 🏗️ Project Structure

```
BadmintonGroup/
├── backend/                 # Node.js/Express API server
│   ├── src/
│   │   ├── config/         # Database and Socket.io configuration
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API route handlers
│   │   └── utils/          # Utility functions
│   ├── prisma/             # Database schema and migrations
│   └── Dockerfile          # Backend container configuration
├── frontend/               # React Native mobile app
│   └── BadmintonGroup/
│       ├── src/
│       │   ├── components/ # Reusable UI components
│       │   ├── screens/    # Screen components
│       │   ├── services/   # API and utility services
│       │   ├── store/      # Redux store and slices
│       │   └── navigation/ # Navigation configuration
└── docker/                 # Docker Compose configuration
```

## 🧪 Testing

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend/BadmintonGroup
npm test

# Integration tests
npm run test:integration
```

### Writing Tests

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test API endpoints and database interactions
- **E2E Tests**: Test complete user workflows

## 📋 Code of Conduct

### Our Standards

- **Be Respectful**: Treat everyone with respect and kindness
- **Be Inclusive**: Welcome people of all backgrounds and experience levels
- **Be Collaborative**: Work together to achieve common goals
- **Be Patient**: Help others learn and grow

### Unacceptable Behavior

- Harassment or discrimination of any kind
- Offensive comments or personal attacks
- Trolling or inflammatory comments
- Publishing private information without consent

## 🐛 Debugging

### Common Issues

**Backend Issues**
- Database connection problems: Check your DATABASE_URL
- Port conflicts: Ensure port 3001 is available
- Missing environment variables: Copy .env.example to .env

**Frontend Issues**
- Metro bundler issues: Try `npx react-native start --reset-cache`
- iOS build problems: Run `cd ios && pod install`
- Android build issues: Check Android SDK setup

### Getting Help

- Check our [documentation](./README.md)
- Search [existing issues](../../issues)
- Ask questions in [discussions](../../discussions)
- Contact maintainers for urgent issues

## 📄 License

By contributing to BadmintonGroup, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be recognized in our README.md file and release notes. We appreciate all contributions, no matter how small!

---

Thank you for contributing to BadmintonGroup! Your involvement helps make this project better for the badminton community worldwide. 🏸