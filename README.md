# Night City DeckLab

Night City DeckLab is a full-stack Cyberpunk TCG companion for managing a collection, scanning cards, validating deck legality, and getting AI-assisted recommendations. The project combines a React frontend, an Express + tRPC server, a MySQL/TiDB database, local OCR, and live pricing integrations.

> Security note: the app includes protection for authentication, user-scoped data access, and public share links, but these controls do not replace a deployment review, privacy assessment, or production security hardening.

## What this app does

- Scan physical cards with a browser camera and match them to the local catalog using Tesseract OCR.
- Track personal collection data by user, including quantities and condition.
- Import and export collection CSV data.
- Build decks against the official Cyberpunk TCG rules and validate RAM, legend limits, copy limits, and deck size.
- Generate deck suggestions from the user’s collection with a server-side OpenAI-compatible AI request.
- Display EUR price snapshots from Cardmarket and CardTrader.
- Create temporary public deck-share links with expiry and revocation controls.
- Provide recent activity, export, and account-deletion flows for signed-in users.

## Documentation

- [Privacy notice and GDPR notes](PRIVACY.md)
- [Deployment and operations guide](DEPLOYMENT.md)

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS 4, Radix UI |
| Backend | Node.js, Express 4, tRPC 11 |
| Database | MySQL/TiDB with Drizzle ORM |
| Auth | Manus OAuth + server-managed session cookie |
| OCR | Tesseract.js |
| Computer vision | Browser-side canvas processing and perspective correction |
| AI | Ollama / LM Studio OpenAI-compatible adapter, with hosted fallback |
| Pricing | Cardmarket daily guide + CardTrader marketplace data |
| Storage | Manus storage proxy for signed object access |
| Testing | Vitest and TypeScript compiler checks |

## Repository layout

```text
client/
  src/
    pages/              UI pages for scanner, collection, decks, prices, and activity
    components/         Shared UI and layout components
    lib/                OCR, CSV, export, and client-side helpers
server/
  _core/                Express app, OAuth, session, storage, and runtime utilities
  db.ts                 User-scoped database helpers
  routers.ts            tRPC endpoints and validation
  cardmarket.ts         Cardmarket daily guide adapter
  cardtrader.ts         CardTrader live price adapter
  deckAdvisor.ts        Recommendation and legality validation logic
  *.test.ts             Regression tests
shared/
  deckRules.ts          Catalog data and deck-rule validation
  betaCatalog.ts        Beta Edition catalog additions

drain/                  Not used; migration database artifacts live under drizzle/
drizzle/
  schema.ts             Database schema
  migrations/           Generated migration history
```

## Requirements

- Node.js supported by the repo toolchain
- pnpm
- MySQL-compatible database
- Manus OAuth and storage configuration for the server runtime
- Optional local AI provider for Ollama or LM Studio
- Optional Cardmarket and CardTrader provider configuration for live pricing

## Installation

```bash
pnpm install
```

Then create your local environment file from the example:

```bash
cp .env.example .env
```

Do not commit `.env` or place server secrets in browser code.

## Environment variables

The app reads the following server-side values from the environment:

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `DATABASE_URL` | MySQL/TiDB connection string | Server only |
| `JWT_SECRET` | Session signing secret | Server only |
| `VITE_APP_ID` | Manus OAuth app identifier | Browser-safe |
| `OAUTH_SERVER_URL` | Manus OAuth server URL | Server only |
| `OWNER_OPEN_ID` | Owner/admin identity mapping | Server only |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API base URL | Server only |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API credential | Server only |
| `VITE_FRONTEND_FORGE_API_URL` | Public client-facing Forge URL if required by the host | Client |
| `VITE_FRONTEND_FORGE_API_KEY` | Client-side Forge key when explicitly supported by the platform | Client |
| `LOCAL_AI_PROVIDER` | Set to `ollama` or `lmstudio` for local AI | Server only |
| `LOCAL_AI_BASE_URL` | Local OpenAI-compatible base URL, usually including `/v1` | Server only |
| `LOCAL_AI_MODEL` | Model name for the local provider | Server only |
| `LOCAL_AI_API_KEY` | API key for local provider (defaults to `ollama`) | Server only |
| `CARDMARKET_PRICE_GUIDE_URL` | Daily Cardmarket price-guide URL | Server only |
| `CARDMARKET_PRODUCT_CATALOG_URL` | Cardmarket product catalog URL used for matching | Server only |
| `CARDTRADER_API_TOKEN` | CardTrader API bearer token | Server only |
| `CARDTRADER_EXPANSION_IDS` | Optional CardTrader expansion IDs to include | Server only |

