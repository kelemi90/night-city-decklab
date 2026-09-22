# Night City DeckLab Privacy Notice

**Version:** 1.0  
**Effective date:** `[OPERATOR: insert publication date]`  
**Last reviewed:** `[OPERATOR: insert review date]`

> **Publication requirement:** Replace every bracketed operator field before publishing this notice. This document describes the current application behavior and provides a GDPR-oriented notice template. It is not legal advice and does not by itself establish compliance. The service operator must confirm the applicable law, lawful bases, processor terms, international-transfer safeguards, retention periods, and user-contact process with qualified counsel or a data-protection professional.

## 1. Controller and contact details

The controller responsible for personal-data processing is:

- **Controller name:** `[OPERATOR: legal name]`
- **Registered address:** `[OPERATOR: registered address]`
- **Contact email:** `[OPERATOR: privacy email]`
- **Data protection officer, if appointed:** `[OPERATOR: name and contact, or “not appointed”]`
- **Supervisory authority:** `[OPERATOR: identify the relevant supervisory authority]`

For privacy requests, contact `[OPERATOR: privacy email]`. Requests should not include passwords, access tokens, payment details, identity documents, or unrelated sensitive information unless the controller specifically requests an appropriate verification method.

## 2. What Night City DeckLab does

Night City DeckLab is a companion service for Cyberpunk TCG players. It can identify cards from camera or uploaded images, maintain a signed-in collection, show EUR price information, validate decks against RAM rules, generate AI-assisted deck recommendations, import and export collection CSV files, and create public links for selected decks.

The service is not intended for identity verification, payment processing, medical information, financial records, government identifiers, or special-category personal data. Do not upload such material through the scanner.

## 3. Personal data we process

The service processes different data depending on whether a visitor signs in and which features the user chooses.

| Data category                   | Examples                                                                                                                   | Why it is processed                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Account and authentication data | Manus OAuth identifier, display name, email address if supplied by the identity provider, login method, sign-in timestamps | To authenticate the user, maintain a session, and associate private data with the correct account |
| Collection data                 | Card IDs, card names, quantities, card condition, collection update timestamps                                             | To maintain the user’s collection and calculate collection-related views                          |
| Scan data                       | Front and back card images, recognition status, selected catalog card, scan timestamp                                      | To store a user-requested scan and support card recognition and review                            |
| Deck data                       | Deck name, notes where provided, selected Legends, main-deck card lines, update timestamps                                 | To save, validate, export, and share a deck at the user’s request                                 |
| Share data                      | Share token, deck reference, creation time, expiry time, revocation time                                                   | To operate a public share link and enforce expiry or revocation                                   |
| Activity data                   | Events such as scans, deck saves, collection imports, and AI recommendations                                               | To display the signed-in user’s recent activity timeline                                          |
| AI request data                 | Collection-derived card information, strategy goals, and speed, control, and budget weights                                | To generate a deck recommendation requested by the user                                           |
| Pricing data                    | Card IDs and collection-scoped marketplace lookup results                                                                  | To retrieve and display EUR card-price snapshots                                                  |
| Technical and security data     | Request metadata held by the hosting, storage, OAuth, database, monitoring, or security infrastructure                     | To operate, secure, troubleshoot, and protect the service                                         |

The application does not intentionally request precise location, contacts, microphone input, or payment-card information. The browser may request camera access only when the user starts camera scanning. Camera frames are processed in the browser until the user chooses to save a scan.

## 4. Purposes and lawful bases

The controller must confirm the lawful basis for each processing activity and adapt this section to the actual business model. The following mapping is a starting point for review:

