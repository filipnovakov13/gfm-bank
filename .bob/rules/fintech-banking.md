# Fintech Banking Rules

Rules for production-grade fintech and banking code in the GFM Bank project. Bob must apply all
rules below when writing, reviewing, or modifying any code in this codebase.

---

## 1. Monetary Value Handling

**Rule 1.1 — Use Decimal, never float**
All monetary values must use Python `decimal.Decimal`. IEEE 754 floating-point arithmetic cannot
represent most currency values exactly and will produce silent rounding errors in financial
calculations.

```python
# Correct
from decimal import Decimal, ROUND_HALF_UP
amount = Decimal("123.45")

# Forbidden
amount = 123.45          # float — never for money
amount = float(dec_val)  # casting Decimal to float — never for money
```

**Rule 1.2 — Rounding**
Apply `ROUND_HALF_UP` to 2 decimal places for all final monetary amounts before storage or
display. Never rely on implicit rounding.

```python
amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

**Rule 1.3 — Pydantic monetary fields**
Declare all monetary Pydantic fields with `condecimal`:

```python
from pydantic import condecimal
amount_eur: condecimal(gt=0, max_digits=14, decimal_places=2)
```

**Rule 1.4 — Database storage**
Store monetary values as `TEXT` (for exact decimal representation) or `INTEGER` (as minor units,
e.g. cents). Never store as `REAL` (SQLite float). When reading back, always convert to `Decimal`
before arithmetic.

**Rule 1.5 — Amount limits**
Transfer amounts must be positive and must not exceed the system maximum of 1,000,000.00 EUR per
single transaction. Overdraft limits are capped at 10,000.00 EUR.

---

## 2. SQL Injection Prevention

**Rule 2.1 — Parameterised queries only**
All database queries must use the `?` placeholder. String interpolation or concatenation into SQL
is unconditionally forbidden.

```python
# Correct
db.execute("SELECT * FROM users WHERE username = ?", (username,))

# Forbidden
db.execute(f"SELECT * FROM users WHERE username = '{username}'")
db.execute("SELECT * FROM users WHERE username = '" + username + "'")
db.execute("SELECT * FROM users WHERE username = %s" % username)
```

**Rule 2.2 — No dynamic table or column names**
Do not construct table names, column names, or ORDER BY clauses from user input, even with
allowlisting. All structural SQL elements must be hardcoded.

**Rule 2.3 — Input validation before queries**
Validate and normalise inputs (UUIDs, IBANs, amounts) before they reach the database layer.
A query should never receive raw, unvalidated user input.

---

## 3. Authentication and Authorisation

**Rule 3.1 — Verify token on every protected endpoint**
Every endpoint that returns or modifies sensitive data must call the token verification function
before any other logic. There must be no code path that skips authentication.

**Rule 3.2 — Role enforcement**
Role checks must be performed by reading the role from the database, not by trusting a
client-supplied claim. Call `_require_role()` (or equivalent) immediately after token verification
for all role-restricted endpoints.

**Rule 3.3 — Fail closed**
When authorisation logic encounters an unexpected state, it must deny access (HTTP 401/403).
Never fail open (do not default to granting access on error).

**Rule 3.4 — Token lifetime**
In production, tokens must have an expiry. Tokens must be opaque or cryptographically signed
(JWT with HS256 minimum, RS256 preferred). The demo pattern of using a username as a token is
not acceptable in production.

**Rule 3.5 — Password hashing**
Passwords must be hashed with `bcrypt` (cost factor >= 12) or `argon2-cffi` (Argon2id variant).
SHA-256 is not acceptable for password storage — it is not a password hashing function. Never
store plaintext passwords.

---

## 4. Secrets Management

**Rule 4.1 — No hardcoded credentials**
Passwords, API keys, tokens, database connection strings, and secret keys must never appear in
source code or version-controlled configuration files.

**Rule 4.2 — Use environment variables**
Load all secrets from environment variables at startup. Document required variables in README
or `.env.example` (with placeholder values, never real secrets).

```python
# Correct
SECRET_KEY = os.environ["JWT_SECRET_KEY"]  # raises KeyError if missing — intentional

