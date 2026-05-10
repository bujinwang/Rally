# Story 4.3: Messaging System - Implementation Plan

**Start Date:** January 29, 2025  
**Estimated Duration:** 5-7 days  
**Status:** 🚧 In Progress

---

## 📋 Overview

Build a complete real-time messaging system enabling direct messaging between friends and session-based group chat functionality.

---

## 🎯 Goals

### Primary Features
- ✅ Direct messaging between friends (1-on-1)
- ✅ Session group chat (multi-user)
- ✅ Real-time message delivery via Socket.io
- ✅ Message history and pagination
- ✅ Read receipts
- ✅ Typing indicators
- ✅ Online/offline presence
- ✅ Unread message counts

### Secondary Features
- ⏳ Message search
- ⏳ Image/file sharing (Story 4.4)
- ⏳ Message reactions (Story 4.4)
- ⏳ Push notifications integration

---

## 🗄️ Database Schema

### Existing Models (Already in schema.prisma)

**MessageThread:**
```prisma
model MessageThread {
  id            String   @id @default(cuid())
  participants  String[] // Array of player IDs
  title         String?
  lastMessageAt DateTime @default(now())
  isActive      Boolean  @default(true)
  messages      Message[]
}
```

**Message:**
```prisma
model Message {
  id          String      @id @default(cuid())
  threadId    String
  senderId    String
  content     String
  messageType MessageType @default(TEXT)
  sentAt      DateTime    @default(now())
  isRead      Boolean     @default(false)
  readAt      DateTime?
  thread      MessageThread
  sender      MvpPlayer
}
```

**MessageType enum:**
- TEXT
- IMAGE  
- SYSTEM
- CHALLENGE

**✅ No schema changes needed!**

---

## 🔧 Backend Implementation

### Phase 1: Messaging Service (Day 1)
**File:** `backend/src/services/messagingService.ts`

**Methods to Implement:**
1. `createThread(participants, title?)` - Create new message thread
2. `sendMessage(threadId, senderId, content, type)` - Send message
3. `getUserThreads(userId)` - Get user's threads with unread counts
4. `getThreadMessages(threadId, userId, limit, offset)` - Get paginated messages
5. `markMessagesAsRead(threadId, userId)` - Mark all as read
6. `getUnreadCount(userId)` - Total unread across all threads
7. `getThreadUnreadCount(threadId, userId)` - Unread for specific thread
8. `deleteMessage(messageId, userId)` - Delete message
9. `leaveThread(threadId, userId)` - Leave thread
10. `addParticipants(threadId, userId, newParticipants)` - Add to thread
11. `getThreadDetails(threadId, userId)` - Get thread info
12. `searchMessages(threadId, userId, query)` - Search messages

**Features:**
- Transaction support for atomic operations
- Authorization checks (can only access own threads)
- Pagination for message history
- Efficient unread counting
- Participant validation

### Phase 2: REST API Routes (Day 1)
**File:** `backend/src/routes/messaging.ts` (already scaffolded)

**Update to add JWT authentication:**
- Add `authenticateToken` middleware
- Replace mock `player-123` with `req.user?.id`
- Add proper error responses
- Add request validation

**Endpoints:**
```
POST   /api/v1/messaging/threads                    # Create thread
GET    /api/v1/messaging/threads                    # Get user threads
GET    /api/v1/messaging/threads/:id                # Get thread details
GET    /api/v1/messaging/threads/:id/messages       # Get messages (paginated)
POST   /api/v1/messaging/messages                   # Send message
POST   /api/v1/messaging/threads/:id/read           # Mark as read
GET    /api/v1/messaging/unread                     # Get total unread count
GET    /api/v1/messaging/threads/:id/unread         # Get thread unread count
DELETE /api/v1/messaging/messages/:id               # Delete message
POST   /api/v1/messaging/threads/:id/leave          # Leave thread
POST   /api/v1/messaging/threads/:id/participants   # Add participants
GET    /api/v1/messaging/threads/:id/search         # Search messages
```

### Phase 3: Socket.io Integration (Day 2)
**File:** `backend/src/config/socket.ts` (update existing)

**Socket Events to Add:**

**Client → Server:**
```typescript
'messaging:join-thread'         // Join thread room
'messaging:leave-thread'        // Leave thread room
'messaging:send-message'        // Send message (real-time)
'messaging:typing-start'        // User started typing
'messaging:typing-stop'         // User stopped typing
'messaging:mark-read'           // Mark messages as read
'presence:online'               // User online
'presence:offline'              // User offline
```

**Server → Client:**
```typescript
'messaging:new-message'         // New message received
'messaging:message-deleted'     // Message was deleted
'messaging:thread-updated'      // Thread info changed
'messaging:user-typing'         // Someone is typing
'messaging:user-stopped-typing' // Someone stopped typing
'messaging:message-read'        // Message marked as read
'presence:user-online'          // Friend came online
'presence:user-offline'         // Friend went offline
```

