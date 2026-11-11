# PAYJURY — First independently verified x402 payment → GenLayer Studio case

> **COMPLETED CASE — DO NOT REPLAY:** `pj_3f6b4f29a744db71c63f9acf552d2a19` was already filed via [GenLayer TX `0x5df370a0...`](https://explorer-studio.genlayer.com/tx/0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df) and adjudicated via [GenLayer TX `0x0e5906d5...`](https://explorer-studio.genlayer.com/tx/0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057), with a persisted `DECIDED / ACCEPT` readback. The historical Stage 2 below describes **completed actions**, not a request to send new transactions. There is no reason to pay or sign again for this case.\n\n
## Recorded operator evidence, 11 November 2026

One paid request was executed by the PAYJURY Codespaces one-shot x402 CLI against [PayAI Echo Base Sepolia paid content](https://x402.payai.network/api/base-sepolia/paid-content). The paid client reported `PAYJURY_X402_REPORTED_SETTLEMENT` followed by `PAYJURY_X402_PAYMENT_AND_TRANSFER_VERIFIED`.

- Base Sepolia (84532) TX: [`0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5`](https://sepolia.basescan.org/tx/0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5).
- Payer: `0xd6b8a3a5eb329410d9504784812b8569afa8c2af`
- Merchant: `0xe3837fe309618ae075dbef0a20735c0615a308e6`
- Official Base Sepolia USDC: `0x036cbd53842c5426634e7929541ec2318f3dcf7e`
- Amount: **10,000 atomic units = 0.01 USDC testnet**.
- Client-reported Base block: **57288759**, **10 confirmations** at observation.
- Client-calculated response-body SHA-256: `714c6f1a9a7ae5699b5736867920fad329b2dfa09f7f1f296e2045ee0e07ab73`.
- Original HTTP response content was **not saved**. Only the operator's locally computed hash is available. Do **not** assert API body schema, exact payload or correctness. A merchant HTTP response and a transfer do not themselves prove service quality, nor legal liability.
- Independent read-only Base receipt verifier can recheck chain ID, successful TX, token contract and exact Transfer event. The operator's log is strong source evidence but this report is **not** yet an independently attached signed API-response attestation.

## Stage 1 — Prepare exactly one case, read only

```bash
cd /workspaces/PAYJURY
git pull --ff-only
BASE_RPC_URL=https://sepolia.base.org npm run case:prepare
```

Expected: `PAYJURY_CASE_PREPARED_READ_ONLY` with `transferVerified=BASE_USDC_TRANSFER_VERIFIED`, public transaction and a stable `caseId`. It writes `out/pj_<hash>.json` locally, not to Git. This command **cannot pay, cannot sign, and does not file a GenLayer case**.

View the complete form arguments locally:

```bash
ls -1 out/pj_*.json
node -e 'const fs=require("fs");const p=fs.readdirSync("out").filter(x=>/^pj_[0-9a-f]{32}\.json$/.test(x));if(p.length!==1){console.error("Expected one case file");process.exit(1)}const r=JSON.parse(fs.readFileSync("out/"+p[0]));console.log(JSON.stringify(r.fileCase.fields,null,2));'
```

Only submit the fields of **this actual packet** into [the previously deployed PAYJURY GenLayer Studio contract](https://studio.genlayer.com/?import-contract=0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8). Do not paste private keys, headers containing signed payment authorizations or secrets into Studio.

## Stage 2 — GenLayer Studio (historical completed write actions, not to be replayed)

Read the `fileCase.fields` object, then open `file_case`. Enter the exact **11** displayed fields, in the order shown, and confirm the contract address is `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`. One operator-controlled signed filing maximum. Record the exact transaction hash.

Before any `adjudicate_case` transaction, confirm the filing TX reached **FINALIZED / GenVM SUCCESS**, and `get_case(case_id)` returns `FILED` with exactly the submitted TX hash, merchant, terms, delivery, and evidence. If `get_case` fails or the transaction result is uncertain, **DO NOT retry file_case**; inspect existing TX in Explorer.

Only after an independently observed `FILED` state, manually call `adjudicate_case(case_id)` **once**. Again record the actual TX and check **FINALIZED / GenVM SUCCESS / consensus outcome**. Finally call `get_case(case_id)` and confirm `DECIDED` with `ACCEPT`, `REWORK`, or `UNVERIFIABLE`; all three outcomes can be valid depending on validator judgments. **Never fabricate a favorable verdict.**

If the execution is finalized with a GenVM error or a pending/ambiguous result, stop, preserve the TX and inspect the readback. Do not send duplicate writes to chase an acceptance rating.

## What this first case actually demonstrates

The first case intentionally adjudicates **a narrow paid Echo delivery receipt**, not merchant fraud or content accuracy. Both the original successful HTTP response and the on-chain transfer were operator-observed, but the response bytes were not captured. This evidence gap must be disclosed when discussing validator results; `UNVERIFIABLE` is a potentially correct decision.

A later, genuinely disputed API purchase must preserve its original acceptance terms and safely captured response bytes or separately verifiable content digest/attestation *at the time of the authorized purchase*. Do not pay again or replay the existing request merely to create a more dramatic demo.

**Never repeat the original `npm run pay:testnet -- --execute` call. Never remove its `.payjury-payment-attempt-*.lock`.**
