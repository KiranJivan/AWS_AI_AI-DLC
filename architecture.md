# TeamRetro — Architecture Design

> Generated: 2026-04-21 | Last Updated: 2026-04-21 (post-security hardening)

---

## Table of Contents

1. [System Components](#1-system-components)
2. [Data Flow](#2-data-flow)
3. [Authentication & Authorization](#3-authentication--authorization)
4. [Data Storage & Encryption](#4-data-storage--encryption)
5. [External Integrations & Dependencies](#5-external-integrations--dependencies)

---

## 1. System Components

TeamRetro is a Node.js/Express REST API written in TypeScript. It follows a layered architecture with clear separation between routing, middleware, business logic, and data access.

```
backend/src/
├── index.ts              # App entry point, middleware registration, route mounting
├── routes/
│   ├── auth.ts           # Registration, login, profile
│   ├── teams.ts          # Team CRUD, invite codes, membership
│   ├── boards.ts         # Retrospective board lifecycle
│   ├── cards.ts          # Card submission and voting
│   └── actionItems.ts    # Action item tracking
├── middleware/
│   ├── auth.ts           # JWT signing, verification, requireAuth guard
│   └── validate.ts       # Schema-based request body validation
├── db/
│   └── store.ts          # In-memory store with JSON file persistence
└── types/
    └── index.ts          # Shared TypeScript interfaces
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **`index.ts`** | Bootstraps Express, registers global middleware (helmet, CORS, JSON body parser, rate limiters), mounts route modules, handles 404 and global error responses, starts HTTP listener |
| **`routes/auth.ts`** | User registration with bcrypt hashing, login with credential verification, JWT issuance, and current-user profile retrieval via `requireAuth` |
| **`routes/teams.ts`** | Create teams, list teams for the authenticated user, retrieve team details with member info, join via invite code, regenerate invite codes (owner only) |
| **`routes/boards.ts`** | Create retrospective boards, list boards per team, retrieve a board with its cards and action items, advance board status (`open → voting → closed`) |
| **`routes/cards.ts`** | Submit cards to open boards, delete cards (author or team owner), toggle votes on cards during the voting phase |
| **`routes/actionItems.ts`** | Create action items on voting/closed boards, update text/completion/owner, delete items (team owner or item owner) |
| **`middleware/auth.ts`** | Signs JWTs (`signToken`), verifies JWTs (`verifyToken`), provides the `requireAuth` Express middleware that attaches the decoded payload to `req.user`. Fails fast at startup if `JWT_SECRET` is missing or under 32 characters |
| **`middleware/validate.ts`** | `validateBody(schema)` — a factory that returns an Express middleware enforcing required fields, type checks, and minimum length rules before the route handler runs |
| **`db/store.ts`** | Singleton `Store` class holding all application state in memory. Every mutating operation calls `persist()`, which serialises state to `data/db.json`. Provides typed CRUD methods for each entity |
| **`types/index.ts`** | Canonical TypeScript interfaces: `User`, `Team`, `TeamMember`, `RetroBoard`, `Card`, `ActionItem`, `AuthPayload`, `ApiError`, and the `BoardStatus` / `CardCategory` union types |

---

## 2. Data Flow

### Request Lifecycle

```
HTTP Client
    │
    ▼
helmet()                  — sets security headers (XSS, HSTS, content-type sniffing, etc.)
    │
    ▼
cors()                    — validates origin, restricts methods/headers
    │
    ▼
express.json({ limit })   — parses body, rejects payloads > 10 kb
    │
    ▼
rateLimit()               — per-IP request throttling (auth: 20/15min, api: 200/15min)
    │
    ▼
Route Handler
    ├─ validateBody()     ← rejects malformed input (400)
    ├─ requireAuth()      ← verifies JWT, attaches req.user (401 if missing/invalid)
    └─ Business Logic
           ├─ db.getX()   ← read from in-memory state
           ├─ db.saveX()  ← write to in-memory state + persist to disk
           └─ JSON response
```

### Key Domain Flows

**User Registration / Login**
```
POST /api/auth/register
  → validateBody (email, name, password)
  → check duplicate email → 409 if exists
  → bcrypt.hash(password, 12)
  → db.saveUser()
  → signToken({ userId, email })
  → 201 { token, user }

POST /api/auth/login
  → validateBody (email, password)
  → db.getUserByEmail()
  → bcrypt.compare(password, passwordHash)
  → signToken({ userId, email })
  → 200 { token, user }
```

**Team Collaboration**
```
POST /api/teams          → create team, creator becomes owner
POST /api/teams/join/:code → look up team by invite code, add as member
POST /api/teams/:id/regenerate-invite → owner only, new cryptographically random code
```

**Retrospective Lifecycle**
```
Board status: open → voting → closed

open:    cards can be submitted
voting:  votes can be cast; action items can be created
closed:  read-only; action items can still be managed
```

**Anonymous Submissions**
```
Board.anonymousSubmissions = true (default)
  → card.authorId stored as null on write
  → on read, other users' authorId masked to null
  → card author's own authorId returned as-is
```

---

## 3. Authentication & Authorization

### Authentication

| Aspect | Detail |
|--------|--------|
| **Mechanism** | JWT (JSON Web Token) via `jsonwebtoken` |
| **Token lifetime** | 7 days |
| **Transport** | `Authorization: Bearer <token>` header |
| **Secret** | `process.env.JWT_SECRET` — required, minimum 32 characters. Server refuses to start if unset or too short |
| **Password hashing** | `bcryptjs` with 12 salt rounds (one-way, salted, never stored in plaintext) |

The `requireAuth` middleware extracts the Bearer token, calls `verifyToken`, and attaches the decoded `{ userId, email }` payload to `req.user`. Any verification failure returns `401`. All protected routes — including `GET /auth/me` — use this middleware consistently via static imports.

### Authorization

Authorization is enforced at the route level in three layers:

**1. Team membership** — required for all board, card, and action item operations.
```
db.getTeam(teamId)
team.members.some(m => m.userId === req.user.userId)
→ 403 if not a member
```

**2. Role-based access** — `owner` vs `member`.

| Action | Required Role |
|--------|--------------|
| Regenerate invite code | `owner` |
| Delete any card | `owner` |
| Delete any action item | `owner` |
| All other operations | `member` (any team member) |

**3. Resource ownership** — users can always manage their own resources.

| Resource | Owner Can |
|----------|-----------|
| Card | Delete their own card (even as `member`) |
| Action item | Delete items where `ownerId === userId` |

### Board-Status Guards

| Operation | Allowed When |
|-----------|-------------|
| Submit a card | `status === 'open'` |
| Vote on a card | `status === 'voting'` |
| Create an action item | `status === 'voting'` or `'closed'` |

### Security Controls (post-hardening)

| Control | Implementation |
|---------|---------------|
| **Security headers** | `helmet()` — sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, and more |
| **Rate limiting — auth** | `express-rate-limit`: 20 requests / 15 min per IP on `/api/auth/*` |
| **Rate limiting — API** | `express-rate-limit`: 200 requests / 15 min per IP on all other routes |
| **Request body cap** | `express.json({ limit: '10kb' })` — rejects oversized payloads |
| **CORS restriction** | Explicit allowlist: methods `GET POST PATCH DELETE OPTIONS`, headers `Content-Type Authorization` |
| **JWT secret enforcement** | Startup throws if `JWT_SECRET` is absent or < 32 characters |
| **Invite code entropy** | `crypto.randomBytes(4)` — cryptographically random, replaces `Math.random()` |

---

## 4. Data Storage & Encryption

### Storage Architecture

The data layer is a single `Store` class (`db/store.ts`) that keeps all state in a plain JavaScript object in memory and synchronises it to disk on every write.

```
Runtime memory (DbState)
    ├─ users:       Record<id, User>
    ├─ teams:       Record<id, Team>
    ├─ boards:      Record<id, RetroBoard>
    ├─ cards:       Record<id, Card>
    └─ actionItems: Record<id, ActionItem>

Persistence: data/db.json  (written synchronously on every mutation)
```

On startup, `loadState()` reads `data/db.json` if it exists; otherwise initialises an empty state. The file is created automatically on first write.

> The store is explicitly designed as a swappable adapter. The comment in `store.ts` notes: *"Swap this interface for DynamoDB/Postgres adapters without changing business logic."*

### ID Generation

All entity IDs are generated with `uuid` v4 (cryptographically random UUIDs). Team invite codes are generated with `crypto.randomBytes(4).toString('hex')` — 8 hex characters, cryptographically random.

### Encryption & Hashing

| Data | Strategy |
|------|----------|
| Passwords | `bcryptjs` hash (12 rounds) — one-way, salted, never stored in plaintext |
| JWT tokens | HMAC-SHA256 signed with `JWT_SECRET` (min 32 chars) — tamper-proof but not encrypted |
| Data at rest | No encryption — `db.json` is stored as plaintext JSON |
| Data in transit | No TLS enforcement in application code — must be handled at the infrastructure layer (reverse proxy / load balancer) |

### Known Limitations

- Synchronous `fs.writeFileSync` on every mutation blocks the Node.js event loop under load.
- No transactions — a crash mid-write could leave the file in an inconsistent state.
- No encryption of the JSON file — sensitive data (email addresses, hashed passwords) is readable by anyone with filesystem access.
- Single-process only — does not scale horizontally without replacing the store adapter.

---

## 5. External Integrations & Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.18.2 | HTTP server and routing framework |
| `helmet` | ^7.1.0 | Security headers middleware |
| `express-rate-limit` | ^7.3.1 | Per-IP rate limiting |
| `jsonwebtoken` | ^9.0.2 | JWT signing and verification |
| `bcryptjs` | ^2.4.3 | Password hashing |
| `cors` | ^2.8.5 | Cross-Origin Resource Sharing middleware |
| `uuid` | ^9.0.1 | UUID v4 ID generation |

### Development Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Static typing, compiled to CommonJS |
| `ts-node-dev` | Development server with hot reload |
| `jest` + `ts-jest` | Test runner with TypeScript support |
| `supertest` | HTTP integration testing |

### External Services

None. The application has no external service dependencies at runtime:

- No external database (PostgreSQL, MongoDB, DynamoDB, etc.)
- No email or notification service
- No file/object storage (S3, etc.)
- No caching layer (Redis, Memcached)
- No message queue or event bus
- No third-party APIs (analytics, payments, etc.)

### Environment Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | **Yes** | JWT signing secret, minimum 32 characters. Server will not start without it. Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | `3001` | No | HTTP listener port |
| `FRONTEND_URL` | `http://localhost:5173` | No | Allowed CORS origin |

---

*End of document*