# Forbidden
SECRET_KEY = "my-secret-key"
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "my-secret-key")  # fallback hardcode forbidden
```

**Rule 4.3 — No secrets in logs or error responses**
Secret values must never appear in log output, exception messages, or HTTP error responses.

---

## 5. Logging Constraints

**Rule 5.1 — No PII in logs**
The following must never appear in log messages at any level in production:
- Full names
- National ID numbers
- Full IBANs (last 4 digits only for correlation)
- Account balances
- Passwords or password hashes
- Bearer tokens or session identifiers

**Rule 5.2 — No credentials in logs**
Never log authentication credentials, tokens, cookie values, or Authorization header contents.

**Rule 5.3 — Structured logging**
Use structured logging (key-value or JSON) so log fields are machine-parseable and PII fields
can be filtered or masked at the logging infrastructure level.

**Rule 5.4 — Audit log separation**
Security-relevant events (login attempts, failed auth, privilege escalation, manual postings)
must be written to a dedicated audit log, separate from application logs, with a higher retention
policy.

---

## 6. Error Handling

**Rule 6.1 — Generic client messages**
HTTP error responses must return generic messages that do not reveal internal state, stack traces,
database schema, or business logic details.

```python
# Correct
raise HTTPException(status_code=500, detail="Internal server error")

# Forbidden
raise HTTPException(status_code=500, detail=str(e))  # may leak SQL or stack trace
```

**Rule 6.2 — Full details to structured logs**
The full exception, stack trace, and context (correlation ID, endpoint, sanitised inputs) must be
logged server-side at ERROR level for every 5xx response.

**Rule 6.3 — No stack traces in responses**
FastAPI's default exception handler must be overridden to suppress stack traces in production.
Set `debug=False` on the FastAPI application in all non-development environments.

**Rule 6.4 — Distinguish client vs server errors**
4xx errors (bad input, auth failure, not found) may include a descriptive but non-sensitive
`detail` field. 5xx errors must always return the generic message only.

---

## 7. Input Validation

**Rule 7.1 — IBAN format validation**
IBANs submitted as inputs must be validated against the ISO 13616 format:
- 2-letter country code
- 2-digit check digits
- Up to 30 alphanumeric BBAN characters
- Total length per country specification
Use the `schwifty` or `stdnum` library for IBAN validation, or validate against a regex with
checksum verification. Never assume an IBAN is valid because it was returned by the API.

**Rule 7.2 — Amount validation**
Transfer amounts must be validated as:
- Greater than 0
- No more than 2 decimal places
- Not exceeding the per-transaction maximum (1,000,000.00 EUR)
- Representable as `Decimal` without precision loss

**Rule 7.3 — UUID validation**
`account_id` and `tx_id` path parameters must be valid UUID v4 format. Reject non-UUID values
with HTTP 400 before they reach the database.

**Rule 7.4 — Allowlist transaction types**
Manual posting `type` fields must be validated against a strict allowlist:
`{"FEE_REVERSAL", "MANUAL_ADJ"}`. Reject any other value immediately.

**Rule 7.5 — Booking timestamp validation**
`booking_ts` values submitted in manual postings must be valid ISO 8601 timestamps. Future dates
more than 1 minute ahead of server time must be rejected.

---

## 8. Audit Trail Requirements

**Rule 8.1 — Record all state-changing operations**
Every database write (INSERT, UPDATE) that affects accounts or transactions must produce an audit
log entry containing:
- Timestamp (UTC, ISO 8601)
- Operation type
- Actor (authenticated username)
- Actor role
- Resource identifier (account_id or tx_id)
- Before and after values (for UPDATE operations)
- Request correlation ID

**Rule 8.2 — Immutable audit records**
Audit log records must not be modifiable after creation. Use append-only storage or a separate
immutable audit table with no UPDATE/DELETE permissions granted to the application user.

**Rule 8.3 — Log authentication events**
All of the following must be audit-logged:
- Successful login (username, timestamp, source IP)
- Failed login attempt (username attempted, timestamp, source IP)
- Token use on a privileged endpoint (username, endpoint, timestamp)

**Rule 8.4 — Two-leg transfer atomicity**
Transfer operations must be atomic: both the debit and credit legs must succeed or both must be
rolled back. The audit record for a transfer must reference both `debit_tx_id` and `credit_tx_id`.

**Rule 8.5 — Retention**
Audit logs must be retained for a minimum of 7 years to satisfy PSD2 and PCI-DSS requirements.
Implement log rotation with archival, not deletion.
