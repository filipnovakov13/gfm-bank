# GFM Bank — Bob Persistent Context (AGENTS.md)

This file is Bob's persistent context document for the GFM Bank project. Bob must read this at the
start of every session and apply all constraints listed here throughout every task.

---

## Project Overview

**GFM Bank Core Banking System** is a demo production-grade core banking API used in the IBM Bob
Workshop. It models real-world banking software with account management, fund transfers, role-based
access control, and back-office operations. The system is intentionally realistic: it includes
deliberate security weaknesses for the expert security audit lab.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API framework | FastAPI (Python 3.11+) |
| Database | SQLite via `sqlite3` stdlib module |
| Authentication | OAuth2 password flow — token is the username (demo simplification) |
| Password hashing | SHA-256 (demo) — production would use bcrypt/argon2 |
| Data validation | Pydantic v2 with `condecimal` for monetary fields |
| HTTP clients | `requests` library |
| Server | Uvicorn (ASGI) |
| Dependencies | See `code/requirements.txt` |

---

## Architecture Summary

The system consists of three components:

```
┌─────────────────────┐      HTTP/REST      ┌───────────────────────────┐
│  teller_client.py   │ ──────────────────► │                           │
│  (Teller CLI)       │                     │   demo_api.py             │
└─────────────────────┘                     │   (FastAPI backend)       │
                                            │                           │◄──── corebank.db
┌─────────────────────┐      HTTP/REST      │   Binds: 127.0.0.1:8000  │       (SQLite)
│ backoffice_client.py│ ──────────────────► │                           │
│ (Back-office CLI)   │                     └───────────────────────────┘
└─────────────────────┘
```

- **`demo_api.py`** — FastAPI backend. Handles all business logic: authentication, account
  queries, fund transfers, overdraft management, manual postings.
- **`teller_client.py`** — CLI for teller staff. Performs balance inquiries, transfers, and
  overdraft requests.
- **`backoffice_client.py`** — CLI for back-office staff. Performs customer lookup, overdraft
  limit updates, and fee reversals.
- **`code/seed_db.py`** — Initialises SQLite database with tables and sample data.

---

## Key Constraints — Bob Must Always Follow These

### Monetary Values
- **ALWAYS** use `Decimal` (Python `decimal.Decimal`) for all monetary calculations. Never use
  `float` for money — floats cannot represent currency values exactly and cause rounding errors in
  financial transactions.
- Round to 2 decimal places using `ROUND_HALF_UP` (`decimal.ROUND_HALF_UP`) for final amounts.
- Pydantic monetary fields must use `condecimal(gt=0, max_digits=14, decimal_places=2)`.
- The existing code has a bug: `float(body.amount_eur)` in `make_transfer` — never replicate
  this pattern.

### SQL Safety
- **ALWAYS** use parameterised queries (the `?` placeholder in sqlite3). Never interpolate
  variables into SQL strings using f-strings or `%` formatting.
- Example correct: `db.execute("SELECT * FROM users WHERE username = ?", (username,))`
- Example forbidden: `db.execute(f"SELECT * FROM users WHERE username = '{username}'")`

### Authentication and Authorisation
- **ALWAYS** call `_verify(token, db)` before executing any protected endpoint logic.
- **ALWAYS** call `_require_role(user, {"ROLE"})` before any role-restricted operation.
- Never trust client-supplied role claims — always read role from the database.
- JWT/token validation must happen before any database read that returns sensitive data.

### Network Binding
- **ALWAYS** bind to `127.0.0.1` in development. Never bind to `0.0.0.0` unless explicitly
  required for a containerised deployment and documented as intentional.

### Secrets and Credentials
- **NEVER** hardcode passwords, tokens, or secrets in source code.
- Credentials must be supplied via environment variables (`TELLER_USER`, `TELLER_PASS`,
  `BACKOFFICE_USER`, `BACKOFFICE_PASS`, `COREBANK_URL`).
- **NEVER** log plaintext passwords, tokens, or bearer credentials.

### Password Storage
- **NEVER** store passwords in plaintext.
- The demo uses SHA-256 — this is acknowledged as insecure for production. Any new production code
  must use `bcrypt` or `argon2-cffi` with a per-user salt.

### Logging
- **NEVER** include PII (names, IBANs, account IDs, balances) in log messages at INFO level or
  above unless masked.
- **NEVER** log raw exception messages that include SQL queries to external outputs.
- Sensitive details belong in DEBUG-level structured logs, access-controlled, never in stdout
  in production.

---

## File Structure

```
gfm-bank/
├── AGENTS.md                        ← This file (Bob's persistent context)
├── ARCHITECTURE.md                  ← Generated architecture documentation
├── start.sh                         ← Setup and launch script
├── .bob/
│   ├── rules/
│   │   └── fintech-banking.md       ← Always-active fintech coding rules
│   ├── rules-fintech-reviewer/
│   │   └── pci-dss-rules.md         ← Mode-scoped PCI-DSS rules (fintech-reviewer mode)
│   └── custom_modes.yaml            ← Custom Bob modes for this project
└── code/
    ├── demo_api.py                  ← FastAPI backend (main application)
    ├── seed_db.py                   ← Database initialiser and data seeder
    ├── teller_client.py             ← Teller CLI client
    ├── backoffice_client.py         ← Back-office CLI client
    └── requirements.txt             ← Python dependencies
```

---

## API Endpoint Summary

| Method | Path | Auth Required | Role | Description |
|---|---|---|---|---|
| `POST` | `/token` | No | — | Login; returns bearer token |
| `GET` | `/health` | No | — | Health check |
| `GET` | `/accounts` | Yes | TELLER, BACKOFFICE | List accounts (BACKOFFICE sees full data) |
| `GET` | `/customers` | Yes | BACKOFFICE only | List all customers |
| `GET` | `/transactions/{account_id}` | Yes | TELLER, BACKOFFICE | Get ledger for an account |
| `POST` | `/transfer` | Yes | TELLER, BACKOFFICE | Post a fund transfer (debit + credit legs) |
| `PATCH` | `/accounts/{account_id}/overdraft` | Yes | BACKOFFICE only | Set overdraft limit (0–10 000 EUR) |
| `POST` | `/transactions/{account_id}` | Yes | BACKOFFICE only | Manual posting (FEE_REVERSAL, MANUAL_ADJ) |

---

## Known Issues in Demo Code (Do Not Replicate)

| Location | Issue | Category |
|---|---|---|
| `demo_api.py:81` | SHA-256 password hashing | Weak cryptography |
| `demo_api.py:83` | Token is the username in plaintext | Insecure token design |
| `demo_api.py:134` | `float(body.amount_eur)` — Decimal cast to float | Monetary precision |
| `demo_api.py:145,149` | `float(body.amount_eur)` in INSERT | Monetary precision |
| `demo_api.py:164` | `limit_eur: float` parameter | Monetary precision |
| `demo_api.py:178` | `ManualTx.amount_eur: float` | Monetary precision |
| `teller_client.py:37` | Default password `teller123` hardcoded as fallback | Hardcoded credential |
| `backoffice_client.py:41` | Default password `backoffice123` hardcoded as fallback | Hardcoded credential |

These are intentional for the security audit lab (Part 3). Do not "fix" them unless the task
explicitly asks for remediation.
