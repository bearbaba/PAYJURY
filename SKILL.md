---
name: payjury-evidence-court
description: Inspect x402 API payment evidence, verify Base USDC transfer, prepare immutable delivery disputes and read GenLayer Intelligent Contract verdicts without inventing success or signing automatically.
---

# PAYJURY agent skill — evidence before verdict

## When to use
Use when a buyer/AI agent paid for an HTTP x402 API response and disputes the delivery quality, format, source completeness or compliance with pre-agreed requirements.

## Capabilities
1. Inspect an actual x402 v2 HTTP 402 `PAYMENT-REQUIRED` quote using `npm run quote`. Exact HTTPS hostname allowlist required. **This never pays.**
2. Validate a user-supplied payment claim by `POST /api/verify` against an independent Base RPC. Require exact network, official USDC token, payer, merchant, amount and transfer transaction with two confirmations. The optional x402 `PAYMENT-RESPONSE` must match. **A merchant-provided header alone is not payment proof.**
3. Produce a `PREPARED_NOT_FILED` case packet with fixed acceptance terms, actual delivered output, supporting evidence, Base transfer reference and deterministic `pj_<sha256>` case ID.
4. Only after an operator explicitly files and adjudicates a real PayJury contract case, read GenLayer `GET /api/verdict?caseId=...` and report the persisted decision with the explicit caveat that the web readback does not replace independently checked GenVM transaction finality.

## Trust boundaries

- x402 on **Base** (Sepolia ID 84532 or mainnet ID 8453) is a separate network from GenLayer **Studionet** (ID 61999).
- GenLayer decides the semantics of the API delivery. The contract does **not** directly verify Base payment proofs.
- Transaction hash, buyer testimony, screenshots, supplied API data and model output are untrusted until checked with the relevant independent source.
- A Base USDC Transfer does not itself prove that an HTTP request caused the transfer or that the paid API returned accurate data.
- A GenLayer AI verdict is not a legally binding judgment, escrow instruction or automatic refund.

## Workflow

### Safe read-only discovery

```bash
# Exact host allowlist; never a local, private or arbitrary internal endpoint.
X402_QUOTE_URL=https://your-verified-api.example/paid \
X402_ALLOWED_HOST=your-verified-api.example npm run quote
```

Requires `X402_QUOTE_INSPECTED_NOT_PAID`. Confirm one supported scheme: `exact`, supported network, official USDC, price <=0.10 USDC. Do not infer a successful purchase.

### Prepare a case

```bash
npm run dev
```

Use the three-step web interface. The website calls `POST /api/verify` with the real transaction details and original delivery evidence. Only an independently verified transfer can yield `PREPARED_NOT_FILED`. If the RPC or receipt is unavailable, report `NOT_VERIFIED` and stop. Never use a fabricated hash or demo fixture to represent a payment.

### Actual payment (separate, explicit approval)

The repository includes `npm run pay:testnet -- --execute`, **but do not invoke it automatically**. It uses a dedicated Base Sepolia key and requires a precise merchant allowlist, EIP-3009 exact 0.01 test USDC quote, and `PAYJURY_CONFIRM_ONE_PAYMENT=I_APPROVE_ONE_TESTNET_X402_PAYMENT`. The script writes a permanent one-shot marker. A timeout, HTTP error, 402 mismatch, or missing settlement receipt must never trigger an automatic second payment. Read [live client safety](docs/X402_LIVE_CLIENT.md).

### GenLayer adjudication

Only with explicit permission from the operator: deploy `contracts/PayJury.py`, file a new `pj_...` case once with the exact packet fields, then adjudicate once. Record real TX hashes and check `FINALIZED` plus successful GenVM receipts. If result is `FILED`, `UNKNOWN`, `UNVERIFIABLE`, conflicting or ambiguous, report that exact state rather than success. Never retry a signed operation solely to repair missing output.

## Output contract

Always provide these separate fields:
- `paymentEvidence`: `QUOTE_ONLY` / `TRANSFER_VERIFIED` / `UNVERIFIED`
- `x402Receipt`: `MATCHED_HEADER` / `UNAVAILABLE` (untrusted merchant metadata)
- `caseStatus`: `NOT_PREPARED` / `PREPARED_NOT_FILED` / `FILED` / `DECIDED`
- `verdict`: `ACCEPT` / `REWORK` / `UNVERIFIABLE` / `UNVERIFIED`
- `chainEvidence`: actual public transaction hashes/explorer links *only when observed and matched*
- `unresolved`: explicit missing proof, failed readback or next safe manual verification

Never collapse quote inspection, token settlement, API response delivery or GenLayer consensus into a single invented `SUCCESS`.

## Safety
Do not request, expose, print or commit private keys, private wallet sessions, `PAYMENT-SIGNATURE`, API bearer tokens, full webhook URLs, or sensitive personal data. No custody, escrow, penalties or refunds.
