# Runbook: Auth Failure Surge

## Alert
`RallyAuthFailureSurge` — auth errors > 10/min for 2 minutes.

## Impact
Users cannot log in or join sessions. Potential brute-force attack or token issuance bug.

## Diagnosis (5 min)

1. **Check logs:** Filter for `level:error` with `type:auth` in the last 10 minutes.
2. **Check correlation IDs:** Are failures clustered around a single endpoint (e.g. `/auth/refresh`)?
3. **Check rate limiting:** Are legitimate users being throttled?
4. **Check JWT expiry:** Did the access-token expiry window change?
5. **Check for attack patterns:** Many failures from the same IP? Same user agent?

## Resolution

- **Brute-force attack** → Block the source IP at the firewall/WAF. Check if `strictLimiter` is active.
- **Token rotation bug** → Check `refreshTokenService.ts` logs. If reuse-detection is firing falsely, investigate.
- **Clock skew** → Verify server time is synced (NTP). JWT `iat`/`exp` are sensitive to drift.
- **Client bug** → If a specific app version is failing, force-update or communicate workaround.

## Post-incident
- If attack, document IOCs and share with security team.
- If bug, add regression test for the auth flow.
