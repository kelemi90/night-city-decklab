# Night City DeckLab

**Documentation version: 0.2 — Local AI and Cardmarket daily pricing**

Night City DeckLab is a full-stack companion application for Cyberpunk TCG players. It combines camera-assisted card scanning, OCR-based catalog matching, personal collection management, EUR price snapshots, RAM-aware deck building, AI deck recommendations, CSV transfer, and controlled public deck sharing.

> **Security and GDPR scope:** The application includes technical safeguards and user-facing privacy controls, but these features alone do not constitute a legal determination of GDPR compliance or a guarantee that the system is unhackable. Before processing real user data in production, complete a deployment-specific privacy review, establish the required legal notices and processor agreements, and arrange an independent security assessment.

## Features

## Documentation

- [Privacy Notice and GDPR details](PRIVACY.md)
- [Deployment operations: backups, monitoring, and rate limiting](DEPLOYMENT.md)

### Card scanning and recognition

The scanner can use a webcam or phone camera to capture the front and back of a card. Browser-side image processing performs assisted card cropping and perspective correction. Tesseract.js reads the corrected front image and matches the detected name against the official catalog. The scanner provides several preprocessing modes for difficult images and keeps manual catalog selection available when OCR confidence is low.

Authenticated users can save the scan pair to server-backed storage. Upload validation accepts JPEG, PNG, and WebP images and limits each decoded image to 8 MB.

### Collection management

Signed-in users can add cards, update quantities, record condition, and view their collection. Collection data is scoped to the authenticated user ID. The application supports validated CSV import and CSV export using the following columns:

```csv
cardId,cardName,quantity,condition
```

CSV import is limited to 1,000 card lines, and quantities are constrained by the server-side schema.

### Catalog and pricing

The application seeds and maintains the official 151-card catalog used by the recognition and deck-building flows. Prices are represented in EUR. When `CARDMARKET_PRICE_GUIDE_URL` is configured, the price refresh procedure imports the Cardmarket daily CSV/TSV guide, matches catalog names, and stores EUR snapshots. Without a configured provider, the application can still display seeded catalog estimates.

### RAM-aware deck building

The deck builder follows the published Cyberpunk TCG deck-building rules. It validates Legend limits, main-deck size, copy limits, card types, and color-specific RAM. Saved decks retain their card lists and can be exported as formatted text.

### AI deck advisor

The advisor uses an OpenAI-compatible server-side LLM integration to recommend legal decks from the authenticated user’s collection. Set `LOCAL_AI_PROVIDER=ollama` or `LOCAL_AI_PROVIDER=lmstudio` to route calls to a local model; otherwise the existing hosted provider is used. Users can compare multiple strategy goals, including Aggro, Control, Midrange, and Tempo. Speed, control, and budget weights are passed to the server-side recommendation procedure. Results are validated against ownership and deck rules before they are returned to the client.

### Sharing

A saved deck can receive a public share token. Owners can copy the link, set an optional expiration date, update the expiry, or revoke access. Share tokens are generated with high entropy, and the server refuses expiry dates that are in the past or more than 366 days in the future. Expired and revoked links do not return deck data.

### Authentication and account privacy

Manus OAuth provides the sign-in flow. Personal collection, scan, deck, advisor, activity, export, and deletion procedures use protected tRPC procedures. The OAuth callback preserves the template’s state nonce validation to reduce login CSRF and session-fixation risk.

Signed-in users can use the Recent Activity page to:

- Export their stored profile, collection, scans, decks, deck cards, share records, and activity as JSON.
- Permanently delete their application account data.

Activity events are operational telemetry and are automatically retained for no more than 90 days. Account deletion removes the database records for the user’s profile, collection, scans, decks, deck cards, share links, and activity. Storage objects are no longer referenced after deletion; the deployment’s storage lifecycle policy should also be configured to remove unreferenced objects.

## Technology

