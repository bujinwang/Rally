# 🚀 Epic 4: Social & Community Features - Implementation Plan

**Status:** In Progress  
**Start Date:** January 29, 2025  
**Estimated Completion:** 3-4 weeks  
**Priority:** High  

---

## 📊 Current State Analysis

### ✅ What We Have (Already Built)

1. **Database Schema Complete** ✅
   - User model with authentication fields
   - Friend and FriendRequest models
   - Message and MessageThread models
   - SocialConnection model for OAuth
   - All relations properly defined

2. **Authentication System** ✅
   - JWT-based auth (access + refresh tokens)
   - Password hashing with bcrypt
   - Auth middleware (`authenticateToken`, `requireRole`)
   - Registration and login endpoints
   - Token refresh mechanism

3. **MVP Player System** ✅
   - MvpPlayer model (no-auth system)
   - Session joining via deviceId + name
   - Basic player management

4. **Partial Route Implementation** ⚠️
   - `friends.ts` exists but needs completion
   - `messaging.ts` exists but needs completion
   - `sharing.ts` for social sharing

### 🔨 What We Need to Build

1. **User Profile Management**
   - Profile CRUD operations
   - Avatar upload/storage
   - Profile settings
   - Privacy controls

2. **Friend System**
   - Send/accept/decline friend requests
   - Friend list management
   - Friend search and discovery
   - Block/unblock functionality

3. **Messaging System**
   - Direct messages (1-on-1)
   - Session group chat
   - Real-time message delivery (Socket.io)
   - Message history and pagination
   - Read receipts

4. **Community Discovery**
   - Enhanced public session discovery
   - Venue directory
   - Player search
   - Community leaderboards

5. **Migration Strategy**
   - Gradual migration from MvpPlayer to User
   - Link deviceId to User accounts
   - Preserve existing player data

---

## 🎯 Epic 4 Stories

### Story 4.1: User Profile Management (3 days)

**Goal:** Allow users to create and manage their profiles

**Backend Tasks:**
- [ ] Complete User profile API endpoints
- [ ] Add avatar upload functionality (S3 or local storage)
- [ ] Add profile validation and sanitization
- [ ] Add privacy settings management

**Frontend Tasks:**
- [ ] Build UserProfileScreen (view mode)
- [ ] Build EditProfileScreen
- [ ] Add avatar picker/uploader
- [ ] Add settings screen

**Files to Create/Modify:**
```
Backend:
- backend/src/routes/users.ts (new)
- backend/src/services/userService.ts (new)
- backend/src/utils/fileUpload.ts (new)

Frontend:
- frontend/src/screens/UserProfileScreen.tsx (new)
- frontend/src/screens/EditProfileScreen.tsx (new)
- frontend/src/components/AvatarPicker.tsx (new)
- frontend/src/screens/SettingsScreen.tsx (new)
```

**API Endpoints:**
```typescript
GET    /api/v1/users/:id/profile
PUT    /api/v1/users/:id/profile
POST   /api/v1/users/:id/avatar
DELETE /api/v1/users/:id/avatar
GET    /api/v1/users/:id/settings
PUT    /api/v1/users/:id/settings
```

---

### Story 4.2: Friend System (4 days)

**Goal:** Enable players to connect and manage friendships

**Backend Tasks:**
- [ ] Complete friend request endpoints
- [ ] Add friend management logic
- [ ] Add friend search functionality
- [ ] Add block/unblock features
- [ ] Socket.io events for friend requests

**Frontend Tasks:**
- [ ] Build FriendsListScreen
- [ ] Build FriendRequestsScreen
- [ ] Build AddFriendScreen (search users)
- [ ] Add friend request notifications
- [ ] Add friend status indicators

**Files to Create/Modify:**
```
Backend:
- backend/src/routes/friends.ts (enhance existing)
- backend/src/services/friendService.ts (new)

Frontend:
- frontend/src/screens/FriendsListScreen.tsx (new)
- frontend/src/screens/FriendRequestsScreen.tsx (new)
- frontend/src/screens/AddFriendScreen.tsx (new)
- frontend/src/components/FriendCard.tsx (new)
- frontend/src/components/FriendRequestCard.tsx (new)
```

**API Endpoints:**
```typescript
// Friend Requests
POST   /api/v1/friends/requests              # Send friend request
GET    /api/v1/friends/requests               # Get pending requests
PUT    /api/v1/friends/requests/:id/accept    # Accept request
PUT    /api/v1/friends/requests/:id/decline   # Decline request
DELETE /api/v1/friends/requests/:id           # Cancel sent request

// Friends Management
GET    /api/v1/friends                        # Get friend list
DELETE /api/v1/friends/:id                    # Remove friend
POST   /api/v1/friends/:id/block              # Block user
DELETE /api/v1/friends/:id/block              # Unblock user
GET    /api/v1/friends/blocked                # Get blocked users

// Friend Search
GET    /api/v1/users/search?q=name            # Search users
GET    /api/v1/friends/suggestions            # Friend suggestions
```