> Treat any `VITE_` variable as public. Never put database passwords, OAuth secrets, JWT keys, storage credentials, marketplace credentials, or local AI keys in a client-exposed variable.

## Local AI setup

The app supports OpenAI-compatible local providers. Example values:

```env
LOCAL_AI_PROVIDER=ollama
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=llama3.2:3b
LOCAL_AI_API_KEY=ollama
```

Or for LM Studio:

```env
LOCAL_AI_PROVIDER=lmstudio
LOCAL_AI_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_AI_MODEL=your-loaded-model-name
LOCAL_AI_API_KEY=lm-studio
```

If no local provider is configured, the app falls back to the hosted AI configuration. Do not expose a local AI endpoint publicly without authentication and network restrictions.

## Pricing setup

The project can import live price data from two sources:

- Cardmarket daily guide: `CARDMARKET_PRICE_GUIDE_URL` + `CARDMARKET_PRODUCT_CATALOG_URL`
- CardTrader marketplace: `CARDTRADER_API_TOKEN` and optional `CARDTRADER_EXPANSION_IDS`

The app uses the same EUR price pipeline for both and stores snapshots per card so the UI can show price history and current market context.

## Development commands

```bash
# Start the dev server with Vite and the Express API
pnpm dev

# Type-check without emitting build artifacts
pnpm check

# Run the complete test suite
pnpm test

# Build the browser and server bundles
pnpm build

# Start the built production bundle
pnpm start

# Generate/apply Drizzle migrations
pnpm db:push
```

## Database workflow

When changing the database schema:

1. Update `drizzle/schema.ts`.
2. Generate a migration with the project Drizzle tooling.
3. Review the SQL before applying it.
4. Apply the migration through the configured workflow.
5. Update `server/db.ts` with user-scoped helpers when needed.
6. Add or update the protected tRPC procedure.
7. Add or adjust regression tests.
8. Run `pnpm check`, `pnpm test`, and `pnpm build`.

Always preserve user ownership boundaries. Do not accept a client-supplied user ID as the authorization mechanism for personal data.

## Privacy and security notes

This project includes the following safeguards:

- Manus OAuth sign-in flow with state validation
- Protected tRPC procedures for private user data
- Server-side validation for uploads, share expiry, quantities, deck inputs, and AI parameters
- HTTP-only, secure session cookies in production
- Security headers and request-size limits
- Allowed image types and a 8 MB max decoded-image limit
- User-scoped scan storage checks before resolving personal object URLs
- High-entropy share tokens with expiry and revocation enforcement

These reduce common risks but do not replace a full production review, a privacy review, and operational controls.

## Testing

Run the full suite with:

```bash
pnpm test
```

Recommended additional validation before deployment:

- `pnpm check`
- `pnpm build`
- Auth flow and cookie behavior in a staging environment
- Database migration review and verification
- Public share expiry/revocation testing
- Cardmarket and CardTrader import checks
- Local AI connectivity checks

## License

This project is released under the license declared in `package.json`.

## Related docs

- [Privacy notice](PRIVACY.md)
- [Deployment and operations](DEPLOYMENT.md)
- [Project notes](catalog-import-notes.md)

## References

- Cyberpunk TCG gameplay guide and deck-building RAM rules
- Cardmarket downloads page
- GDPR reference
- OWASP Application Security Verification Standard
- OWASP Top 10 web application security risks