**Features:**
- Join thread-specific rooms
- Broadcast to thread participants
- Typing indicator debouncing
- Online presence tracking
- Real-time read receipts

---

## 📱 Frontend Implementation

### Phase 4: Messaging API Service (Day 3)
**File:** `frontend/src/services/messagingApi.ts` (new)

**API Client Methods:**
- `createThread(participants, title?)`
- `getUserThreads()`
- `getThreadMessages(threadId, limit, offset)`
- `sendMessage(threadId, content, type?)`
- `markAsRead(threadId)`
- `getUnreadCount()`
- `getThreadUnreadCount(threadId)`
- `deleteMessage(messageId)`
- `leaveThread(threadId)`
- `addParticipants(threadId, participants)`
- `getThreadDetails(threadId)`
- `searchMessages(threadId, query)`

**TypeScript Interfaces:**
```typescript
interface MessageThread {
  id: string;
  participants: string[];
  title?: string;
  lastMessageAt: string;
  isActive: boolean;
  unreadCount: number;
  lastMessage?: Message;
  participantsInfo: ParticipantInfo[];
}

interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM' | 'CHALLENGE';
  sentAt: string;
  isRead: boolean;
  readAt?: string;
}

interface ParticipantInfo {
  id: string;
  name: string;
  avatarUrl?: string;
  isOnline: boolean;
}
```

### Phase 5: Socket.io Hook (Day 3)
**File:** `frontend/src/hooks/useMessaging.ts` (new)

**Custom Hook:**
```typescript
useMessaging(threadId?: string)
```

**Features:**
- Connect/disconnect Socket.io
- Join/leave thread rooms
- Listen for new messages
- Send messages via Socket
- Typing indicator management
- Online presence tracking
- Automatic reconnection

**Returns:**
```typescript
{
  isConnected: boolean,
  sendMessage: (content: string) => void,
  startTyping: () => void,
  stopTyping: () => void,
  onlineUsers: string[],
  typingUsers: string[]
}
```

### Phase 6: Conversations List Screen (Day 4)
**File:** `frontend/src/screens/ConversationListScreen.tsx` (new)

**Features:**
- List all message threads
- Show last message preview
- Unread message count badges
- Avatar with online indicator
- Timestamp (relative: "2m ago", "Yesterday")
- Swipe to delete/archive
- Pull-to-refresh
- Search conversations
- Empty state
- Create new conversation button

**UI Components:**
- Thread list item with avatar
- Unread badge
- Online presence indicator
- Last message preview (truncated)
- Timestamp formatter

### Phase 7: Chat Screen (Day 5)
**File:** `frontend/src/screens/ChatScreen.tsx` (new)

**Features:**
- Display message history (paginated)
- Infinite scroll to load older messages
- Message bubbles (sent/received)
- Real-time message updates
- Typing indicator display
- Message timestamps
- Read receipts (checkmarks)
- Message input with send button
- Online/offline status in header
- User avatar in header
- Back navigation

**Message Types:**
- Text messages (bubbles)
- System messages (centered, gray)
- Date separators ("Today", "Yesterday", "Jan 28")

**UI Components:**
- MessageBubble component
- TypingIndicator component
- DateSeparator component
- MessageInput component
- ScrollToBottom button (when not at bottom)

### Phase 8: Session Chat Screen (Day 5)
**File:** `frontend/src/screens/SessionChatScreen.tsx` (new)

**Features:**
- Group chat for session participants
- Display all participants
- Real-time updates
- Message history
- Typing indicators (multiple users)
- System messages (player joined/left)
- Session info in header
- Member list view

**Differences from Direct Chat:**
- Show sender name on each message
- Multiple typing indicators
- Session-specific context
- Member count display

### Phase 9: Message Components (Day 6)
**Files:**
- `frontend/src/components/MessageBubble.tsx`
- `frontend/src/components/TypingIndicator.tsx`
- `frontend/src/components/ConversationCard.tsx`
- `frontend/src/components/MessageInput.tsx`

**MessageBubble:**
- Sent (right-aligned, blue)
- Received (left-aligned, gray)
- Timestamp
- Read receipt (double check)
- Avatar for received messages

**TypingIndicator:**
- Animated dots
- User name(s) typing
- "X is typing..."
- "X and Y are typing..."

**ConversationCard:**
- Avatar with online badge
- Name and last message
- Timestamp
- Unread badge
- Swipeable actions

**MessageInput:**
- Text input field
- Send button
- Character count (optional)
- Typing detection
- Auto-grow textarea

### Phase 10: Navigation Integration (Day 6)
**File:** `frontend/src/navigation/MainTabNavigator.tsx`

**New Tab Navigator:**
Create `MessagesStack` for messaging screens:
```typescript
MessagesStack.Navigator:
  - ConversationList (main screen)
  - Chat (direct message)
  - SessionChat (group chat)
```