**Socket.io Events:**
```typescript
// Server → Client
'friend_request_received'  // New friend request
'friend_request_accepted'  // Request accepted
'friend_request_declined'  // Request declined
'friend_removed'           // Friend removed you
'friend_status_changed'    // Friend online/offline
```

---

### Story 4.3: Messaging System (5 days)

**Goal:** Enable real-time messaging between players

**Backend Tasks:**
- [ ] Complete messaging endpoints
- [ ] Implement message threads
- [ ] Add real-time Socket.io messaging
- [ ] Add message pagination
- [ ] Add read receipts
- [ ] Add typing indicators

**Frontend Tasks:**
- [ ] Build MessagesScreen (thread list)
- [ ] Build ChatScreen (conversation view)
- [ ] Add message bubbles and formatting
- [ ] Add real-time message updates
- [ ] Add typing indicators
- [ ] Add read receipts

**Files to Create/Modify:**
```
Backend:
- backend/src/routes/messaging.ts (enhance existing)
- backend/src/services/messagingService.ts (new)
- backend/src/socket/messageHandlers.ts (new)

Frontend:
- frontend/src/screens/MessagesScreen.tsx (new)
- frontend/src/screens/ChatScreen.tsx (new)
- frontend/src/components/MessageBubble.tsx (new)
- frontend/src/components/MessageInput.tsx (new)
- frontend/src/components/TypingIndicator.tsx (new)
```

**API Endpoints:**
```typescript
// Message Threads
GET    /api/v1/messages/threads              # Get all threads
GET    /api/v1/messages/threads/:id          # Get thread messages
POST   /api/v1/messages/threads              # Create thread
DELETE /api/v1/messages/threads/:id          # Delete thread

// Messages
POST   /api/v1/messages                      # Send message
DELETE /api/v1/messages/:id                  # Delete message
PUT    /api/v1/messages/:id/read             # Mark as read
GET    /api/v1/messages/unread/count         # Get unread count
```

**Socket.io Events:**
```typescript
// Client → Server
'message_send'            // Send message
'typing_start'            // Start typing
'typing_stop'             // Stop typing
'message_read'            // Mark message as read

// Server → Client
'message_received'        // New message
'message_delivered'       // Message delivered
'message_read'            // Message read
'typing_indicator'        // Someone is typing
'thread_updated'          // Thread metadata updated
```

---

### Story 4.4: Community Discovery (3 days)

**Goal:** Help players discover sessions and connect with community

**Backend Tasks:**
- [ ] Enhance session discovery API
- [ ] Add venue directory
- [ ] Add player search with filters
- [ ] Add community leaderboards

**Frontend Tasks:**
- [ ] Enhance SessionDiscoveryScreen
- [ ] Build VenueDirectoryScreen
- [ ] Build PlayerSearchScreen
- [ ] Build CommunityLeaderboardScreen

**Files to Create/Modify:**
```
Backend:
- backend/src/routes/discovery.ts (enhance)
- backend/src/routes/venues.ts (new)
- backend/src/services/communityService.ts (new)

Frontend:
- frontend/src/screens/SessionDiscoveryScreen.tsx (enhance)
- frontend/src/screens/VenueDirectoryScreen.tsx (new)
- frontend/src/screens/PlayerSearchScreen.tsx (new)
- frontend/src/screens/CommunityLeaderboardScreen.tsx (new)
```

**API Endpoints:**
```typescript
// Enhanced Discovery
GET /api/v1/discovery/sessions        # Enhanced with filters
GET /api/v1/discovery/players          # Search players
GET /api/v1/discovery/venues           # Venue directory

// Community Features
GET /api/v1/community/leaderboard      # Global leaderboard
GET /api/v1/community/trending         # Trending sessions
GET /api/v1/community/nearby           # Nearby players
```

---

### Story 4.5: OAuth Integration (2 days) - Optional

**Goal:** Enable social login for better user acquisition

**Backend Tasks:**
- [ ] Add WeChat OAuth integration
- [ ] Add Google OAuth integration
- [ ] Link OAuth accounts to User model

**Frontend Tasks:**
- [ ] Add WeChat login button
- [ ] Add Google Sign-In button
- [ ] Handle OAuth callback

**Files to Create:**
```
Backend:
- backend/src/services/oauth/wechatAuth.ts (new)
- backend/src/services/oauth/googleAuth.ts (new)
- backend/src/routes/oauth.ts (new)

Frontend:
- frontend/src/components/SocialLoginButtons.tsx (new)
```

