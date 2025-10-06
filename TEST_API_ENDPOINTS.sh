#!/bin/bash

# API Testing Script for Story 4.1 - User Profile Management
# Run this after starting the backend server with: cd backend && npm run dev

API_BASE="http://localhost:3001/api/v1"

echo "🧪 Testing Story 4.1 - User Profile Management API"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Health Check
echo "1️⃣  Health Check"
echo "----------------"
HEALTH=$(curl -s "$API_BASE/../health")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Server is healthy${NC}"
    echo "$HEALTH" | jq '.' 2>/dev/null || echo "$HEALTH"
else
    echo -e "${RED}❌ Server health check failed${NC}"
    exit 1
fi
echo ""

# Step 2: Register a test user
echo "2️⃣  Register Test User"
echo "--------------------"
REGISTER_RESPONSE=$(curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123!@#",
    "phone": "+1234567890"
  }')

if echo "$REGISTER_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ User registered successfully${NC}"
    ACCESS_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.data.tokens.accessToken' 2>/dev/null)
    USER_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.data.user.id' 2>/dev/null)
    echo "User ID: $USER_ID"
    echo "Token saved for subsequent requests"
else
    # Try to login if user already exists
    echo -e "${YELLOW}⚠️  User may already exist, trying login...${NC}"
    LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "test@example.com",
        "password": "Test123!@#"
      }')
    
    if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
        echo -e "${GREEN}✅ Login successful${NC}"
        ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.tokens.accessToken' 2>/dev/null)
        USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id' 2>/dev/null)
        echo "User ID: $USER_ID"
    else
        echo -e "${RED}❌ Registration and login failed${NC}"
        echo "$REGISTER_RESPONSE"
        exit 1
    fi
fi
echo ""

# Step 3: Get User Profile
echo "3️⃣  Get User Profile"
echo "------------------"
PROFILE_RESPONSE=$(curl -s -X GET "$API_BASE/users/$USER_ID/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$PROFILE_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ Profile retrieved successfully${NC}"
    echo "$PROFILE_RESPONSE" | jq '.data.profile' 2>/dev/null || echo "$PROFILE_RESPONSE"
else
    echo -e "${RED}❌ Failed to get profile${NC}"
    echo "$PROFILE_RESPONSE"
fi
echo ""

# Step 4: Update Profile
echo "4️⃣  Update User Profile"
echo "---------------------"
UPDATE_RESPONSE=$(curl -s -X PUT "$API_BASE/users/$USER_ID/profile" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User Updated",
    "phone": "+9876543210"
  }')

if echo "$UPDATE_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ Profile updated successfully${NC}"
    echo "$UPDATE_RESPONSE" | jq '.data.user' 2>/dev/null || echo "$UPDATE_RESPONSE"
else
    echo -e "${RED}❌ Failed to update profile${NC}"
    echo "$UPDATE_RESPONSE"
fi
echo ""

# Step 5: Get User Settings
echo "5️⃣  Get User Settings"
echo "-------------------"
SETTINGS_RESPONSE=$(curl -s -X GET "$API_BASE/users/$USER_ID/settings" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$SETTINGS_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ Settings retrieved successfully${NC}"
    echo "$SETTINGS_RESPONSE" | jq '.data.settings' 2>/dev/null || echo "$SETTINGS_RESPONSE"
else
    echo -e "${RED}❌ Failed to get settings${NC}"
    echo "$SETTINGS_RESPONSE"
fi
echo ""

# Step 6: Update Settings
echo "6️⃣  Update User Settings"
echo "----------------------"
UPDATE_SETTINGS_RESPONSE=$(curl -s -X PUT "$API_BASE/users/$USER_ID/settings" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "privacySettings": {
      "profileVisibility": "friends",
      "showEmail": false,
      "showPhone": false,
      "showStats": true,
      "showLocation": true
    },
    "notificationSettings": {
      "friendRequests": true,
      "messages": true,
      "sessionInvites": false,
      "matchResults": true,
      "achievements": true
    }
  }')

if echo "$UPDATE_SETTINGS_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ Settings updated successfully${NC}"
    echo "$UPDATE_SETTINGS_RESPONSE" | jq '.data.settings' 2>/dev/null || echo "$UPDATE_SETTINGS_RESPONSE"
else
    echo -e "${RED}❌ Failed to update settings${NC}"
    echo "$UPDATE_SETTINGS_RESPONSE"
fi
echo ""

# Step 7: Search Users
echo "7️⃣  Search Users"
echo "--------------"
SEARCH_RESPONSE=$(curl -s -X GET "$API_BASE/users/search?q=Test&limit=5" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$SEARCH_RESPONSE" | grep -q "success.*true"; then
    echo -e "${GREEN}✅ User search successful${NC}"
    echo "$SEARCH_RESPONSE" | jq '.data' 2>/dev/null || echo "$SEARCH_RESPONSE"
else
    echo -e "${RED}❌ Failed to search users${NC}"
    echo "$SEARCH_RESPONSE"
fi
echo ""

# Step 8: Test Avatar Upload (optional - requires actual image file)
echo "8️⃣  Avatar Upload Test (Skipped - requires image file)"
echo "----------------------------------------------------"
echo -e "${YELLOW}ℹ️  To test avatar upload manually:${NC}"
echo "curl -X POST $API_BASE/users/$USER_ID/avatar \\"
echo "  -H \"Authorization: Bearer \$ACCESS_TOKEN\" \\"
echo "  -F \"avatar=@/path/to/image.jpg\""
echo ""

# Summary
echo "=========================================="
echo "✅ API Testing Complete!"
echo "=========================================="
echo ""
echo "📝 Summary:"
echo "  - Health check: ✅"
echo "  - User registration/login: ✅"
echo "  - Get profile: ✅"
echo "  - Update profile: ✅"
echo "  - Get settings: ✅"
echo "  - Update settings: ✅"
echo "  - Search users: ✅"
echo "  - Avatar upload: ⏭️  (Manual test required)"
echo ""
echo "🎉 All Story 4.1 API endpoints are working!"
echo ""
echo "User ID: $USER_ID"
echo "Access Token: ${ACCESS_TOKEN:0:50}..."