**Or add to existing stacks:**
- Add to ProfileStack or create new Messages tab
- Deep linking support: `/messages/:threadId`

**Bottom Tab:**
- Messages tab with unread badge
- Icon: chat-bubble or mail

---

## 🧪 Testing Plan

### Backend Testing
- [ ] Create thread with 2+ participants
- [ ] Send messages via REST API
- [ ] Receive messages via Socket.io
- [ ] Mark messages as read
- [ ] Get unread counts
- [ ] Delete messages
- [ ] Leave threads
- [ ] Search messages
- [ ] Add participants to thread
- [ ] Test with unauthorized user

### Frontend Testing
- [ ] View conversation list
- [ ] Open conversation
- [ ] Send text message
- [ ] Receive real-time message
- [ ] Scroll to load older messages
- [ ] Typing indicator appears/disappears
- [ ] Online/offline status updates
- [ ] Mark as read on open
- [ ] Unread count updates
- [ ] Create new conversation from friends list
- [ ] Session chat with multiple users
- [ ] Search messages in thread

### Real-time Testing
- [ ] Multiple users typing simultaneously
- [ ] Message delivery with poor connection
- [ ] Reconnection after disconnect
- [ ] Read receipts update in real-time
- [ ] Online status changes
- [ ] New conversation notification

---

## 📊 Progress Tracking

```
Day 1: Backend Service & API Routes   ░░░░░░░░░░░░░░░░░░░░  0%
Day 2: Socket.io Integration          ░░░░░░░░░░░░░░░░░░░░  0%
Day 3: Frontend API & Socket Hook     ░░░░░░░░░░░░░░░░░░░░  0%
Day 4: Conversations List Screen      ░░░░░░░░░░░░░░░░░░░░  0%
Day 5: Chat Screens (Direct + Group)  ░░░░░░░░░░░░░░░░░░░░  0%
Day 6: Components & Navigation        ░░░░░░░░░░░░░░░░░░░░  0%
Day 7: Testing & Polish               ░░░░░░░░░░░░░░░░░░░░  0%

Overall Story 4.3 Progress:           ░░░░░░░░░░░░░░░░░░░░  0%
```

---

## 💡 Technical Decisions

### 1. Thread-based Architecture
Use MessageThread for both 1-on-1 and group chats:
- 1-on-1: 2 participants, no title
- Group: 2+ participants, optional title
- Session: Auto-created when session starts, title = session name

### 2. Real-time Strategy
- Socket.io for real-time delivery
- REST API for history and CRUD operations
- Optimistic UI updates (show message immediately, update on confirm)
- Fallback to polling if Socket.io fails

### 3. Message Storage
- Store all messages in database
- No message expiration (keep history)
- Soft delete for deleted messages (keep metadata)
- Index on threadId and sentAt for performance

### 4. Read Receipts
- Mark as read when thread is opened
- Bulk mark (all messages before timestamp)
- Show double checkmark only for 1-on-1 chats
- Group chats: show read count instead

### 5. Typing Indicators
- Debounce typing events (300ms)
- Auto-stop after 3 seconds of inactivity
- Show max 3 users typing in group chats

### 6. Online Presence
- Track via Socket.io connections
- Heartbeat every 30 seconds
- Offline after 45 seconds without heartbeat
- Show only for friends

### 7. Pagination
- Load 50 messages per request
- Infinite scroll for older messages
- Auto-scroll to bottom on new message (if already at bottom)
- "New messages" separator if scrolled up

---

## 🚀 API Usage Examples

### Create Direct Message Thread
```bash
curl -X POST http://localhost:3001/api/v1/messaging/threads \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"participants": ["user1-id", "user2-id"]}'
```

### Send Message
```bash
curl -X POST http://localhost:3001/api/v1/messaging/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"threadId": "thread-123", "content": "Hello!", "messageType": "TEXT"}'
```

### Get Thread Messages
```bash
curl "http://localhost:3001/api/v1/messaging/threads/thread-123/messages?limit=50&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### Mark as Read
```bash
curl -X POST http://localhost:3001/api/v1/messaging/threads/thread-123/read \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎯 Success Criteria

Story 4.3 is complete when:
- ✅ Users can send direct messages to friends
- ✅ Session participants can chat in group
- ✅ Messages are delivered in real-time
- ✅ Unread counts are accurate
- ✅ Typing indicators work
- ✅ Online/offline status is shown
- ✅ Message history loads with pagination
- ✅ Read receipts update correctly
- ✅ All tests pass
- ✅ UI is polished and responsive

---

## 📅 Timeline

**Day 1 (Today):** Backend service + API routes  
**Day 2:** Socket.io integration  
**Day 3:** Frontend API + Socket hook  
**Day 4:** Conversations list screen  
**Day 5:** Chat screens (direct + session)  
**Day 6:** Components + navigation  
**Day 7:** Testing + polish + commit  

**Target Completion:** February 5, 2025

---

**Ready to start implementation!** 🚀
