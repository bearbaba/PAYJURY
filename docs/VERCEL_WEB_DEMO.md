# PAYJURY V2 — One-website demo (Vercel)

Production demo opens the completed V2 case in the live On-chain Case Tracker, above the optional case-filing workflow. No new payment, filing or adjudication is necessary.

## Public case facts

- Base Sepolia test USDC TX: `0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2`
- V2 contract: `0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`
- Case ID: `pj_9f2276fd1904120b16d5f5b6ea5f7a2b`
- Operator-observed final case state: `DECIDED / ACCEPT`.
- Readback is live: any RPC outage must render an error instead of fabricated success.
- Scope: 0.01 test USDC transfer, paid HTTP 200 with nonempty body; no claim of API payload correctness, refund or legal arbitration.

## Vercel settings

Use GitHub repository `bearbaba/PAYJURY`, Node 22, project root. Build command: `npm run build:web`. Output directory: `web`. `vercel.json` routes `/api/*` to a Node Function built from `api/index.mjs`.

Set non-secret environment variables for preview and production:
- `BASE_RPC_URL=https://sepolia.base.org`
- `GENLAYER_CONTRACT_ADDRESS=0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`
- `GENLAYER_V2_CONTRACT_ADDRESS=0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`

`BASE_MAINNET_RPC_URL` is optional for any mainnet case lookup and must be a trusted Base mainnet RPC if used.

**Critical safety boundary:** Vercel's serverless filesystem is read-only except temporary scratch storage; PAYJURY's existing x402 relay uses a permanent payment-attempt lock that cannot be guaranteed on Vercel. The hosted adapter therefore rejects all `/api/v2/x402/*` payment/quote paths and never attempts payments or signatures. The browser hides the new-purchase panel. Do not enable payments on a hosted environment until a durable, atomic idempotency store and review exist.

GenLayer wallet signing, if ever used by an eligible case owner, remains separate, user-approved client-side; the server does not hold private keys or submit GenLayer writes. Repeated or uncertain signed TX outcomes must never be retried.

## Video sequence: one website, 44 seconds

1. Hero: PAYJURY x402 + GenLayer.
2. Auto-loaded live V2 case in tracker: DECIDED / ACCEPT, independently VERIFIED Base transfer.
3. Show the actual AI Reason, not generated sample text.
4. Open the Base and GenLayer Explorer links from the same website (new tabs only if needed).
5. Return to PAYJURY close-up showing case identity and verdict.
6. End screen PAYJURY | x402 | GenLayer. No payment, filing, adjudication or wallet popups in the recording.

Before claiming launch success, verify public URL HTTP 200, /api/status hostedReadOnly=true, /api/case v2 returns live state, desktop/mobile rendering, and /api/v2/x402/execute is rejected.

## Optional new one-take V2 live payment (separate from completed V2 case)

The production overview continues to display the original `DECIDED / ACCEPT` case and should be treated as historical evidence. A new live payment is a separate transaction/case and is **never** automatically signed or replayed.

PAYJURY now has an *opt-in* Vercel checkout gate. It will not open until all of the following have been configured in the `payjury` Vercel project:

- Vercel Marketplace Upstash integration: `KV_REST_API_URL` (HTTPS REST endpoint) and `KV_REST_API_TOKEN` (write-capable REST token) are automatically injected into the selected environment, e.g. Preview. PAYJURY accepts this matching pair without copying secrets.
- Standalone Upstash setup: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` may be configured instead. If either standalone variable is present, both must be valid; no fallback or mixing of credentials.
- Keep credentials as Vercel **server-side encrypted/sensitive variables only**; never paste tokens into chat or expose them in browser bundles.
- `PAYJURY_NEW_CHECKOUT_ENABLED=1` — explicit release switch; DO NOT add until Redis readiness and CI gates pass

Upstash must be **durable**, not the 72-hour anonymous scratch database. PAYJURY creates one permanent Redis reservation via atomic `SET key record NX`, with **no expiry**. The signed payment is not forwarded unless the store confirms that reservation. Reservation timeouts and uncertain outcomes remain locked. A separate key stores only nonsecret receipt metadata.

The one additional demo session uses the same testnet payer wallet as the earlier accepted case, but a distinct browser/Redis lock `payjury-v2-web-one-take-20261111`; the old payment case and lock are never reset. Only 0.01 **test USDC** at the exact approved merchant/endpoint is allowed.

### Operator acceptance gates

1. Before enabling, CI tests PASS and `GET /api/status` reports `newPaymentEnabled:false`; hosted x402 execute is denied.
2. Configure a **dedicated** Upstash Redis database connected to `payjury` (do not mix with Veyra), and add its server-side variables to Vercel.
3. Enable the switch only after verifying readiness; `GET /api/status` should show `newPaymentEnabled:true`.
4. Read-only `GET /api/v2/x402/session` must return `locked:false` and the expected session ID before wallet action.
5. In Workspace, check the exact quote, payer balance and sign **one** EIP-3009 payment in MetaMask. The browser and Redis permanently lock this attempt. Never try again if the response is unclear.
6. Verify original Base TX/USDC receipt; after a successful packet, the SAME wallet connects GenLayer Studionet 61999, signs one File Case, then one Request AI Decision. Only claim `DECIDED` after verified contract readback.
7. Recheck session status: `locked:true`; duplicate signed execute must fail with a lock error, not result in another paid request.
8. Record the full **real** workflow as a source video (which may take longer than the 45-second submission limit). Edit it to the official maximum without faking signing, processing time or finality.

**Blocked environment note:** Vercel Blob store creation was rejected by the account's usage threshold. A pre-existing Upstash Vercel integration was discovered, but a dedicated live Redis database and its env bindings have not been provisioned. Until they exist, checkout is deliberately disabled; the already verified overview remains available.