| Area            | Technology                                                         |
| --------------- | ------------------------------------------------------------------ |
| Frontend        | React 19, Vite, Tailwind CSS 4, Radix UI primitives                |
| Backend         | Node.js, Express 4, tRPC 11                                        |
| Database        | MySQL or TiDB with Drizzle ORM                                     |
| Authentication  | Manus OAuth and server-managed session cookie                      |
| OCR             | Tesseract.js                                                       |
| Computer vision | Browser-side canvas processing and perspective correction          |
| AI              | Ollama/LM Studio local OpenAI-compatible adapter, with hosted fallback |
| Storage         | Manus storage proxy with signed redirects                          |
| Testing         | Vitest and TypeScript compiler checks                              |

## Repository layout

```text
client/
  src/
    pages/              Page-level application views
    components/         Shared UI and layout components
    lib/                OCR, vision, CSV, and export helpers
    _core/hooks/        Authentication hooks
server/
  _core/                Express, OAuth, context, cookies, storage, and runtime code
  db.ts                 User-scoped database helpers
  routers.ts            tRPC procedures and input validation
  cardmarket.ts         Cardmarket daily price-file adapter
  deckAdvisor.ts        Server-side recommendation and validation logic
  *.test.ts             Vitest regression tests
drizzle/
  schema.ts             Database schema
  migrations/           Generated migration history
shared/
  deckRules.ts          Catalog data and shared deck legality rules
```

## Requirements

Use the Node.js and pnpm versions supported by the project template. The repository currently declares Node-compatible TypeScript, Vite, Express, Drizzle, and Vitest dependencies.

The application expects a MySQL-compatible database and the Manus platform environment variables described below. Authentication and server storage require the corresponding Manus services to be configured.

## Installation

```bash
pnpm install
```

Create or configure the environment through the hosting platform. Do not commit a `.env` file or place server secrets in client code.

For local development, copy `.env.example` to `.env` and adjust the provider values for the model runtime installed on the same machine as the application server. The server—not the browser—connects to Ollama or LM Studio, so `127.0.0.1` refers to the server host. A remotely hosted application cannot reach an Ollama or LM Studio instance running only on a developer laptop without a private, authenticated network connection.

### Local AI setup

Ollama and LM Studio expose compatible chat-completions endpoints. Start one provider, download or load a model, and configure the matching variables:

```env
# Ollama example
LOCAL_AI_PROVIDER=ollama
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=llama3.2:3b
LOCAL_AI_API_KEY=ollama
```

```env
# LM Studio example
LOCAL_AI_PROVIDER=lmstudio
LOCAL_AI_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_AI_MODEL=your-loaded-model-name
LOCAL_AI_API_KEY=lm-studio
```

If `LOCAL_AI_PROVIDER` is not `ollama` or `lmstudio`, the application uses the configured hosted AI fallback. Never expose a local AI endpoint publicly without authentication, network restrictions, and TLS or a trusted private network.

### Cardmarket price-file setup

Cardmarket daily pricing is imported from a configured CSV or TSV price-guide URL. Set `CARDMARKET_PRICE_GUIDE_URL` to a stable, authorized download URL, then use **Price watch → Import daily prices** after signing in. The importer matches product names to the application catalog, stores EUR snapshots, and retains the last stored snapshot when the provider is unavailable. The guide is a daily snapshot rather than real-time marketplace listings; Cardmarket access and redistribution terms still apply.

## Environment variables

