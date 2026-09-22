# Night City DeckLab Deployment Operations

**Documentation version: 0.2 — Local AI and Cardmarket daily pricing**

This document describes a baseline production operations model for Night City DeckLab. It focuses on backup and restore, monitoring and alerting, rate limiting, security operations, and privacy-aware incident response.

> **Deployment-specific requirement:** Replace bracketed values with the actual hosting provider, regions, owners, service-level objectives, retention periods, and escalation contacts. The application’s in-process controls are useful for a single instance but are not sufficient as the only production control for a multi-instance deployment.

## 1. Production architecture

The service consists of a browser client, an Express and tRPC application server, a MySQL-compatible database, object storage for scan images, Manus OAuth, and configurable provider services for AI recommendations and Cardmarket daily pricing. AI can run on the same host through Ollama or LM Studio; the hosted AI path remains available as a fallback. Cardmarket integration reads an authorized daily CSV/TSV price guide and does not provide real-time marketplace listings.

```text
Browser
  │ HTTPS
  ▼
TLS edge / reverse proxy / WAF
  │
  ├── Static frontend assets
  └── Express + tRPC application instances
        │
        ├── MySQL or TiDB database
        ├── Manus OAuth
        ├── Manus object storage
        ├── Ollama or LM Studio (local, optional)
        ├── Manus built-in AI service (fallback, optional)
        ├── Cardmarket daily price-guide URL
        └── Shared rate-limit and observability services
```

The edge should terminate HTTPS, enforce a request-size limit, provide DDoS and bot protections where available, and forward only the headers required by the application. The application should run with least-privilege credentials and without direct public access to the database.

## 2. Environment and secret management

Store secrets in the deployment platform’s secret manager. Do not commit `.env` files, print secrets in build logs, or expose server credentials through `VITE_` variables.

Required server-side configuration normally includes:

- `DATABASE_URL`
- `JWT_SECRET`
- `OAUTH_SERVER_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`
- `LOCAL_AI_PROVIDER`, `LOCAL_AI_BASE_URL`, and `LOCAL_AI_MODEL` when local AI is enabled
- `LOCAL_AI_API_KEY` when the local provider requires a key
- `CARDMARKET_PRICE_GUIDE_URL` when Cardmarket pricing is enabled
- `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` when hosted AI fallback is enabled

`VITE_FRONTEND_FORGE_API_URL` and `VITE_FRONTEND_FORGE_API_KEY` may be bundled into the browser when the platform integration explicitly supports client use. Treat any `VITE_` value as public. Never place database credentials, private OAuth credentials, JWT secrets, storage credentials, Cardmarket credentials, local AI keys, or server API keys in those variables.

### Provider connectivity requirements

The Node.js server makes provider requests. For a local provider, `LOCAL_AI_BASE_URL` must resolve from the server host; `127.0.0.1` points to the server itself, not the end user’s browser or laptop. On a hosted deployment, use a private network route or keep the hosted fallback enabled rather than exposing Ollama or LM Studio directly to the internet.

The Cardmarket guide URL must be stable, authorized, and reachable from the server. Treat the file as untrusted input, monitor download failures, and do not log the raw file or provider response. Because the guide is updated daily, define an acceptable staleness threshold and alert when the last successful import exceeds it.

### Secret procedures

1. Generate secrets with a cryptographically secure secret manager.
2. Assign each environment its own credentials.
3. Grant only the permissions required by the application.
4. Rotate secrets at a documented interval and immediately after suspected exposure.
5. Record the rotation owner and recovery procedure without storing secret values in tickets or source control.
6. Verify that old credentials are revoked after a successful rotation.

## 3. Database backups

The database contains account identity references, collections, scans metadata, decks, share tokens, activity, and price snapshots. Treat backups as personal-data stores and protect them with the same or stronger controls as the primary database.

### Recommended policy

`[OPERATOR: confirm values below]`

| Control                       | Recommended baseline                                       | Deployment value |
| ----------------------------- | ---------------------------------------------------------- | ---------------- |
| Backup type                   | Provider-managed encrypted snapshots plus logical export   | `[fill in]`      |
| Full snapshot frequency       | Daily                                                      | `[fill in]`      |
| Point-in-time recovery        | Enabled where supported                                    | `[fill in]`      |
| Backup retention              | 30 days unless a different documented need exists          | `[fill in]`      |
| Off-site or cross-region copy | Encrypted copy only when required by resilience objectives | `[fill in]`      |
| Restore test                  | At least quarterly and after major schema changes          | `[fill in]`      |
| Backup access                 | Small named operator group, MFA, audited access            | `[fill in]`      |
| Recovery time objective       | `[OPERATOR: target]`                                       | `[fill in]`      |
| Recovery point objective      | `[OPERATOR: target]`                                       | `[fill in]`      |

### Backup contents and minimization

A backup should contain only the data required for recovery. Do not include build artifacts, environment files, OAuth tokens, or unnecessary logs. If scan images are stored in object storage, document whether the database backup includes only their references or whether storage snapshots are also taken.

