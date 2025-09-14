# Permission System Documentation

## Overview

The BadmintonGroup MVP application implements a comprehensive role-based permission system that controls user access to various features and actions within sessions. This system ensures that only authorized users can perform specific operations while maintaining a smooth user experience.

## Roles

### ORGANIZER
- **Description**: The session creator who has full administrative control
- **Permissions**:
  - Edit session details (name, location, time, etc.)
  - Add and remove players
  - Update any player's status
  - Terminate or reactivate sessions
  - Generate and modify pairings
  - Manage court settings
  - Access all organizer-only UI controls

### PLAYER
- **Description**: Regular participants in the badminton session
- **Permissions**:
  - Update their own status (ACTIVE/RESTING/LEFT)
  - View session information
  - Participate in games and matches
  - Access player-specific UI controls

## Permission Architecture

### Backend Components

#### 1. Permission Middleware (`backend/src/middleware/permissions.ts`)
- **Purpose**: Validates user permissions before executing protected routes
- **Functions**:
  - `requireOrganizer(action)`: Requires ORGANIZER role for specific actions
  - `requireOrganizerOrSelf(action)`: Allows ORGANIZER or the user themselves
  - `validatePermission(sessionId, deviceId, action)`: Core permission validation logic

#### 2. Protected Routes
The following routes are protected with permission middleware:

```typescript
// Session Management (Organizer Only)
PUT /:shareCode                    // requireOrganizer('edit_session')
PUT /terminate/:shareCode          // requireOrganizer('delete_session')
PUT /reactivate/:shareCode         // requireOrganizer('edit_session')
PUT /:shareCode/courts            // requireOrganizer('edit_session')

// Player Management (Organizer Only)
DELETE /:shareCode/players/:playerId  // requireOrganizer('remove_players')
POST /:shareCode/add-player          // requireOrganizer('add_players')

// Player Status Updates (Self or Organizer)
PUT /players/:playerId/status       // requireOrganizerOrSelf('update_player_status')
PUT /:shareCode/players/:playerId/status  // requireOrganizerOrSelf('update_player_status')
PUT /:shareCode/players/:playerId/rest    // requireOrganizerOrSelf('update_player_status')
```

### Frontend Components

#### 1. Session Context (`frontend/src/contexts/SessionContext.tsx`)
- **Purpose**: Manages session state and user role information
- **Key Features**:
  - Tracks current user and their role
  - Provides permission helper functions
  - Manages session data with role information

#### 2. Permission Hook (`frontend/src/hooks/usePermissions.ts`)
- **Purpose**: Provides easy access to permission checks in components
- **Functions**:
  - `isOrganizer`: Boolean check for organizer role
  - `canEditSession`: Check if user can edit session
  - `canManagePlayers`: Check if user can manage players
  - `checkPermission(action, targetPlayerId)`: Generic permission check
  - `getRoleDisplayText()`: Returns user-friendly role text

#### 3. Permission Guards (`frontend/src/components/PermissionGuard.tsx`)
- **Purpose**: Conditionally render UI elements based on permissions
- **Components**:
  - `PermissionGuard`: Generic permission-based rendering
  - `OrganizerOnly`: Renders only for organizers
  - `PlayerOnly`: Renders only for players
  - `CanEditSession`: Renders if user can edit session
  - `CanManagePlayers`: Renders if user can manage players
  - `CanUpdatePlayerStatus`: Renders if user can update specific player status

#### 4. Session Controls Component (`frontend/src/components/SessionControls.tsx`)
- **Purpose**: Example implementation showing permission-based UI
- **Features**:
  - Role indicator showing current user's role
  - Organizer-only controls section
  - Player management with permission checks
  - Session information display

## Usage Examples

### Backend Route Protection

```typescript
// Protect a route that requires organizer permissions
router.put('/:shareCode', requireOrganizer('edit_session'), async (req, res) => {
  // Only organizers can reach this code
  const { shareCode } = req.params;
  // ... implementation
});
```

### Frontend Permission Checks

```typescript
// Using the permission hook
const { isOrganizer, canEditSession, checkPermission } = usePermissions();

// Check specific permissions
if (canEditSession) {
  // Show edit button
}

// Generic permission check
if (checkPermission('add_players')) {
  // Show add player button
}
```

### Conditional UI Rendering

```typescript
// Using permission guards
<OrganizerOnly>
  <Button title="Edit Session" onPress={handleEditSession} />
</OrganizerOnly>

<CanManagePlayers>
  <PlayerManagementComponent />
</CanManagePlayers>

<CanUpdatePlayerStatus playerId={player.id}>
  <Button title="Update Status" onPress={() => updatePlayerStatus(player.id)} />
</CanUpdatePlayerStatus>
```

## Permission Actions

The system defines the following permission actions:

- `edit_session`: Edit session details
- `delete_session`: Terminate session
- `add_players`: Add new players
- `remove_players`: Remove existing players
- `update_player_status`: Update player status
- `generate_pairings`: Generate player pairings
- `modify_pairings`: Modify existing pairings
- `terminate_session`: Terminate session
- `reactivate_session`: Reactivate terminated session

## Real-time Communication

The Socket.IO communication has been updated to include role information:

```typescript
// Socket events now include role data
io.to(`session-${shareCode}`).emit('mvp-session-updated', {
  session: {
    // ... session data
    players: [
      {
        id: player.id,
        name: player.name,
        role: player.role,  // Role information included
        status: player.status,
        // ... other player data
      }
    ]
  }
});
```

## Security Considerations

1. **Backend Validation**: All permission checks are performed on the backend
2. **Frontend Guards**: UI elements are hidden but backend still validates
3. **Role Persistence**: Roles are stored in the database and validated on each request
4. **Device Tracking**: Permissions are tied to device IDs for session integrity

## Testing

The permission system includes comprehensive tests:

- Unit tests for permission hooks
- Integration tests for middleware
- UI tests for permission guards
- End-to-end tests for role-based functionality

## Future Enhancements

Potential improvements to the permission system:

1. **Granular Permissions**: More fine-grained permission controls
2. **Role Hierarchies**: Support for different organizer levels
3. **Temporary Permissions**: Time-limited permission grants
4. **Audit Logging**: Track permission usage for security
5. **Permission Groups**: Group-based permissions for larger sessions

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Check if user has correct role
   - Verify device ID matches session owner
   - Ensure session is in correct state

2. **UI Not Updating**
   - Check if SessionContext is properly initialized
   - Verify role information is included in API responses
   - Ensure permission hooks are used correctly

3. **Socket Events Missing Role Data**
   - Verify Socket.IO handlers include role in player selects
   - Check database schema includes role field
   - Ensure Prisma client is regenerated after schema changes

### Debug Information

Enable debug logging to troubleshoot permission issues:

```typescript
// In permission middleware
console.log('Permission check:', {
  userRole: player.role,
  requiredRole,
  action,
  hasPermission: player.role === requiredRole
});