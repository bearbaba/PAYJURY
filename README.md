# PAYJURY

**Payment proves the transfer. GenLayer judges the delivery.**

PAYJURY is a non-custodial, evidence-first dispute lab for paid AI/API services. It connects the **x402 HTTP payment standard** with **GenLayer Intelligent Contracts** through a minimal **Pay → Dispute → Verdict** experience.

> **V2 deployment evidence observed (not yet wallet-accepted):** PAYJURY V2 source adds payer/delegate authorization, canonical case IDs and replay protection. A browser wallet workflow is implemented behind a **disabled deployment gate** until the reported V2 deployment and contract methods are independently verified. See [V2 One-Stop Plan & Acceptance](docs/V2_ONE_STOP.md). No V2 write has yet been signed.\n\n> **Live acceptance, 11 Nov 2026:** The first **testnet x402 → Base USDC Transfer → GenLayer case filing → AI verdict** was completed: `DECIDED / ACCEPT` with public transactions. The website is a **read-only case tracker** and proof builder, not yet an integrated signer. The original HTTP response bytes were not preserved; claimant authorization and production readiness remain open. **9.5/10 is an internal quality target, not a jury score.**

## Why PAYJURY

An HTTP 402 payment is only half the story. A machine can pay an API and receive wrong, incomplete or misleading data. PAYJURY makes that disagreement inspectable:

1. **PAY** — Inspect the actual x402 v2 `PAYMENT-REQUIRED` challenge (exact Base USDC options only). Verify the USDC transfer independently from a Base RPC receipt. Optional `PAYMENT-RESPONSE` is checked against the same transaction, but never trusted by itself.
2. **DISPUTE** — Bind payment reference, buyer, merchant, API endpoint, immutable acceptance terms, delivery and evidence into a deterministic case ID. The resulting packet is explicitly `PREPARED_NOT_FILED`.
3. **VERDICT** — The original contract has been deployed to **GenLayer Studionet 61999** and has actually returned `DECIDED / ACCEPT` for one paid case. The web can look up any valid case ID with `/api/case` and separately recheck Base settlement. It never signs or files cases; GenLayer TX finality still requires Explorer proof.

No OpenServ Agent runtime or Human Assistance dependency is involved.

## What the repository actually implements

| Component | Evidence boundary |
| --- | --- |
| `src/x402.mjs` | Real x402 HTTP 402 discovery. **Never pays**. Rejects unsafe schemes, token/network mismatches and quotes over 0.10 USDC. |
| `src/payment.mjs` | Independent on-chain Base USDC `Transfer` event verification: chain ID, receipt status, exact asset, payer, payee, amount, at least 2 confirmations. |
| `decodeX402PaymentResponse` | Checks merchant/facilitator-provided header against transaction ID and network. **A header is not a chain proof.** |
| `src/server.mjs` | Read-only verification API and optional GenLayer `get_case` read. Never holds a signing key. |
| `contracts/PayJury.py` | Immutable filing and independent AI validator adjudication for `ACCEPT`, `REWORK`, `UNVERIFIABLE`. The GenLayer contract **does not independently prove Base settlement**. |
| `web/` | Responsive proof builder and read-only live case tracker. Clear separation between GenLayer readback, independently verified Base receipt, and unverified provenance. |
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

### Track a real filed case without a wallet

Set `GENLAYER_CONTRACT_ADDRESS=0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8` in your private `.env` (provided as the safe public default in `.env.example`). Keep `BASE_RPC_URL=https://sepolia.base.org` for the first verified test. Start `npm run dev` and use the **On-chain Case Tracker** with Case ID `pj_3f6b4f29a744db71c63f9acf552d2a19`, or click **Load verified testnet case**. This performs only GenLayer and Base **reads**. `/api/case` distinguishes contract readback, deterministic ID match and verified vs unavailable Base receipt; it does not infer client authorization or transaction finality.

The older three-step proof builder remains **read-only**: to file new cases, authorized GenLayer wallet writes still take place separately. The first paid case is complete and **must not** be re-submitted.


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

The official x402 SDK in `scripts/pay-x402-testnet.mjs` has already executed **one authorized 0.01 Base Sepolia test USDC** payment on 11 Nov 2026 (public TX below). Its permanent one-shot marker must **never be removed or bypassed**. The public website never pays or signs. Read [Live x402 client safety](docs/X402_LIVE_CLIENT.md).

## Agent workflow & presentation

- [PAYJURY agent skill](SKILL.md): quote → independent payment verification → immutable dispute → GenLayer readback, with fail-closed response states.
- [45-second truthful demo guide](docs/DEMO_45S.md): storyboard and real transaction proof requirements.

## Existing Studionet contract — keep v1 stable

