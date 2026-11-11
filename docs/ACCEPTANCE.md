# PAYJURY — Verified acceptance and the road to 9.5/10

**Status on 11 November 2026:** First testnet x402 payment → independently checked Base USDC Transfer → GenLayer Studionet 61999 filed case → AI adjudication → persisted `DECIDED/ACCEPT` verdict **completed**. These are operator-provided live client logs and official Explorer transaction records, not CI simulations. The web now supports **read-only case lookup** and separate Base receipt reconciliation. A 9.5/10 score is an **internal goal**, never an official jury result.

## Evidence ledger: actual transactions

| Stage | Official record | Verified observation |
| --- | --- | --- |
| x402 Base Sepolia transfer | [`0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5`](https://sepolia.basescan.org/tx/0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5) | Official Base Sepolia USDC, 10,000 atomic units = **0.01 test USDC**, from 0xd6b8…a8c2af to 0xe383…a308e6; one-shot client recorded 10 confirmations at observation; `case:prepare` independently rechecked receipt |
| Contract deployment | [`0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e`](https://explorer-studio.genlayer.com/tx/0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e) | GenLayer Studionet `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8`, FINALIZED / GenVM SUCCESS |
| GenLayer filing | [`0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df`](https://explorer-studio.genlayer.com/tx/0x5df370a062f304074921e6af521f579cc074ef44a48a28f0174aad729fc418df) | `file_case` FINALIZED / GenVM SUCCESS / Consensus Accepted; on-chain readback `FILED / PENDING` |
| GenLayer AI adjudication | [`0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057`](https://explorer-studio.genlayer.com/tx/0x0e5906d5bb3dcc939f076807289deff7e8c39f4f2b9f1574cb8b67a9dbc13057) | `adjudicate_case` FINALIZED / GenVM SUCCESS / Consensus Accepted, Normal mode with 5 initial validators; `get_case` confirmed `DECIDED / ACCEPT` with reason |

**Immutable case ID:** `pj_3f6b4f29a744db71c63f9acf552d2a19`.

**Actual persisted case reason:** “Evidence supports the narrow claim: an exact 0.01 USDC Base Sepolia quote for the identified merchant was selected, and the client reported an HTTP 2xx response with a nonempty body after payment. Although the raw body was not retained, payload correctness is out of scope and the existence of a nonempty payload is substantiated.”

**Precise meaning:** `ACCEPT` is this case's actual GenLayer verdict that the narrow payment-and-HTTP-receipt claim is supported. It does **not** prove that the underlying API response was accurate, that PAYJURY works in production, or that merchant misconduct occurred. `Consensus Accepted` means validators accepted the GenLayer execution; it is distinct from the case verdict. The stored case's claimant (0x4C7cb…8Dcb) differed from the payer; v1 currently does **not** verify claimant authorization. The raw HTTP body and merchant-signed delivery attestation were **not preserved**. A Base transfer does not cryptographically prove the x402 exchange or response content.

## Scorecard — internal quality rubric (10 points total, 9.5 target)

| Area | Max | Next evidence needed for near-production quality |
| --- | ---: | --- |
| Actual x402 integration | 2.0 | Reproducible exact quote and paid proof, at-most-once execution, safe response capture |
| GenLayer Intelligent Contract | 2.5 | Deployed readback and independent AI consensus, claimant authorization, adversarial verdicts |
| Evidence identity and integrity | 2.0 | Canonical case ID enforcement on-chain, preserved delivery proof, independent payment verification |
| UX and reliability | 1.5 | One-screen wallet-based filing, retry-safe receipt tracking, useful mobile flows |
| Demonstration and reproducibility | 2.0 | Honest complete documentation, public Explorer links, filmed E2E demo, acceptance tests |
| **Total available** | **10.0** | **9.5 is a target only** |

## What passes and what remains

- [x] Official x402 SDK v2 used for a real 0.01 test USDC Base Sepolia HTTP 402 purchase; the paid attempt is permanently one-shot locked.
- [x] Exact token, chain, amount, payer, payee and transfer receipt independently verified off-chain; duplicate matching Transfer events fail closed.
- [x] GenLayer contract deployed, one real `file_case` transaction finalized, `get_case=FILED` observed.
- [x] One real `adjudicate_case` transaction finalized, `get_case=DECIDED / ACCEPT` with stored reason observed.
- [x] Read-only case tracker verifies its own Base RPC receipt separately and discloses whether it could verify; it never signs, pays or files.
- [x] CI covers unit/negative tests and GenLayer Python syntax; CI does not replay any payment or chain writes.
- [ ] **P0:** Claimant authorization. v1 permits a GenLayer signer different from Base payer without proof of delegation. Requires a proposed **new contract version** and fresh acceptance; do not silently change/redeploy deployed v1.
- [ ] **P1:** Evidence capture bound to the HTTP response and terms; a locally computed digest alone is not a provider attestation or proof of content correctness.
- [ ] **P1:** In-browser wallet-approved GenLayer `file_case` and `adjudicate_case` flow with finality proof and no duplicate sends. Current website remains read-only for signing.
- [ ] **P1:** Live, separately evidenced REWORK and UNVERIFIABLE cases, injection/malformed evidence and validator disagreement; do not fabricate outcomes.
- [ ] **P1:** Web deployment and mobile acceptance with public access/security review.
- [ ] Film an actual truthful end-to-end walkthrough with clear chain boundaries and transaction proof.

## Risk boundaries

- GenLayer v1 does **not** directly prove Base transactions and does **not** enforce the off-chain SHA-256 case-ID algorithm. The off-chain tracker reports `NON_CANONICAL_ID` when the fields do not hash to the filed ID; it does not rewrite chain history.
- A fresh Base RPC `eth_getTransactionReceipt` read can be unavailable or temporarily inconsistent; the tracker reports **NOT VERIFIED**, never missing payment or false success.
- The web only calls read-only APIs. It cannot promise to file, decide, refund or escrow a payment.
- Deployment transaction is independently visible. Exact byte-for-byte GitHub-to-deployed-contract source identity was not proven via `gen_getContractCode` because Studio RPC previously failed with error `-32603`. Do not redeploy based on that RPC read defect.
- Preserve the original payment marker. Do not retry the same paid request or either completed GenLayer write just to improve a demo.

[Original case receipt, exact fields and historical runbook](FIRST_PAID_CASE.md) · [Threat model](SECURITY.md) · [x402 client safety](X402_LIVE_CLIENT.md).

## Next upgrade: PAYJURY V2 authorization & one-stop UI

The repository now includes `contracts/PayJuryV2.py` with payer-only direct filing or payer-signed, payment-scoped, revocable delegate authorization. It recomputes case IDs from canonical fields and permits at most one case per referenced transfer **within V2**. It also adds a guarded EIP-1193 wallet workflow to the same website, disabled until a verified V2 contract address exists. Offline security tests are not evidence of V2 deployment or successful wallet writes.

**V2 live acceptance is NOT complete.** Verify actual deploy/GenVM result, authorize/deauthorize from the payer account, reject an unauthorized signer, file exactly one new legitimate case, then check persisted verdict readback. Do not reuse the completed V1 payment or do speculative x402 signing. [Acceptance runbook](V2_ONE_STOP.md).

## Addendum — GenLayer V2 real on-chain delegation acceptance (2026-11-11)

Deployed V2 `0x0a6171C6a580c58d999a251436CE7c63FFc3dc31` already passed read-only deployment, source-content comparison and browser wallet connection checks. The owner then completed **real GenLayer V2 onchain permission changes**, scoped only to a clearly synthetic reference (NOT a paid Base transfer):

| Stage | Evidence | Actual result |
| --- | --- | --- |
| Before grant | Contract `can_file_for` read | `false` |
| Grant `set_delegate(...,true)` | [TX `0x87fe1dae...c861538`](https://explorer-studio.genlayer.com/tx/0x87fe1daef62b203e6fe3bd470a4f09b95f73eb2838290901458a227f3c861538) | FINALIZED / GenVM SUCCESS; readback **`true`** |
| Revoke `set_delegate(...,false)` | [TX `0xe87e736f...faf6340c`](https://explorer-studio.genlayer.com/tx/0xe87e736f91575e059f730ff4506499be2e76056b6dc1b72b1589d009faf6340c) | FINALIZED / GenVM SUCCESS; readback **`false`** |

**V2 File Case → AI Adjudication → DECIDED is still NOT live accepted.** Existing independent Base Mainnet payment candidate has been identified in the user's SpendProof [Kite paid acceptance](https://github.com/bearbaba/SpendProof/blob/main/docs/KITE_PAID_ACCEPTANCE.md). PAYJURY `npm run v2:candidate` independently inspects its actual Base USDC transfer and V2 permission/reuse state without any payment or signing. Kite Passport Gmail/passkey Approval alone is NOT the same as EIP-1193 payer EOA signing authority enforced in V2. Do not report a real filing or AI verdict until final signed TX evidence and `get_case` readbacks exist.