| Variable                      | Used for                                                 | Exposure                                                                      |
| ----------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                | MySQL/TiDB connection string                             | Server only                                                                   |
| `JWT_SECRET`                  | Session infrastructure secret                            | Server only                                                                   |
| `VITE_APP_ID`                 | Manus OAuth application ID                               | Browser-compatible identifier                                                 |
| `OAUTH_SERVER_URL`            | Manus OAuth server                                       | Server only                                                                   |
| `OWNER_OPEN_ID`               | Owner/admin identity mapping                             | Server only                                                                   |
| `BUILT_IN_FORGE_API_URL`      | Manus built-in API base URL                              | Server only, except platform-provided client integrations                     |
| `BUILT_IN_FORGE_API_KEY`      | Manus built-in API credential                            | Server only                                                                   |
| `VITE_FRONTEND_FORGE_API_URL` | Browser-compatible Manus API URL where required          | Client                                                                        |
| `VITE_FRONTEND_FORGE_API_KEY` | Browser-compatible client integration key where required | Client; use only when the platform explicitly supports public client exposure |
| `LOCAL_AI_PROVIDER`           | `ollama` or `lmstudio`                                   | Server only                                                                   |
| `LOCAL_AI_BASE_URL`           | Local provider base URL including `/v1`                  | Server only                                                                   |
| `LOCAL_AI_MODEL`              | Model name loaded in Ollama or LM Studio                | Server only                                                                   |
| `LOCAL_AI_API_KEY`            | Optional local provider key; defaults to `ollama`        | Server only                                                                   |
| `CARDMARKET_PRICE_GUIDE_URL`  | URL of the downloaded Cardmarket daily CSV/TSV guide     | Server only                                                                   |

The `VITE_` prefix means a variable may be included in the browser bundle. Never put database passwords, OAuth client secrets, JWT secrets, storage credentials, marketplace credentials, local AI keys, or built-in API server keys in a `VITE_` variable.

## Development commands

```bash
# Start the development server with Vite and the Express API
pnpm dev

# Run the TypeScript compiler without emitting files
pnpm check

# Run the complete Vitest suite
pnpm test

# Build the browser application and bundled server
pnpm build

# Start the production bundle
pnpm start

# Generate and apply Drizzle migrations when schema changes are intentional
pnpm db:push
```

The development server normally starts on port 3000. If that port is occupied, the server searches the next available ports.

The server-side AI and Cardmarket endpoints must be reachable from the Node.js process. Browser reachability is not sufficient.

## Database workflow

When changing the database schema:

1. Update `drizzle/schema.ts`.
2. Generate the migration with the project’s Drizzle tooling.
3. Review the generated SQL before applying it.
4. Apply the migration through the configured database workflow.
5. Update `server/db.ts` with user-scoped helpers.
6. Add or update the corresponding protected tRPC procedure.
7. Add regression tests.
8. Run `pnpm check`, `pnpm test`, and `pnpm build`.

Every table containing personal data includes a user ownership field or is reachable only through a user-owned parent record. New queries must preserve this boundary. Do not accept a client-supplied user ID as an authorization mechanism.

## Security model

The application uses several layers of defense:

- Manus OAuth authentication with state nonce verification.
- Protected tRPC procedures for personal data and mutations.
- Server-side Zod validation for IDs, quantities, deck lines, upload metadata, share expiry, and recommendation parameters.
- SameSite `lax`, HTTP-only session cookies with `Secure` enabled for HTTPS requests.
- Security headers including content-type sniffing protection, frame restrictions, referrer policy, permissions policy, content security policy, and production HSTS.
- Lightweight API request throttling at the Express layer.
- Maximum request-body limits to reduce memory exhaustion from oversized payloads.
- JPEG, PNG, and WebP allow-listing for scan uploads.
- An 8 MB decoded-image limit for each scan image.
- Authenticated ownership checks before resolving personal scan storage objects.
- High-entropy share tokens with expiry and revocation enforcement.
- User-scoped database access for collections, scans, decks, activity, exports, and deletion.

These controls reduce common application risks but do not replace infrastructure controls. Production deployments should add a shared rate-limit store, centralized logging and alerting, dependency scanning, secret rotation, database backups, least-privilege database credentials, and an independent penetration test.

## GDPR and privacy operational requirements

