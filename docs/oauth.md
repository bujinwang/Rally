# OAuth & Authenticated Identity (Story 6.1)

This document covers the OAuth flow, the auth/identity endpoints, the two
distinct "claim" operations, and the identity data we store (AC 8, AC 20).

## 1. OAuth flow

Implemented in `backend/src/routes/oauth.ts` on top of
`backend/src/services/oauthService.ts`. Supported providers: **google** and
**wechat**. Endpoints are mounted at `/api/v1/oauth`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/oauth/:provider/url` | Returns the provider authorization URL. |
| `GET` | `/oauth/:provider/callback?code=...` | Web flow: exchanges the code, finds/creates the user, returns JWT tokens. |
| `POST` | `/oauth/:provider/mobile` | **Disabled (501).** The native flow trusted a body-supplied `providerId` and minted JWTs without verifying the provider credential — an authentication bypass. It had no reachable client and no provider SDK installed. Returns `501 NOT_IMPLEMENTED` until a server-side token-verification flow is implemented. |

Flow:

1. Client calls `GET /oauth/:provider/url` and opens the returned URL.
2. Provider redirects back to `/oauth/:provider/callback` with `?code=`.
3. `OAuthService.handleCallback` exchanges the code for a profile.
4. `OAuthService.findOrCreateOAuthUser` looks up an existing `SocialConnection`
   by `(provider, providerId)`; if none, it links by email or creates a new
   `User`, then creates the `SocialConnection`.
5. The service issues an access + refresh token pair via `JWTUtils.generateTokens`
   and persists the refresh token (hashed) through `refreshTokenService`.
6. The callback responds with `{ success, data: { user, tokens, isNewUser } }`.

Provider credentials come from environment variables (no hardcoded values):
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
`WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `WECHAT_REDIRECT_URI`, `API_BASE_URL`.

## 2. Auth endpoints

Mounted at `/api/v1/auth`.

| Method | Path | Auth | Rate limit | Notes |
|--------|------|------|-----------|-------|
| `POST` | `/auth/register` | none | `auth` tier | `{ name, email, phone?, password, deviceId? }` |
| `POST` | `/auth/login` | none | `auth` tier | `{ email, password, deviceId? }` |
| `POST` | `/auth/refresh` | refresh token in body | `auth` tier | Rotates the pair; reuse-detection revokes the family. |
| `POST` | `/auth/logout` | `requiredAuth` | `sensitive` tier | Optional `{ refreshToken }`; revokes one token or all of the caller's tokens. |
| `POST` | `/auth/claim` | `requiredAuth` | `sensitive` tier | `{ deviceId }` — links guest-created activity to the account. |

All responses use the shared envelope: success
`{ success: true, data, message?, timestamp }`, error
`{ success: false, error: { code, message, details? }, timestamp }`.
Auth failures use the existing codes `UNAUTHORIZED` (401), `FORBIDDEN` (403),
`VALIDATION_ERROR` (400), `CONFLICT` (409), `RATE_LIMIT_EXCEEDED` (429).

### Refresh-token security

- Refresh tokens are stored **hashed (SHA-256) only**; the raw token is never
  persisted or logged. Each token carries a `jti` claim.
- **Rotation:** refreshing marks the presented token revoked and issues a new
  token in the same rotation family (`familyId`).
- **Reuse-detection:** replaying a token revoked more than the 10-second grace
  window (`REUSE_GRACE_WINDOW_MS`) revokes the **entire family** and returns 401.
  The grace window tolerates a client retrying a lost refresh response.
- **Revocation:** logout with a token revokes that token; logout without a token
  revokes every active refresh token for the user.

## 3. Two different "claim" operations (do not confuse)

| Operation | Endpoint | Auth | What it claims |
|-----------|----------|------|----------------|
| **Device → account claim** | `POST /api/v1/auth/claim` | JWT (`requiredAuth`) | Guest-created `MvpSession`/`MvpPlayer` rows created on a `deviceId` are linked to the authenticated `userId`. Rows already owned by a **different** user are skipped (never stolen). |
| **Organizer-secret claim** | `POST /api/v1/mvp-sessions/claim` | none | Claims organizer control of an existing session using the organizer secret. No account involved. |

## 4. Identity resolution (MVP session flow)

- `optionalAuth` is applied to **mutating** MVP-session routes only. Reads and
  `POST /mvp-sessions/join/:shareCode` (guest share-link join) remain completely
  open and token-free.
- When both a JWT and a `deviceId` are present, the **JWT wins** (implemented in
  `resolveIdentity` in `backend/src/middleware/permissions.ts`). The device path
  is the fallback when no valid user identity exists.
- A present-but-invalid/expired token on an `optionalAuth` route returns `401`,
  which is what allows the client to refresh and retry once.

## 5. Identity data stored & retention (AC 20 / privacy)

- `User`: `name`, `email` (unique), `phone`, `passwordHash` (bcrypt, never
  plaintext), `deviceId`, `role`, profile fields. Unchanged by this story.
- `MvpSession.ownerUserId` (nullable) and `MvpPlayer.userId` (nullable): link a
  session/player row to an account. Both are additive and `NULL` for guests;
  `ON DELETE SET NULL` so deleting a user does not delete their sessions.
- `RefreshToken`: `userId`, `tokenHash` (SHA-256), `jti`, `familyId`,
  `expiresAt`, `revokedAt`, `replacedByJti`, optional `createdByIp`/`userAgent`,
  `createdAt`. Rows cascade-delete with the user and should be pruned once
  `expiresAt` has passed.
- No new sensitive fields are introduced beyond what `User` already stored.
- Auth failures return only the standard envelope — no stack traces or secrets.
