# PAYJURY — Quality and live acceptance gates

**Target: 9.5/10, self-assessed product quality.** This document is not an official score. A good source repository and green CI do not establish successful paid x402 → GenLayer end-to-end operation.

## 9.5/10 rubric (target, not current result)

| Metric | Max | Concrete evidence required |
| --- | ---: | --- |
| Actual x402 integration | 2.0 | Original HTTP 402 challenge, actual signed x402 authorization from an approved payer, successful facilitator payment response, public transaction and receipt. No fake checkout. |
| GenLayer Intelligent Contract | 2.5 | Deployed PayJury contract, immutable case, `file_case` and `adjudicate_case` actual FINALIZED/SUCCESS transactions, independently checked GenVM receipts, `get_case` DECIDED. |
| End-to-end binding | 2.0 | Same chain TX, merchant, price, buyer, original terms and immutable delivery evidence referenced by a single case. No substitutions or repeat payment. |
| Interface and reliability | 1.5 | Pay/Dispute/Verdict mobile and desktop workflows, failure messaging, no false success, at-most-once signing if a signer is later introduced. |
| Storytelling and reproducibility | 2.0 | Clear GitHub, skill or runbook, public explorer URLs, reproducible demo, video <=45 sec under applicable mission rules. |
| **Target total** | **9.5/10** | **All gates verifiably evidenced before claiming success.** |

## Current acceptance ledger

- [x] Repo initialized with x402 quote inspection and exact host allowlist.
- [x] Read-only Base USDC transfer verification implementation and negative tests.
- [x] Immutable case packet derivation and source of truth labels.
- [x] GenLayer contract source with AI validator adjudication methods.
- [x] Three-step web foundation and fail-closed verdict read.
- [ ] Real x402 paid request **specifically for PAYJURY**, with signed client/facilitator receipt and Base explorer evidence.
- [ ] Deploy `PayJury.py` to Studionet and verify source, ABI and address.
- [ ] Real immutable PAYJURY case `file_case` FINALIZED and independent readback.
- [ ] Real `adjudicate_case` FINALIZED / successful validator receipts and matching `get_case=DECIDED`.
- [ ] End-to-end live video and complete evidence, with no screenshots substituted for chain receipt.

## Operator controls

Payment authorizations and GenLayer writes **must be separately approved**, using dedicated, narrowly funded test wallets. No payment or signing code in the public website. If a transaction hash has been submitted, **never re-sign automatically** after timeout. A historical x402 payment from SpendProof can be used only as a clearly labeled reference, not as a fabricated new PAYJURY acceptance transaction.

## Deployment separation

Base USDC transfers are EVM `eth_*` transactions (Base Sepolia ID 84532 or Base Mainnet ID 8453). PAYJURY adjudication is GenLayer Studionet `gen_*` (ID 61999). They are **different chains**, and a GenLayer LLM alone cannot attest cross-chain payments. `src/payment.mjs` does the independent read-only EVM verification off chain; on-chain case fields are submitted assertions to be cross-checked against that evidence.

**Status:** Foundation implementation prepared; do not call the project E2E PASS until all unchecked live gates are completed.