---

## 🔄 Migration Strategy: MVP → Full Auth

### Challenge
We have two parallel systems:
- **MvpPlayer**: No authentication, identified by name + deviceId
- **User**: Full authentication with email/password

### Solution: Gradual Migration

#### Phase 1: Optional Authentication (Week 1-2)
```typescript
// Users can still join sessions without account
// But get prompted to create account for full features

if (hasUserAccount) {
  // Full features: friends, messaging, stats
  return <AuthenticatedSession />
} else {
  // Basic features: join session, play games
  return <MvpSession />
}
```

#### Phase 2: Account Linking (Week 2-3)
```typescript
// Link existing MvpPlayer to User account
POST /api/v1/users/link-player
{
  "deviceId": "device-123",
  "playerName": "John Doe",
  "email": "john@example.com",
  "password": "secure123"
}

// Backend merges MvpPlayer stats into User profile
```

#### Phase 3: Full Migration (Week 3-4)
```typescript
// Require authentication for new sessions
// Legacy sessions still work with MvpPlayer
// Prompt users to create accounts
```

### Database Migration Script
```typescript
// backend/src/scripts/migratePlayersToUsers.ts

async function migrateMvpPlayerToUser(
  mvpPlayerId: string,
  userEmail: string
): Promise<void> {
  // 1. Find MvpPlayer
  const mvpPlayer = await prisma.mvpPlayer.findUnique({
    where: { id: mvpPlayerId },
    include: { 
      player1Matches: true,
      player2Matches: true,
      rankingHistory: true 
    }
  });

  // 2. Create User account (if not exists)
  const user = await prisma.user.upsert({
    where: { email: userEmail },
    update: {},
    create: {
      name: mvpPlayer.name,
      email: userEmail,
      deviceId: mvpPlayer.deviceId
    }
  });

  // 3. Link MvpPlayer stats to User
  // (Keep MvpPlayer for historical sessions)
  await prisma.mvpPlayer.update({
    where: { id: mvpPlayerId },
    data: {
      // Add userId field if needed for linking
      metadata: {
        linkedUserId: user.id,
        migratedAt: new Date()
      }
    }
  });

  // 4. Copy statistics (optional)
  // Create PlayerAnalytics for User
}
```

---

## 📅 Implementation Timeline

### Week 1: Foundation (Story 4.1)
**Days 1-3: User Profile Management**
- Day 1: Backend user profile API + avatar upload
- Day 2: Frontend UserProfileScreen + EditProfileScreen
- Day 3: Settings screen + testing

**Deliverable:** Users can view/edit profiles with avatars

---

### Week 2: Social Core (Story 4.2)
**Days 4-7: Friend System**
- Day 4: Backend friend request API
- Day 5: Frontend FriendsListScreen + requests
- Day 6: Add friend search + Socket.io events
- Day 7: Block/unblock features + testing

**Deliverable:** Full friend management system

---

### Week 3: Communication (Story 4.3)
**Days 8-12: Messaging System**
- Day 8: Backend messaging API + threads
- Day 9: Socket.io real-time messaging
- Day 10: Frontend MessagesScreen (thread list)
- Day 11: ChatScreen with message bubbles
- Day 12: Read receipts + typing indicators + testing

**Deliverable:** Real-time messaging between players

---

### Week 4: Community & Polish (Story 4.4 + 4.5)
**Days 13-15: Community Discovery**
- Day 13: Enhanced discovery API + venue directory
- Day 14: Frontend discovery screens
- Day 15: Community leaderboards + player search

**Days 16-17: OAuth Integration (Optional)**
- Day 16: WeChat OAuth backend
- Day 17: Frontend OAuth buttons + flow

**Days 18-20: Testing & Documentation**
- Day 18: End-to-end testing
- Day 19: Bug fixes and performance optimization
- Day 20: Documentation + Epic 4 completion summary

**Deliverable:** Complete Epic 4 with social features

---

## 🧪 Testing Strategy

### Unit Tests
```bash
# Backend
npm test backend/src/services/userService.test.ts
npm test backend/src/services/friendService.test.ts
npm test backend/src/services/messagingService.test.ts

# Frontend
npm test frontend/src/screens/UserProfileScreen.test.tsx
npm test frontend/src/components/MessageBubble.test.tsx
```