The deployed PAYJURY v1 contract is `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8` on Studionet 61999. The [deployment transaction](https://explorer-studio.genlayer.com/tx/0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e) and its subsequent successful filing and adjudication establish real execution. `npm run contract:verify` may still report finalized-code-read error `-32603` from a GenLayer RPC issue; that does **not** disprove the deployment. An exact source hash match remains unverified. Do **not** redeploy v1 or repeat its transactions.

## Operator-observed PAYJURY deployment — 11 Nov 2026

The operator provided an [official Studionet Explorer deployment record](https://explorer-studio.genlayer.com/tx/0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e): **Deploy / FINALIZED / GenVM SUCCESS / Consensus Accepted** for contract [`0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`](https://explorer-studio.genlayer.com/address/0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8). The first `gen_getContractCode` source inspection returned JSON-RPC internal error `-32603`, which is **not** a failed deployment verdict. Do not redeploy on the strength of that error.

```bash
npm run deploy:inspect
```

This new script reads the *existing deployment transaction only*, checks whether the SDK returns FINALIZED/GenVM success, compares any exposed recipient/address, and never signs. A failed lookup is not proof the Explorer is wrong. A deploy PASS **does not** establish that the deployed source exactly matches GitHub or that PAYJURY adjudication has completed. See [acceptance evidence](docs/ACCEPTANCE.md).

## New: read-only x402 payer preflight

After configuring an explicit Base Sepolia provider, exact merchant and **a dedicated testnet wallet secret in Codespaces Secrets**, run `npm run pay:preflight` before any payment. It reads the real x402 V2 quote, checks `eth_chainId=84532`, queries the official test USDC `balanceOf`, and refuses to authorize signing if test USDC is less than 0.01, the merchant differs, or the network is wrong. Never paste secrets into the chat or commit them.

The separately approved paid CLI now logs `PAYJURY_X402_REPORTED_SETTLEMENT` with a public transaction hash as soon as it receives a matching PAYMENT-RESPONSE, **before** limited read-only receipt polling. A pending confirmation does not trigger another signed payment. The one-shot marker remains permanent even if readback times out. See [live client runbook](docs/X402_LIVE_CLIENT.md).

## Re-check the historical paid case without paying again

```bash
BASE_RPC_URL=https://sepolia.base.org npm run case:prepare
```

This command rechecks the existing verified Base payment and exports the original 11 GenLayer case fields locally. The case is **already filed and decided**, so the output is archival evidence, **not permission to file or adjudicate again**. See [the completed case runbook](docs/FIRST_PAID_CASE.md).

## First full x402 → GenLayer AI verdict — VERIFIED TESTNET E2E

On **11 November 2026**, PAYJURY processed one genuine 0.01 test USDC x402 paid request on Base Sepolia, verified the USDC transfer, filed the case on GenLayer Studionet, and reached a persisted **`DECIDED / ACCEPT`** AI verdict under Normal consensus (5 initial validators). This establishes the **first one-case testnet happy path**, not production readiness or API payload quality verification.

- **Base payment:** [`0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5`](https://sepolia.basescan.org/tx/0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5)
- **GenLayer filing:** [`0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df`](https://explorer-studio.genlayer.com/tx/0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df) — FINALIZED / SUCCESS
- **AI adjudication:** [`0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057`](https://explorer-studio.genlayer.com/tx/0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057) — FINALIZED / SUCCESS / Consensus Accepted
- **Case:** `pj_3f6b4f29a744db71c63f9acf552d2a19` — Studio readback: `DECIDED`, `ACCEPT` with recorded rationale. The verdict evaluated the narrow payment-and-HTTP-receipt claim; original API response body was not retained.

[Full evidence ledger, verdict rationale, and limits](docs/ACCEPTANCE.md).

## PAYJURY V2 Studionet deployment — first public record\n\nOn **11 November 2026**, the owner supplied [this V2 deployment TX](https://explorer-studio.genlayer.com/tx/0x1fd845e9574e6c0956d5fd03afac8c7c70e75ea6532d4095fae3aa1276045f98) on Studionet 61999: **FINALIZED / GenVM SUCCESS / Consensus Accepted**, contract `0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`. This confirms deployment evidence, **not** the exact deployed source, `version()` readback or signed V2 case acceptance. To verify without a wallet or signature:\n\n```bash\nnpm run v2:verify\n```\n\nExpected result after independent reads: `V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS`; if read-only RPC fails, inspect original Explorer TX and `version()` in Studio. Only after verification, configure `GENLAYER_V2_CONTRACT_ADDRESS` in private `.env`. No V2 signing and no repeat of V1 x402 payment are necessary for this check.\n\n## One-stop wallet workflow — PAYJURY V2 (deployed; authorization pending live acceptance)

The website now has a guarded workflow for **Paste Base TX → Detect exact USDC transfer → Supply API terms and delivery evidence → Verify → Review → Connect GenLayer wallet → File → AI verdict**. One click fetches the receipt and fills payer/payee/token/amount automatically, but never infers API delivery or an x402 purchase from a USDC transfer alone. V2 is distinct from V1 and **not yet deployed**. Signing controls remain inactive until a verified new V2 address is configured with `GENLAYER_V2_CONTRACT_ADDRESS`. Direct payer signatures or payer-signed on-chain delegation are enforced inside the proposed V2 contract; unauthenticated third parties are rejected. No private key is stored in the browser app or backend. Browser wallet actions will need live Studio acceptance once V2 is actually deployed.

**Do not reuse the historic V1 payment or V1 contract address for a V2 case.** See [V2 authorization and deployment acceptance](docs/V2_ONE_STOP.md).

### Auto-detect a Base payment without signing

In the web case form, select Base Sepolia (or Base Mainnet with a matching configured RPC), paste a public transaction hash and click **Detect USDC transfer from TX**. The read-only `/api/inspect` endpoint requires a *single unambiguous* official USDC `Transfer` log and at least 2 confirmations, then automatically populates sender, recipient, token and atomic amount. It rejects ambiguous, missing, failed, wrong-chain or above-cap receipts. You still enter the paid API endpoint, original acceptance terms, delivery and supporting evidence. Then **Verify transfer & prepare case** independently rechecks the receipt; wallet signing remains strictly V2-gated and user initiated.