The application provides technical support for common data-subject workflows, but the operator remains responsible for determining the lawful basis, controller and processor roles, retention schedule, notices, and response process.

Before production use, document at least the following:

1. What personal data is collected and why.
2. The lawful basis for authentication, storage, analytics, and pricing integrations.
3. Which processors receive data, including OAuth, storage, hosting, AI, and marketplace providers.
4. The retention period for each category of data.
5. How users can request access, correction, portability, restriction, or deletion.
6. How personal-data breaches are detected, contained, documented, and reported.
7. Whether card scan images are necessary for the service and when their underlying storage objects are removed.
8. Whether children or other protected groups can use the service.

Do not upload identity documents, payment data, or unrelated sensitive personal data through the scanner. Card scans may still reveal contextual information about a person’s collection and should be treated as personal data when linked to an account.

## Storage and public sharing notes

Scan images are stored outside the database and referenced by storage URLs. The application uses the storage proxy to resolve signed URLs. Personal scan keys follow a user-owned path and are checked against the authenticated user before resolution.

Public deck sharing intentionally exposes the shared deck’s name and card list to anyone holding an active link. It does not expose the owner’s email, profile, collection, scans, activity, or prices. Users should revoke links that have been shared accidentally. For stricter privacy, require authentication for shared decks or add password-protected links before production use.

## Testing

Run the full suite with:

```bash
pnpm test
```

The suite covers authentication behavior, card pricing, deck legality, share expiration and revocation, OCR matching, CSV parsing, deck export, and security validation. Run the compiler and production build as well:

```bash
pnpm check
pnpm build
```

A passing local build is not a substitute for testing the deployed environment. Verify OAuth redirects, secure cookies, storage ownership, database migrations, public share expiry, account export, account deletion, Cardmarket file imports, and local AI connectivity in a staging deployment.

## Deployment checklist

Before exposing the service to users:

- Configure HTTPS and verify that production cookies are marked `Secure`.
- Configure OAuth redirect URLs using the actual deployed origin.
- Store all server credentials in the platform secret manager.
- Apply and verify database migrations.
- Use a least-privilege database account.
- Configure backups and test restoration.
- Configure storage lifecycle cleanup for deleted or unreferenced scan objects.
- Replace the in-process rate limiter with a shared store when running multiple instances.
- Add centralized error monitoring without logging card images, access tokens, session cookies, or unnecessary personal data.
- Publish a privacy notice, terms of use, cookie notice where required, and a security contact.
- Perform a dependency audit and independent penetration test.
- Confirm that AI and marketplace providers’ terms permit the intended data flows.
- Confirm that the local AI host is reachable from the application server and that its model is loaded.
- Import a Cardmarket guide in staging and verify matched, unmatched, stale, and malformed-file behavior.

## Known limitations

The current implementation does not provide a built-in consent-management platform, formal data-processing agreement management, self-service correction of OAuth profile fields, verified deletion of remote storage bytes, password-protected share links, or a distributed rate-limit store. These should be addressed according to the intended deployment and risk profile.

The bundled frontend has a large JavaScript chunk because OCR and related client functionality are included in the application bundle. Code splitting can improve initial load performance without changing the security model.

## License and third-party services

This project is released under the license declared in `package.json`. Card catalog content, card images, marketplace data, OAuth services, storage, and AI services may be subject to separate terms. Review the applicable terms before redistributing catalog data or operating the service commercially.

## References

[1]: https://cyberpunktcg.com/gameplay-guide#gameplay-guide-deck-building-ram "Cyberpunk TCG gameplay guide and deck-building RAM rules"
[2]: https://www.cardmarket.com/en/Insight/Articles/Downloads "Cardmarket downloads"
[3]: https://eur-lex.europa.eu/eli/reg/2016/679/oj "Regulation (EU) 2016/679 — General Data Protection Regulation"
[4]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"
[5]: https://owasp.org/www-project-top-ten/ "OWASP Top 10 web application security risks"