| Purpose                                             | Likely GDPR basis to assess                                                 | Notes                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Sign-in and session management                      | Performance of a contract, or steps at the user’s request before a contract | Required for private collection, scans, decks, and account controls                   |
| Saving collections, scans, and decks                | Performance of a contract                                                   | The user chooses which data to save                                                   |
| Providing public deck links                         | Performance of a contract and the user’s sharing instruction                | The user should understand that anyone with an active link can view the shared deck   |
| AI deck recommendations                             | Performance of a contract or consent, depending on the service design       | Confirm the AI provider’s role, processing terms, retention, and transfer mechanism   |
| Marketplace price lookups                           | Performance of a contract or legitimate interests, subject to balancing     | Send only the minimum card information needed for the lookup                          |
| Security, abuse prevention, and service reliability | Legitimate interests or legal obligation, as applicable                     | Document the balancing assessment and retention period                                |
| Optional analytics or marketing                     | Consent or another legally valid basis                                      | No optional analytics or marketing should be enabled merely because the user signs in |

The controller should not rely on legitimate interests without documenting the purpose, necessity, balancing assessment, safeguards, and objection process. The service should not use personal data for a new incompatible purpose without the required notice and legal basis.

## 5. Providers and disclosures

The service may disclose data to providers that operate infrastructure or provide features. The controller must maintain an accurate processor and subprocessor register and publish provider details where required.

| Provider or category                          | Data that may be involved                                       | Operator action required                                                                   |
| --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Manus OAuth                                   | Account identity and authentication information                 | Confirm the applicable data-processing terms and transfer safeguards                       |
| Manus hosting and database infrastructure     | Account records, collection, scans, decks, activity, and logs   | Confirm hosting region, retention, access controls, and deletion behavior                  |
| Manus storage                                 | Scan-image bytes and storage keys                               | Configure signed access, lifecycle deletion, and region documentation                      |
| Manus built-in AI service                     | Collection-derived card data, recommendation goals, and weights | Confirm whether prompts are retained or used for training and document the processor terms |
| CardTrader or another marketplace provider    | Card identifiers and pricing lookup data                        | Confirm API terms, region, retention, and whether a data-processing agreement is required  |
| Monitoring and security providers, if enabled | Error events, request metadata, and operational logs            | Do not send image content, tokens, passwords, or unnecessary personal data                 |

The operator must not claim that a provider is used, located, or certified in a particular way until those facts are verified for the deployed environment. International transfers must use a lawful mechanism and appropriate safeguards where required. [1]

## 6. Public deck sharing

A public share link is a deliberate disclosure by the user. Anyone who obtains an active link can view the shared deck’s name and card list. The public view is designed not to disclose the owner’s email, private collection, scans, activity, or prices.

Share tokens are generated with high entropy. Owners can set an expiry date, update the link, or revoke access. Expired and revoked links are rejected by the server. Users should treat a share link as a bearer credential and revoke it if it was sent to the wrong person.

The controller should consider whether public sharing requires an additional warning, password protection, authentication, or a shorter default expiry for the intended audience.

## 7. AI-assisted recommendations

The advisor produces suggestions rather than decisions about a person. It uses collection-derived card information and the user’s selected strategy goals and weights. Recommendations are checked against the application’s deck rules and ownership data before being shown, but the service does not guarantee competitive performance, legality under future rule changes, completeness, or correctness of generated text.

The operator must confirm the AI provider’s processing role, prompt and output retention, training use, subprocessor list, data-location information, and international-transfer safeguards. Do not send unnecessary account identity data to the AI provider.

## 8. Retention and deletion

The operator must replace the following policy with deployment-specific periods that reflect actual database, storage, backup, log, and provider behavior.

| Data                                        | Current application behavior                                                                                    | Operator retention decision                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Activity events                             | Events older than 90 days are removed during activity writes; the visible timeline returns the latest 30 events | `[OPERATOR: confirm 90-day policy and account for backups/logs]`                  |
| Collection, decks, scans, and share records | Retained until the user deletes them or the account is deleted                                                  | `[OPERATOR: define inactive-account and backup retention]`                        |
| Scan-image objects                          | Stored outside the database and referenced by application records; deletion removes database references         | `[OPERATOR: configure storage lifecycle deletion for unreferenced objects]`       |
| Session and OAuth data                      | Controlled by the authentication provider and server cookie configuration                                       | `[OPERATOR: confirm session and provider retention]`                              |
| Operational logs                            | Depends on hosting and monitoring configuration                                                                 | `[OPERATOR: define log retention and redaction policy]`                           |
| Database backups                            | Depends on the deployment backup system                                                                         | `[OPERATOR: define backup retention and deletion propagation]`                    |
| Pricing snapshots                           | Stored as market snapshots for card pricing                                                                     | `[OPERATOR: define whether snapshots are personal, operational, or catalog data]` |

