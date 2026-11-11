# PAYJURY

**Payment proves the transfer. GenLayer judges the delivery.**

PAYJURY is a non-custodial, evidence-first dispute lab for paid AI/API services. It connects the **x402 HTTP payment standard** with **GenLayer Intelligent Contracts** through a minimal **Pay → Dispute → Verdict** experience.

> **Build status: foundation, not a verified E2E demonstration.** The web UI, read-only Base settlement verifier, and guarded official x402 SDK payer CLI are implemented, but a PAYJURY-specific paid transaction is not yet verified. A dedicated GenLayer contract source is included but is **not deployed by this repository**. An independently verified payment plus a finalized GenLayer case is still required before making full partner-demo claims. **9.5/10 is an internal quality target, not a confirmed jury score.**

## Why PAYJURY

An HTTP 402 payment is only half the story. A machine can pay an API and receive wrong, incomplete or misleading data. PAYJURY makes that disagreement inspectable:

1. **PAY** — Inspect the actual x402 v2 `PAYMENT-REQUIRED` challenge (exact Base USDC options only). Verify the USDC transfer independently from a Base RPC receipt. Optional `PAYMENT-RESPONSE` is checked against the same transaction, but never trusted by itself.
2. **DISPUTE** — Bind payment reference, buyer, merchant, API endpoint, immutable acceptance terms, delivery and evidence into a deterministic case ID. The resulting packet is explicitly `PREPARED_NOT_FILED`.
3. **VERDICT** — Deploy `contracts/PayJury.py` to **GenLayer Studionet (chain ID 61999)**. Once a case is actually filed and adjudicated, the web can perform a read-only `get_case`. A `DECIDED` readback alone does not replace explicit TX finality/GenVM receipt checks.

No OpenServ Agent runtime or Human Assistance dependency is involved.

## What the repository actually implements

| Component | Evidence boundary |
| --- | --- |
| `src/x402.mjs` | Real x402 HTTP 402 discovery. **Never pays**. Rejects unsafe schemes, token/network mismatches and quotes over 0.10 USDC. |
| `src/payment.mjs` | Independent on-chain Base USDC `Transfer` event verification: chain ID, receipt status, exact asset, payer, payee, amount, at least 2 confirmations. |
| `decodeX402PaymentResponse` | Checks merchant/facilitator-provided header against transaction ID and network. **A header is not a chain proof.** |
| `src/server.mjs` | Read-only verification API and optional GenLayer `get_case` read. Never holds a signing key. |
| `contracts/PayJury.py` | Immutable filing and independent AI validator adjudication for `ACCEPT`, `REWORK`, `UNVERIFIABLE`. The GenLayer contract **does not independently prove Base settlement**. |
| `web/` | Responsive three-step case interface. Never claims a prepared packet is filed or a placeholder verdict is real. |
| `tests/` | Forged receipt, wrong chain, bad amount, conflicting quote and no-RPC fail-closed tests. |

## Local start

Node.js **22+**, Python 3 for contract syntax check.

```bash
git clone https://github.com/bearbaba/PAYJURY.git
cd PAYJURY
npm install
npm run check
cp .env.example .env
npm run dev
```

Open **http://127.0.0.1:4173**.

The example `BASE_RPC_URL` points to **Base Sepolia**. To verify a Base mainnet transfer, configure a trusted HTTPS **Base mainnet** RPC instead; the code checks `eth_chainId` and refuses mismatched networks. The page does not create or send a payment. You must obtain real transaction evidence independently.

### Read a live x402 quote without paying

```bash
X402_QUOTE_URL=https://your-provider.example/paid-api \
X402_ALLOWED_HOST=your-provider.example \
npm run quote
```

This performs exactly one **GET**, expects **HTTP 402**, parses a v2 `PAYMENT-REQUIRED` header, and filters `exact` USDC offers capped at 0.10 USDC. It never sends `PAYMENT-SIGNATURE`, never retries with payment and never uses a wallet. An endpoint may still process a free GET; use a trusted provider and a safe public resource.

