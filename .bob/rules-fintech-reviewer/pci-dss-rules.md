# PCI-DSS Compliance Rules — GFM Bank (fintech-reviewer mode)

These rules apply when operating in **fintech-reviewer** mode. Each rule maps to a specific
PCI-DSS v4.0 requirement. Use these when auditing the GFM Bank codebase for payment card industry
compliance.

> **Note:** The GFM Bank demo does not process card payments directly, but it handles financial
> account data and credentials that are subject to equivalent standards under PSD2 and internal
> banking policy. These rules are applied as if PCI-DSS scope applies.

---

## 1. PAN and Cardholder Data Handling

**PCI-DSS Requirement 3.3 — Sensitive authentication data must not be stored after authorisation**

Sensitive authentication data (full track data, CVV, PINs) must never be persisted. In the GFM
Bank context, this extends to: bearer tokens, password hashes in application logs, and full
account credentials in any storage medium beyond the `users` table.

Review for:
- Any log statement that writes `hashed_password`, token values, or raw credentials
- Any response body that returns password or token fields
- Any debugging code that dumps full database rows containing sensitive columns

**PCI-DSS Requirement 3.4 — PAN must be rendered unreadable anywhere it is stored**

In the GFM Bank context, treat full IBANs as equivalent to PANs. Full IBANs must be masked
in all log output (show only last 4 characters). Display in API responses is permitted only
for authenticated sessions and must not appear in error messages.

Review for:
- Any exception handler or error log that includes a raw IBAN value
- Any audit log entry that writes an unmasked IBAN at INFO level or higher

---

## 2. Password Storage Requirements

**PCI-DSS Requirement 8.3.1 — Passwords/passphrases must meet minimum complexity and must be
stored using strong one-way hashing with salt**

Current status in demo: `hashlib.sha256` without salt — this is a **Critical** finding.
SHA-256 is not a password hashing function. It is not adaptive, has no salt, and is vulnerable
to rainbow table and GPU-accelerated brute-force attacks.

Review for:
- Any use of `hashlib.md5`, `hashlib.sha1`, `hashlib.sha256` for password hashing
- Any absence of per-user salt generation
- Any password comparison that uses `==` on plaintext or weak hash
- Recommended standard: `bcrypt` (cost >= 12), `argon2-cffi` (Argon2id), or `passlib`

**PCI-DSS Requirement 8.3.6 — Minimum password length of 12 characters for user-generated passwords**

Review for:
- Any password creation or change endpoint that lacks minimum-length enforcement
- Any seeded or default credentials shorter than 12 characters

**PCI-DSS Requirement 8.2.2 — Vendor/default credentials must not be used**

Current status in demo: `teller123` and `backoffice123` are hardcoded defaults — this is a
**Critical** finding.

Review for:
- Any `os.getenv("...", "default_password")` pattern providing a credential fallback
- Any hardcoded username/password pair in source code

---

## 3. Audit Logging Requirements

**PCI-DSS Requirement 10.2.1 — Implement audit logs to capture all individual user access to
cardholder data**

Review for:
- All endpoints that return account, transaction, or customer data must produce an audit log entry
- Each audit entry must include: timestamp, user ID, action, resource accessed
- Absence of any audit logging mechanism is a **High** finding

**PCI-DSS Requirement 10.2.1.1 — Log all access to audit trails**

The audit log itself must be access-controlled. Any endpoint or function that reads audit records
must also be logged.

**PCI-DSS Requirement 10.2.1.2 — Log all actions taken by individuals with root or administrative
privileges**

In GFM Bank context: all BACKOFFICE role operations (customer list, overdraft changes, manual
postings) must be individually logged with actor identity and full parameter values.

Review for:
- `/customers` endpoint — is the accessing user logged?
- `PATCH /accounts/{account_id}/overdraft` — are old and new limits logged?
- `POST /transactions/{account_id}` manual postings — is the full posting logged with actor?

**PCI-DSS Requirement 10.3.2 — Audit log files must be protected from destruction and
unauthorised modifications**

Review for:
- Any mechanism that could allow application code to DELETE or UPDATE audit records
- Absence of log integrity protection (WORM storage, cryptographic hash chaining)