When the user uses the application’s delete-account control, the server deletes the user profile, collection records, scan records, decks, deck cards, share links, and activity records in a database transaction. Storage bytes that are no longer referenced should be removed by the configured storage lifecycle process. Backups may retain deleted records for the documented backup-retention period, subject to access restrictions and eventual overwrite or destruction.

## 9. Data-subject rights

Subject to applicable law and any permitted exceptions, users may have rights to be informed, access their data, correct inaccurate data, delete data, restrict processing, receive portable data, object to certain processing, and withdraw consent where consent is the legal basis. Users may also have the right to complain to a supervisory authority. [1]

The Recent Activity area provides a JSON export of the application data currently associated with the account. The same area provides permanent application-account deletion. For requests that cannot be completed through the interface, contact `[OPERATOR: privacy email]`.

The controller should verify identity only to the extent reasonably necessary to prevent unauthorized disclosure. Requests should normally be answered within the legal deadline. If a request is complex or cannot be fulfilled, the controller should explain the reason and any available complaint route.

The current application does not provide a separate self-service correction workflow for OAuth profile fields. Users should contact `[OPERATOR: privacy email]` for corrections that cannot be made through the application.

## 10. Cookies and similar technologies

The application uses an HTTP-only session cookie for authentication. It also uses a short-lived OAuth state cookie during sign-in to bind the authorization response to the browser that initiated the flow. These cookies support requested authentication and security functions.

The operator must add any analytics, advertising, preference, or third-party cookies actually used by the deployed environment to this notice and implement consent controls where required. This notice does not authorize optional cookies merely by being published.

## 11. Security measures

The current application includes protected tRPC procedures, server-side input validation, user-scoped database helpers, secure response headers, production HSTS, request-size limits, lightweight API throttling, allowed image types, an 8 MB decoded-image limit, authenticated scan-storage ownership checks, high-entropy share tokens, share expiry and revocation, and OAuth state-nonce validation.

These are technical measures, not a security guarantee. The controller and deployment operator must also manage least-privilege credentials, secret rotation, patching, backups, access reviews, monitoring, incident response, vulnerability handling, and independent testing. The service should not log raw access tokens, session cookies, scan bytes, or unnecessary personal data.

## 12. Personal-data breaches

The operator must maintain an incident-response process for suspected loss, alteration, unauthorized disclosure, or unauthorized access. The process should identify the affected systems and data, contain the incident, preserve relevant evidence, assess risk to individuals, document decisions, notify the supervisory authority where legally required, and communicate with affected users where required. The GDPR generally requires notification to the supervisory authority without undue delay and, where feasible, within 72 hours after becoming aware of a qualifying breach. [1] [2]

Security reports should be sent to `[OPERATOR: security contact]`. Do not publish exploit details or personal data in a public issue tracker.

## 13. Children

The service is not intentionally directed to children. The operator must define the minimum age, parental-consent approach where applicable, and response process for data relating to children. Do not state a specific age until the operator confirms the countries and services in scope.

## 14. Changes to this notice

The controller may update this notice when the service, providers, processing purposes, legal bases, or applicable requirements change. The published version should include an effective date and explain material changes. Where required, the controller should provide additional notice or obtain consent before beginning a new processing activity.

## 15. Contact and complaint

For privacy questions, data-subject requests, or concerns, contact:

`[OPERATOR: privacy email and postal address]`

Users may also complain to the competent supervisory authority in their habitual residence, place of work, or the place of the alleged infringement, subject to applicable law. [1]

## References

[1]: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng "Regulation (EU) 2016/679 — General Data Protection Regulation"
[2]: https://www.edpb.europa.eu/sme/assess-the-risks/data-breaches_en "European Data Protection Board — Data breaches"
[3]: https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en "European Data Protection Board — Secure personal data"