### Restore procedure

1. Declare the incident and assign an incident lead.
2. Identify the last known-good database and object-storage versions.
3. Provision an isolated recovery environment with separate credentials.
4. Restore the database to the recovery environment.
5. Apply migrations in order and verify the schema version.
6. Restore required object-storage data or confirm that referenced objects are available.
7. Run smoke tests for OAuth, collection isolation, scan ownership, deck access, share expiry, data export, and account deletion.
8. Compare record counts and integrity checks with monitoring baselines.
9. Rotate credentials if compromise is possible.
10. Promote the recovered environment only after an authorized review.
11. Document data loss, decisions, and follow-up actions.

Do not restore a production backup into a developer laptop or an unapproved environment. If a restore is used for testing, apply access restrictions and delete the test copy according to the documented retention policy.

### Deletion and backups

Application account deletion removes the user’s current database records. Backups may retain previous copies until they expire under the documented backup policy. The operator should document this distinction in the privacy notice, restrict backup access, and ensure that expired backups are securely destroyed.

## 4. Monitoring and alerting

Monitoring should detect security incidents, availability failures, data-integrity problems, provider failures, and privacy-control regressions without collecting unnecessary personal data.

### Service-level signals

Track at least:

- HTTP request rate, latency, and error rate by route class.
- tRPC `UNAUTHORIZED`, `FORBIDDEN`, validation, and `TOO_MANY_REQUESTS` responses.
- Login callback failures and invalid OAuth-state events.
- Database connection failures, query latency, deadlocks, and migration errors.
- Storage presign failures, rejected ownership checks, and object-not-found rates.
- Scan upload rejection rates by safe reason category, without logging image bytes.
    - Local AI connection failures, model-load errors, latency, timeouts, and recommendation validation failures.
    - Hosted AI fallback errors, when fallback is enabled.
    - Cardmarket guide download latency, HTTP errors, parse failures, match coverage, and stale-price age.
- Memory, CPU, event-loop delay, disk, file-descriptor, and process-restart metrics.
- Backup completion, backup age, restore-test status, and storage lifecycle failures.

### Privacy-aware logging

Logs should contain a correlation ID, timestamp, route class, status, latency, and a safe error category. Redact or omit:

- Session cookies and OAuth codes.
- Authorization headers and API keys.
- Raw scan images and data URLs.
- Full public share tokens.
- Email addresses unless operationally necessary.
- AI prompts or outputs that contain user data.
- Full database URLs and provider response bodies containing personal data.

If a token must be correlated, log a short one-way fingerprint rather than the token itself. Define log access roles and retain logs only as long as necessary for security and operations.

### Suggested alerts

| Alert                  | Example trigger                                               | Initial action                                                   |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Application outage     | Health endpoint fails for 3 consecutive checks                | Page on-call and inspect edge and process status                 |
| Elevated server errors | 5xx rate above `[OPERATOR: threshold]` for 5 minutes          | Inspect recent deploy, database, and provider dependencies       |
| Authentication attack  | Sudden increase in invalid OAuth state or failed login events | Check abuse source, edge controls, and OAuth configuration       |
| Rate-limit abuse       | Repeated 429 responses from a small source set                | Apply edge block or challenge; do not disable all throttling     |
| Storage access anomaly | Repeated forbidden scan-object requests                       | Investigate object-key probing and account compromise indicators |
| Database degradation   | Connection pool exhaustion or high query latency              | Reduce load, inspect queries, and fail over if configured        |
| Backup failure         | No successful backup within the defined RPO                   | Retry under supervision and escalate before the RPO is exceeded  |
| Secret exposure        | Secret detected in a log, ticket, or repository               | Revoke and rotate immediately; preserve incident evidence        |

## 5. Rate limiting and abuse prevention

The application currently applies a lightweight in-process limit to tRPC requests: 120 requests per IP per rolling minute bucket. This is a useful baseline for one process, but it is not a reliable distributed control because counters are lost on restart and are not shared between instances.

### Required production design for multiple instances

Place rate limiting at the edge and enforce a shared application limit using Redis or an equivalent distributed store. Use separate buckets so that an expensive operation cannot consume the same budget as a cheap catalog read.

`[OPERATOR: confirm limits after load testing]`

| Route class                 |                 Suggested starting limit | Notes                                                      |
| --------------------------- | ---------------------------------------: | ---------------------------------------------------------- |
| Public catalog and prices   |                   120 requests/minute/IP | Cache public catalog responses where appropriate           |
| Authentication callback     |                    10 requests/minute/IP | Preserve legitimate OAuth retries while limiting abuse     |
| Scan creation               | 10 requests/minute/user and 30/minute/IP | Also enforce body size and decoded image limits            |
| CSV import                  |               5 requests/10 minutes/user | Limit rows and reject malformed input early                |
| Price refresh               |               5 requests/10 minutes/user | Protect Cardmarket downloads and provider capacity          |
| AI recommendations          |               5 requests/10 minutes/user | Add concurrency limits and provider timeouts               |
| Deck sharing and revocation |                  30 requests/minute/user | Prevent token churn and abuse                              |
| Personal-data export        |                     3 requests/hour/user | Exports may be expensive and contain sensitive data        |
| Account deletion            |                     3 requests/hour/user | Require an authenticated session and explicit confirmation |

