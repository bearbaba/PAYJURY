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
