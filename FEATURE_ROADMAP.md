# 🎯 Feature Roadmap — Rally

**Status:** Production-ready  
**Backend TypeScript:** ✅ zero errors  
**All 15 features:** ✅ complete

---

## ✅ Completed Features (15/15)

### Tier 1: Quick Wins

| # | Feature | Status |
|---|---------|--------|
| 1 | Match History View | ✅ |
| 2 | Player Search & Filter | ✅ |
| 3 | Session Settings Screen | ✅ |
| 4 | Player Notifications (Expo push + Socket.io) | ✅ |
| 5 | Score Editing/Deletion (audit log + stat rollback) | ✅ |

### Tier 2: High Value

| # | Feature | Status |
|---|---------|--------|
| 6 | Enhanced Pairing Options (fair/random/skill/rotation + AI) | ✅ — persisted in DB |
| 7 | Session Templates (CRUD) | ✅ |
| 9 | Player Check-in System | ✅ |
| 10 | WhatsApp/WeChat Share (QR code + rich preview) | ✅ |

### Tier 3: Nice to Have

| # | Feature | Status |
|---|---------|--------|
| 8 | Real-Time Game Timer (`GameTimer.tsx`) | ✅ |
| 11 | Achievement System | ✅ |
| 12 | Historical Trends & Charts (5-tab dashboard) | ✅ |
| 13 | Advanced Statistics (15+ metrics, CSV export) | ✅ |
| 14 | Session Recap & Summary (MVP + highlights + share) | ✅ |
| 15 | Multi-Language Support (en/zh) | ✅ |

---

## 🔧 Infrastructure & Production Hardening

| Component | Status |
|-----------|--------|
| **Scheduler** (in-process, 4 jobs) | ✅ |
| ↳ Session reminders (1h before, push notify) | ✅ |
| ↳ Rest auto-expiration (RESTING → ACTIVE) | ✅ |
| ↳ Match reminders (15min before, push notify) | ✅ |
| ↳ Session auto-completion (stale → COMPLETED) | ✅ |
| **Pairings persistence** (stored in DB, not regenerated) | ✅ |
| **Owner security** (removed `setIsOwner(true)` bypass) | ✅ |
| **Regular group multi-day detection** (Mon+Fri → 2 cards) | ✅ |
| **Organizer name persistence** (AsyncStorage, one-click creation) | ✅ |
| **Tournament seeding** (by win rate, not by ID sort) | ✅ |
| **OAuth email** (no more `@placeholder.local`) | ✅ |

---

## ⚠️ Tracked Debt

37 frontend files have `// @ts-nocheck` — TypeScript type checking is disabled.  
`SessionShareModal.tsx` JSX nesting and `LiveGameScreen.tsx` broken import were fixed in this session; remaining files need systematic cleanup (est. 4-6 hours).

---

## 📊 Progress Summary

```
Features:              ████████████████████ 15/15  ✅
Infrastructure:        ████████████████████ 10/10 ✅
Backend compile:       ✅ zero errors
Frontend @ts-nocheck:  ████████░░░░░░░░░░░░ 2/37 fixed
```