### Rate-limit implementation rules

- Key limits by authenticated user ID when available and by trusted client IP as a secondary abuse signal.
- Do not trust arbitrary client-supplied forwarding headers unless the edge overwrites them and the server is configured with the correct trusted proxy count.
- Return HTTP 429 with a short `Retry-After` value where practical.
- Do not reveal whether another account exists through different rate-limit behavior.
- Add concurrency limits and provider timeouts to AI and Cardmarket requests.
- Do not expose Ollama or LM Studio directly to the public internet; route through a private network or authenticated gateway.
- Keep the last successful Cardmarket import timestamp and alert on stale data.
- Apply body limits before expensive parsing or storage work.
- Test rate limits in staging with the actual proxy topology.
- Monitor false positives and provide a documented support path for legitimate users.

## 6. Edge and network controls

Production traffic should use HTTPS only. Redirect HTTP to HTTPS at the edge, enable HSTS only after HTTPS is verified for every intended subdomain, and disable direct public database access.

The edge or WAF should provide:

- TLS certificate management and renewal.
- DDoS protection appropriate to the service profile.
- Request-body and header-size limits.
- Basic bot and abuse controls.
- Access logs with redaction and documented retention.
- Health checks that do not expose secrets or personal data.
- Deployment rollback support.

The application sets content-type sniffing, frame, referrer, permissions, content-security, and production HSTS headers. Validate the final headers at the deployed domain because a proxy can overwrite or remove them.

## 7. Deployment and change management

Use separate development, staging, and production environments. Production data must not be copied into development without an approved, minimized, and protected test process.

For each release:

1. Review the change and its data-protection impact.
2. Run `pnpm check`, `pnpm test`, and `pnpm build`.
3. Review database migrations and take a verified backup before applying them.
4. Deploy to staging.
5. Run smoke tests for sign-in, collection isolation, scanner upload validation, deck legality, sharing, expiry, export, deletion, and provider failures.
6. Verify security headers, cookie flags, rate limits, and health checks at the public edge.
7. Promote with a rollback plan.
8. Monitor error and latency signals after release.

Never bypass a failed migration, type check, security test, or backup check to meet a release deadline without an explicit risk decision by the operator.

## 8. Incident response

Maintain an incident contact list with an incident lead, infrastructure owner, application owner, privacy contact, and communications owner.

For a suspected compromise:

1. Preserve relevant logs and timestamps without exposing them publicly.
2. Contain the affected service, credential, token, or provider integration.
3. Rotate exposed secrets and invalidate affected sessions or share links.
4. Determine whether personal data was accessed, altered, lost, or disclosed.
5. Check database, storage, backup, OAuth, local/hosted AI, and Cardmarket provider logs.
6. Assess risk to affected individuals and document the assessment.
7. Notify the supervisory authority and affected users when legally required.
8. Restore from a known-good state only after identifying and containing the cause.
9. Record root cause, corrective actions, and verification evidence.

The privacy notice should identify the operator’s security contact and complaint route. Keep a breach register even when notification is not required.

## 9. Operational verification checklist

Before launch, confirm each item and record evidence:

- `[ ]` HTTPS is enforced and production cookies have `Secure`, `HttpOnly`, and appropriate `SameSite` attributes.
- `[ ]` OAuth redirect URLs match the deployed origin and state-nonce failures are monitored.
- `[ ]` Database credentials use least privilege and are stored in the secret manager.
- `[ ]` Backups meet the documented RPO and a restore test has passed.
- `[ ]` Object-storage lifecycle cleanup is configured for unreferenced scan objects.
- `[ ]` Rate limiting is shared across instances or the service is intentionally single-instance.
- `[ ]` AI, marketplace, storage, OAuth, hosting, and monitoring provider terms are reviewed.
- `[ ]` Local AI connectivity is tested from the application server, or hosted fallback is intentionally enabled.
- `[ ]` Cardmarket daily-file import succeeds, match coverage is reviewed, and stale-data alerting is configured.
- `[ ]` Logs redact tokens, image data, prompts, and unnecessary personal data.
- `[ ]` Monitoring alerts have named owners and escalation paths.
- `[ ]` Account export and deletion have been tested in staging.
- `[ ]` A privacy notice, terms, security contact, and support process are published.
- `[ ]` A dependency audit and independent security review are complete or scheduled.

## References

[1]: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng "Regulation (EU) 2016/679 — General Data Protection Regulation"
[2]: https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en "European Data Protection Board — Data breaches"
[3]: https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en "European Data Protection Board — Secure personal data"
[4]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"
[5]: https://owasp.org/www-project-top-ten/ "OWASP Top 10 web application security risks"
