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
- [x] **Operator-observed PAYJURY x402 V2 paid request** completed on Base Sepolia, with original client log `PAYJURY_X402_PAYMENT_AND_TRANSFER_VERIFIED`, 10 confirmations, 0.01 test USDC and public transaction reference (see below). Original HTTP response body was not retained; original evidence is terminal log and transfer receipt; independently fetched public explorer proof is recommended.
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

## PAYJURY payment acceptance — 11 November 2026

The operator completed a single approved PayAI Echo Base Sepolia purchase through the repository's x402 SDK client. Logs showed `PAYJURY_X402_ONE_SHOT_STARTED`, `PAYJURY_X402_REPORTED_SETTLEMENT`, and `PAYJURY_X402_PAYMENT_AND_TRANSFER_VERIFIED` in that order. The final client verification reported matching official USDC Transfer for **10,000 atomic units (0.01 test USDC)** in Base Sepolia block **57288759**, **10 confirmations** at observation.

- Payment TX: [`0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5`](https://sepolia.basescan.org/tx/0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5).
- Buyer: `0xd6b8a3a5eb329410d9504784812b8569afa8c2af`; approved merchant: `0xe3837fe309618ae075dbef0a20735c0615a308e6`.
- Original response-body SHA-256: `714c6f1a9a7ae5699b5736867920fad329b2dfa09f7f1f296e2045ee0e07ab73`. Raw response data was **not** saved; do not claim to have verified response content or a provider-signed delivery attestation.
- Run `BASE_RPC_URL=https://sepolia.base.org npm run case:prepare` to recheck the transfer independently (read-only) and export the deterministic case payload. It does **not** file a GenLayer transaction.
- Still pending: exact case `file_case` and `adjudicate_case` FINALIZED + GenVM SUCCESS, stable `get_case=DECIDED` readback; full product-quality acceptance remains incomplete.

**Critical:** this is a paid Echo service test, not proof of provider misconduct, content quality or a refund. Keep the original one-shot marker; never trigger a second payment to improve the presentation.

## E2E GenLayer verdict confirmed — 2026-11-11 (user-provided Studio/Explorer readback)

PAYJURY's original **0.01 test USDC x402 Base Sepolia paid request** was used to file and adjudicate **one actual GenLayer Studionet 61999 case**, with no second payment:

| Step | Actual evidence | Result |
| --- | --- | --- |
| x402 payment | [Base Sepolia USDC transfer `0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5`](https://sepolia.basescan.org/tx/0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5) | PAYJURY one-shot client independently verified 10,000 atomic USDC and 10 confirmations at observation |
| GenLayer contract | [Deployment `0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e`](https://explorer-studio.genlayer.com/tx/0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e) | FINALIZED / GenVM SUCCESS |
| `file_case` | [GenLayer TX `0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df`](https://explorer-studio.genlayer.com/tx/0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df) | FINALIZED / GenVM SUCCESS / Consensus Accepted; all 11 case fields match locally prepared case |
| Readback after filing | Studio `get_case` reported `status=FILED`, `verdict=PENDING`, exact Base payment hash and claimant `0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb` | FILED confirmed via user-provided live readback |
| `adjudicate_case` | [GenLayer TX `0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057`](https://explorer-studio.genlayer.com/tx/0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057) | FINALIZED / GenVM SUCCESS / Consensus Accepted; Normal execution with 5 initial validators |
| Readback after decision | Studio `get_case` returned `status=DECIDED`, `verdict=ACCEPT` and nonempty `reason` | GenLayer adjudication and persisted verdict observed |

**Case ID:** `pj_3f6b4f29a744db71c63f9acf552d2a19`.

**Actual on-chain reason, transcribed from user-provided `get_case` readback:**

> Evidence supports the narrow claim: an exact 0.01 USDC Base Sepolia quote for the identified merchant was selected, and the client reported an HTTP 2xx response with a nonempty body after payment. Although the raw body was not retained, payload correctness is out of scope and the existence of a nonempty payload is substantiated.

**Scope and limitations (must not overstate):** `ACCEPT` is the **case's actual adjudication verdict**, not a blanket validator certification of the merchant, API data correctness or the PAYJURY product. The original HTTP response bytes were not retained; delivery evidence relied on the client report and locally calculated body SHA-256. The GenLayer execution's `Consensus Accepted` is distinct from the case `verdict=ACCEPT`. This is a complete **single-case testnet E2E happy path**; not evidence of production mainnet operation, refunds, automated filing/settlement, comprehensive adversarial adjudication, or all users' wallet compatibility. The signer `0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb` differed from the Base payer `0xd6b8a3a5eb329410d9504784812b8569afa8c2af`, demonstrating that filing can succeed with distinct wallets; this is not proof of claim ownership/authorization.

**No more paid x402 calls or GenLayer writes are needed for this case.** Preserve these public hashes and the readback as evidence; avoid duplicate signed transactions.