### Read a GenLayer verdict

Set `GENLAYER_CONTRACT_ADDRESS` to an **actually deployed PayJury contract**, not the old SERVJURY address. GenLayer reads use `genlayer-js` **1.1.8** against stable Studionet **61999**. Deploy and file via Studio only after reviewing [the acceptance gates](docs/ACCEPTANCE.md). The website deliberately has no server-side signing capability.

## Security and outcome definitions

- `X402_QUOTE_INSPECTED_NOT_PAID` — quote discovery only.
- `BASE_USDC_TRANSFER_VERIFIED` — exact ERC-20 Transfer proved by trusted chain RPC. Not proof of a correct API response or even exclusive x402 causation.
- `X402_RESPONSE_MATCHED` — untrusted x402 settlement header claims the same network and transaction.
- `PREPARED_NOT_FILED` — immutable case packet ready for human review; **no GenLayer write took place**.
- `FILED` — contract stores a case, not a verdict.
- `DECIDED` — contract readback reports an AI-adjudicated verdict; verify actual GenVM execution and transaction finality separately before claiming a full E2E pass.

No escrow, bridge, automatic refund, permissionless debt collection, or legally binding arbitration is implemented. Wallet keys are never passed to the web UI; only a separately approved, dedicated testnet payer CLI uses a key. See [Security](docs/SECURITY.md).

## Partner and developer references

- [x402 Foundation HTTP standard](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md)
- [Official x402 SDK](https://github.com/x402-foundation/x402)
- [GenLayer Studio — Studionet 61999](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio)
- [PAYJURY acceptance gates](docs/ACCEPTANCE.md)

## Optional real x402 payment client

The official x402 SDK is wired in `scripts/pay-x402-testnet.mjs`, with exact Base Sepolia USDC, an approved merchant, **0.01 test USDC maximum**, EIP-3009-only policy and a permanent one-shot marker. This CLI **may spend actual testnet USDC** and has **not** been executed as PAYJURY acceptance. The public web never pays or signs. Read [Live x402 client safety](docs/X402_LIVE_CLIENT.md) before any live attempt.

## Agent workflow & presentation

- [PAYJURY agent skill](SKILL.md): quote → independent payment verification → immutable dispute → GenLayer readback, with fail-closed response states.
- [45-second truthful demo guide](docs/DEMO_45S.md): storyboard and real transaction proof requirements.

## Verify a proposed Studionet deployment (read-only)

The candidate Studio import URL supplied on 11 Nov 2026 contains address `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`. This is a **candidate, not yet verified by this repository**. Run:

```bash
npm run contract:verify
```

The command checks finalized contract code via the official Studionet RPC (`gen_getContractCode`) and compares its source to the repository's `contracts/PayJury.py`. It performs **no signed actions**. `SOURCE_MATCHED_FINALIZED_STATE` means the code is visible at that address in finalized chain state. It is **not** a substitute for checking the original deployment TX hash / GenVM success in the Explorer. A mismatched or unavailable code read must not unlock GenLayer writes or be reported as deployed.

Only after verifying both source and deployment TX should you set `GENLAYER_CONTRACT_ADDRESS` locally in `.env` and restart the web server; the web remains read-only.

### If deployment verification is unverified

Run `npm run contract:verify` after pulling the latest main branch. The CLI prints a **sanitized** `PAYJURY_DEPLOYMENT_DIAGNOSTIC` with `errorCode`, optional numeric `httpStatus` and `rpcCode`. It never prints raw RPC response messages, credentials, transaction payloads or private data. `RPC_METHOD_UNSUPPORTED` means the requested method was unavailable; `RPC_HTTP_ERROR` means HTTP rejected the call; `RPC_REJECTED_FINALIZED_CODE_READ` means the RPC rejected the query (which may mean missing/unfinalized contract or other provider failure). No single such code proves the contract failed deployment. A confirmed code match still requires a real deployment transaction and GenVM receipt.