**PCI-DSS Requirement 10.5.1 — Retain audit logs for at least 12 months (3 months immediately
available)**

Review for:
- Absence of any log retention policy or archival mechanism

---

## 4. Encryption in Transit

**PCI-DSS Requirement 4.2.1 — Strong cryptography must be used to safeguard PAN/sensitive data
during transmission over open, public networks**

Current status in demo: API runs on plain HTTP (`http://127.0.0.1:8000`) — this is acceptable
only for local loopback development. Any deployment on a non-loopback interface without TLS is
a **Critical** finding.

Review for:
- Any `BASE_URL` environment variable resolution that defaults to or accepts `http://` on a
  non-loopback address
- Any CORS `allow_origins` entry that permits non-HTTPS origins in a production configuration
- Absence of TLS termination documentation for production deployments

**PCI-DSS Requirement 4.2.1.1 — All keys and certificates are managed and protected**

Review for:
- Any TLS private key material stored in source control or application configuration files
- Any certificate pinning bypass or disabled certificate verification (`verify=False` in
  `requests` calls)

---

## 5. Access Control Requirements

**PCI-DSS Requirement 7.2.1 — All access to system components and cardholder data is assigned to
the least privilege needed**

Review for:
- The `GET /accounts` endpoint returns overdraft limits and balances to TELLER role — assess
  whether this exceeds minimum necessary access
- The `_verify()` function grants access to any valid token without role filtering on some
  endpoints — flag endpoints where the role is not checked
- Absence of account-level ownership checks: any authenticated TELLER can read any account's
  transactions — this is a **High** finding (Broken Object Level Authorisation, OWASP API1)

**PCI-DSS Requirement 7.3.1 — Access control system(s) are in place that restrict access based
on a user's need to know**

Review for:
- `GET /customers` — correctly restricted to BACKOFFICE, confirm this is enforced
- `PATCH /accounts/{account_id}/overdraft` — confirm BACKOFFICE role check is present
- Any endpoint where `_require_role()` is absent but should be present

**PCI-DSS Requirement 8.6.1 — Use of application/system accounts is managed and authenticated**

Review for:
- Service account credentials (CLI clients use `TELLER_USER`/`BACKOFFICE_USER`) — confirm they
  are not shared with human user accounts
- Absence of service account credential rotation mechanism

---

## 6. Vulnerability Management

**PCI-DSS Requirement 6.3.1 — Security vulnerabilities are identified and managed**

Review for all OWASP Top 10 categories relevant to this API:

| OWASP Category | GFM Bank Review Focus |
|---|---|
| A01 Broken Access Control | Per-account ownership not enforced on transaction endpoints |
| A02 Cryptographic Failures | SHA-256 password hashing; HTTP-only deployment |
| A03 Injection | All SQL queries — confirm parameterised throughout |
| A04 Insecure Design | Token = username — no expiry, no signing |
| A05 Security Misconfiguration | CORS origins; debug mode; error detail exposure |
| A07 Identification & Auth Failures | Weak hashing; no MFA; hardcoded credentials |
| A09 Security Logging Failures | Absence of structured audit logging |

**PCI-DSS Requirement 6.4.1 — Public-facing web applications are protected against attacks**

Review for:
- Rate limiting on `/token` endpoint — absence is a **Medium** finding (brute-force risk)
- No CSRF protection documented (mitigated by Bearer token auth, but confirm)
- No request size limits — absence is a **Low** finding

**PCI-DSS Requirement 6.3.3 — All system components are protected from known vulnerabilities**

Review for:
- `requirements.txt` dependency versions — check for known CVEs in pinned versions
- `fastapi==0.128.8`, `uvicorn[standard]==0.39.0`, `pydantic==2.13.5`, `requests==2.32.5` —
  flag any version with a published CVE

---

## Severity Rating Reference

| Rating | Definition |
|---|---|
| **Critical** | Exploitable without authentication; direct data breach or financial loss possible |
| **High** | Exploitable with low-privilege authentication; significant data exposure or integrity risk |
| **Medium** | Requires specific conditions; indirect security impact |
| **Low** | Defence-in-depth weakness; limited direct impact |
| **Informational** | Best practice deviation; no direct exploitability |