### Integration Tests
```typescript
// Test friend request flow
describe('Friend System', () => {
  it('should send and accept friend request', async () => {
    // 1. User A sends request to User B
    const request = await sendFriendRequest(userA.id, userB.id);
    
    // 2. User B receives notification
    expect(socketEvents).toHaveEmitted('friend_request_received');
    
    // 3. User B accepts request
    await acceptFriendRequest(request.id);
    
    // 4. Both users are now friends
    const friends = await getFriends(userA.id);
    expect(friends).toContainEqual({ id: userB.id });
  });
});

// Test real-time messaging
describe('Messaging System', () => {
  it('should deliver message in real-time', async () => {
    // 1. User A sends message
    const message = await sendMessage(userA.id, userB.id, 'Hello!');
    
    // 2. User B receives via Socket.io
    expect(socketEvents).toHaveEmitted('message_received');
    
    // 3. User B reads message
    await markMessageAsRead(message.id);
    
    // 4. User A sees read receipt
    expect(socketEvents).toHaveEmitted('message_read');
  });
});
```

### Manual Testing Checklist
- [ ] User can register and login
- [ ] User can view and edit profile
- [ ] User can upload/change avatar
- [ ] User can send friend request
- [ ] User can accept/decline friend request
- [ ] User can view friend list
- [ ] User can remove friend
- [ ] User can block/unblock users
- [ ] User can send direct message
- [ ] Messages appear in real-time
- [ ] User can see typing indicators
- [ ] User can see read receipts
- [ ] User can discover public sessions
- [ ] User can search for players
- [ ] User can view community leaderboard
- [ ] WeChat OAuth login works (if implemented)
- [ ] All Socket.io events work correctly

---

## 📊 Success Metrics

### Epic 4 Completion Criteria

**User Adoption:**
- ✅ 50%+ of MvpPlayers create User accounts
- ✅ 70%+ of new users complete profile setup
- ✅ 80%+ upload profile avatar

**Social Engagement:**
- ✅ 40%+ of users add at least 3 friends
- ✅ 60%+ of users send at least 1 message
- ✅ 30%+ daily message activity

**Community Growth:**
- ✅ 50%+ of sessions are public (discoverable)
- ✅ 20%+ of users discover sessions via search
- ✅ 10%+ of users use venue directory

**Technical Performance:**
- ✅ <200ms API response times
- ✅ <1s message delivery (Socket.io)
- ✅ 99.5%+ uptime
- ✅ Zero critical security issues

---

## 🔧 Technical Stack

### Backend
- **Framework:** Express.js + TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Authentication:** JWT (access + refresh tokens)
- **Real-time:** Socket.io
- **File Storage:** AWS S3 or local storage
- **OAuth:** WeChat SDK, Google OAuth

### Frontend
- **Framework:** React Native + Expo
- **State Management:** Redux Toolkit
- **Navigation:** React Navigation
- **Real-time:** Socket.io client
- **Image Upload:** expo-image-picker
- **OAuth:** expo-auth-session

### DevOps
- **CI/CD:** GitHub Actions
- **Deployment:** Docker + Docker Compose
- **Monitoring:** Sentry for error tracking
- **Testing:** Jest + React Native Testing Library

---

## 🚀 Getting Started

### Step 1: Commit Current Work
```bash
git add .
git commit -m "feat: Complete Epic 3 - Production-ready deployment guides"
git push origin main
```

### Step 2: Create Epic 4 Branch
```bash
git checkout -b epic-4-social-features
```

### Step 3: Start with Story 4.1 (User Profiles)
```bash
# Create backend files
touch backend/src/routes/users.ts
touch backend/src/services/userService.ts
touch backend/src/utils/fileUpload.ts

# Create frontend files
mkdir -p frontend/BadmintonGroup/src/screens/profile
touch frontend/BadmintonGroup/src/screens/profile/UserProfileScreen.tsx
touch frontend/BadmintonGroup/src/screens/profile/EditProfileScreen.tsx
```

### Step 4: Implement Features Incrementally
Follow the week-by-week timeline above, testing each story before moving to the next.

---

## 📚 Resources

### Documentation
- [Prisma Docs](https://www.prisma.io/docs)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [JWT Best Practices](https://jwt.io/introduction)
- [WeChat OAuth Docs](https://developers.weixin.qq.com/doc/)

### Code Examples
- See `backend/src/routes/auth.ts` for authentication patterns
- See `backend/src/middleware/auth.ts` for auth middleware
- See `backend/src/config/socket.ts` for Socket.io setup

---

## 🎯 Next Steps

1. **Commit Epic 3 changes** (high priority)
2. **Review this plan** with team/stakeholders
3. **Start Story 4.1** (User Profile Management)
4. **Set up Socket.io** for real-time features
5. **Implement incrementally** and test thoroughly

---

**Ready to build Epic 4?** Let's start with Story 4.1! 🚀

**Questions or need clarification?** Check this plan or ask for details on any story.
