# Organizer Claim Flow – Frontend Notes

## Context
The backend now generates an organizer secret whenever a session is created and exposes `POST /api/v1/mvp-sessions/claim` to let legacy organizers attach their device. The mobile client needs UI to support the reclaim journey.

## Required Updates
- Session join screen: add an "I'm the organizer" button that opens a modal/panel for secret entry.
- Modal fields: secret (required), optional player name when the device is new to the session.
- Submit action: call the new claim endpoint with stored device ID (`sessionApi.getDeviceId()`), then refresh `SessionContext`.
- Creation success screen: display the freshly generated secret with copy/share helpers and education about storing it securely.
- Settings: surface a future hook for regenerating or viewing the secret once the backend endpoint is ready.

## Error Handling
- Handle `INVALID_SECRET`, `PLAYER_NAME_REQUIRED`, and generic errors with user-friendly messages and retry guidance.
- Rate-limited failures should prompt the user to wait or contact support.

## Post-Success Behavior
- Update local session state so `usePermissions` reflects organizer role immediately.
- Trigger a toast/banner confirming organizer access and hint at unlocked controls.
