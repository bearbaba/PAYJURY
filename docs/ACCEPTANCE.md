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

- [x] Repo initialized with x402 quote inspection, exact host allowlist, and official one-shot x402 testnet buyer code (not yet live-executed).
- [x] Read-only Base USDC transfer verification implementation and negative tests.
- [x] Immutable case packet derivation and source of truth labels.
- [x] GenLayer contract source with AI validator adjudication methods.
- [x] Three-step web foundation and fail-closed verdict read.
- [ ] Real x402 paid request **specifically for PAYJURY**, with signed client/facilitator receipt and Base explorer evidence.
- [x] **Operator-provided official Explorer evidence** of Studionet deployment (11 Nov 2026, 12:36:23 Vietnam time), status FINALIZED, GenVM SUCCESS, Consensus Accepted; see transaction and address below. **Source equivalence and independent RPC receipt remain unverified.**
- [ ] Real immutable PAYJURY case `file_case` FINALIZED and independent readback.
- [ ] Real `adjudicate_case` FINALIZED / successful validator receipts and matching `get_case=DECIDED`.
- [ ] End-to-end live video and complete evidence, with no screenshots substituted for chain receipt.

## Operator controls

Payment authorizations and GenLayer writes **must be separately approved**, using dedicated, narrowly funded test wallets. No payment or signing code in the public website. If a transaction hash has been submitted, **never re-sign automatically** after timeout. A historical x402 payment from SpendProof can be used only as a clearly labeled reference, not as a fabricated new PAYJURY acceptance transaction.

## Deployment separation

Base USDC transfers are EVM `eth_*` transactions (Base Sepolia ID 84532 or Base Mainnet ID 8453). PAYJURY adjudication is GenLayer Studionet `gen_*` (ID 61999). They are **different chains**, and a GenLayer LLM alone cannot attest cross-chain payments. `src/payment.mjs` does the independent read-only EVM verification off chain; on-chain case fields are submitted assertions to be cross-checked against that evidence.

**Status:** Foundation implementation prepared; do not call the project E2E PASS until all unchecked live gates are completed.

## Candidate address provided 11 Nov 2026

The operator provided a GenLayer Studio import URL containing the **candidate** address `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8` on Studionet (61999). This is **not yet confirmed deployed or source-matched** solely from the URL. Run `npm run contract:verify` after `git pull --ff-only` in Codespaces. The read-only probe checks `gen_getContractCode` against **finalized** chain state, then SHA-256 compares the decoded source to `contracts/PayJury.py` (normalizing line endings). If it reports `SOURCE_MATCHED_FINALIZED_STATE`, still collect the actual deploy transaction hash and independently inspect `FINALIZED` and GenVM `SUCCESS` before marking deployment accepted. A mismatched source must not be configured in the web.

### Deployment read diagnostic classification

The initial read-only probe for the candidate address returned a generic `PAYJURY_DEPLOYMENT_UNVERIFIED` in Codespaces. The original script suppressed every underlying error and this result cannot distinguish a missing contract from transport or provider problems. The updated probe prints only safe `errorCode`, numeric HTTP status and numeric RPC error code. **Do not redeploy or sign based solely on this message**; inspect the original deployment TX hash in the official Explorer. No live GenLayer deploy or case adjudication has yet been independently verified by this project.

## Actual deployment evidence supplied by operator — 11 November 2026

- **Contract candidate / reported deployed address:** [`0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`](https://explorer-studio.genlayer.com/address/0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8)
- **Deploy transaction:** [`0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e`](https://explorer-studio.genlayer.com/tx/0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e)
- **Explorer-reported state (operator pasted):** Deploy / FINALIZED / GenVM SUCCESS / Consensus Accepted; creator `0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb`; total address transactions 1 at capture.
- **Time:** 11 November 2026 12:36:23 (+07:00) as reported by the operator.
- **Interpretation:** This is credible, specific, public Explorer **deployment evidence**; do not redeploy because `gen_getContractCode` returned RPC `-32603`. The evidence does not itself prove a full source hash match or executed `file_case` / `adjudicate_case`. The transaction page is the primary source for deployment status.

Read-only checks:

```bash
npm run deploy:inspect   # read exact deploy TX with SDK; never signs
npm run contract:verify # separate source-identity check; RPC may return -32603
```

If `deploy:inspect` cannot read the transaction but the Explorer remains finalized-successful, keep the operator's verified Explorer evidence and record the SDK limitation. Do not overwrite the deployment, re-sign, re-deploy, or treat a transport failure as proof of a failed deploy.

**Next acceptance:** obtain an actual x402 payment associated with PAYJURY, then file exactly one matching case and obtain a finalized adjudication readback on this existing contract. No new on-chain write is authorized by this documentation.
