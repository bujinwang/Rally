/**
 * apiUrls.ts — pure URL builders for the Rally API (Story 6.9, T14/F13).
 *
 * Every builder takes the canonical base from `config/api` (`API_BASE_URL`),
 * which ALREADY ends in `/api/v1`, and appends only the path *below* `/api/v1`.
 * Centralising the construction is what prevents the double-prefix bug
 * (`…/api/v1/api/v1/…`) that ad-hoc string building produced.
 *
 * Deliberately free of any React/Expo import so the builders can be unit-tested
 * directly — the frontend suite has no component-render harness
 * (`@testing-library/react-native` is not installed), so pure functions are the
 * only place a URL can be asserted with real teeth.
 */

/**
 * `POST {base}/notifications/register` — device push-token registration
 * (`backend/src/routes/notifications.ts`).
 *
 * The base already carries `/api/v1`, so this appends ONLY
 * `/notifications/register`.
 */
export function notificationRegisterUrl(baseUrl: string): string {
  return `${baseUrl}/notifications/register`;
}

/**
 * `GET {base}/session-suggestions/suggestions/:deviceId`.
 *
 * The router is mounted at `/session-suggestions`
 * (`backend/src/routes/index.ts:70`) and the handler is `/suggestions/:deviceId`
 * (`backend/src/routes/sessionSuggestions.ts:12`) — so the `suggestions`
 * segment is required. Omitting it (the previous bug) 404s.
 */
export function sessionSuggestionsUrl(baseUrl: string, deviceId: string): string {
  return `${baseUrl}/session-suggestions/suggestions/${deviceId}`;
}

/**
 * The socket.io connection URL: the API origin, i.e. `baseUrl` with the
 * `/api/v1` REST suffix stripped.
 *
 * socket.io-client interprets a path in the connection URL as a *namespace*, so
 * passing `API_BASE_URL` directly (`http://localhost:3001/api/v1`) would look
 * for a namespace named `/api/v1` — which the server does not register. The
 * server uses the DEFAULT `/` namespace and the DEFAULT `/socket.io` path:
 * `backend/src/server.ts:215` constructs the `SocketServer` with only a `cors`
 * option (no `path`, no namespace), and `backend/src/config/socket.ts:180`
 * listens via `io.on('connection', …)` on the default namespace.
 *
 * Returns `undefined` when the base is relative (the production web build's
 * `/api/v1`), so `io(undefined)` targets the current origin instead of a bogus
 * `http://` host.
 */
export function socketUrl(baseUrl: string): string | undefined {
  const origin = baseUrl.replace(/\/api\/v1\/?$/, '');
  return origin.length > 0 ? origin : undefined;
}
