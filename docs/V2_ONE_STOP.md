# PAYJURY V2 — One-stop UX and payer-authorized disputes

> **DEPLOYMENT UPDATE — 11 NOV 2026:** Owner-supplied [GenLayer TX `0x1fd845e9...76045f98`](https://explorer-studio.genlayer.com/tx/0x1fd845e9574e6c0956d5fd03afac8c7c70e75ea6532d4095fae3aa1276045f98) shows Studionet deployment **FINALIZED / GenVM SUCCESS / Consensus Accepted** for `0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`. This satisfies the reported deployment transaction milestone, but the exact deployed-source equivalence, `version()` and rights readback and V2 signed-case acceptance remain **unverified**. Run `npm run v2:verify` to inspect read-only. **Never redeploy based only on an RPC read failure.**\n\n
**As of 11 November 2026:** V1 payment, filing and `ACCEPT` verdict were genuinely observed on testnets. **V2 has an owner-reported finalized deploy transaction, but it has NOT yet passed independent method/source verification or signed-case acceptance.** Keep V1 address `0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8` for historical readback. Never replace it with V2 source or redeploy V1 to chase a new hash.

## Why a new contract

V1 accepts a different `file_case` signer from the Base payer without requiring authorization. This is valid for the historical demo and remains permanent evidence, but cannot establish that the claimant represents the buyer. V2 closes that filing authorization gap with **GenLayer wallet identity**:

- **Direct payer:** the signer address `gl.message.sender_address` exactly matches the Base payment `payer`.
- **Delegate:** the payer signs **`set_delegate(network, tx_hash, delegate, true)` on the V2 contract**, which records authorization under the payer address. The delegate wallet can then file in their own name. The payer can sign **`set_delegate(network, tx_hash, delegate, false)`** to revoke permission for future filings relating to **that exact network and payment TX**, without affecting unrelated payments.
- **Unapproved signer:** cannot file. Replaying an existing case or another case about the same payment is rejected. The original case ID is recomputed inside the contract using canonical SHA-256 of the 10 payment/delivery fields.
- A third-party signer **cannot authorize itself** for someone else's payer identity. The same EOA wallet address is meaningful on Base and GenLayer, but this does not prove the cross-chain *payment* inside GenLayer; PAYJURY still uses independent off-chain Base receipts.

If Base payer uses a wallet that cannot sign on GenLayer, they cannot create an on-chain V2 delegation using this method. That requires separate authorization design and security review, **not** a silent fallback to allowing anyone.

## One-stop website architecture

The existing website offers **paste Base TX → auto-detect exact USDC Transfer → provide paid endpoint/terms/delivery evidence → verify → review fields → connect wallet → check V2 filing permission → authorize a single filing → track finality → request verdict**. Ambiguous receipts are never auto-filled, and API delivery is not inferred from a transfer. All signing remains user initiated through an EIP-1193 wallet and the `genlayer-js` SDK. The SDK is bundled locally; no remote JS/CDN or server-side private key is used. Before connecting a wallet or signing, the browser reads `version()` and refuses a contract that does not report the exact V2 marker. This is an interface sanity check, **not a cryptographic source-code attestation**.

`npm run dev` produces `web/studio-wallet.bundle.js` via local esbuild then starts the read-only server. `/api/status` exposes the *configured* V2 address, never a proof of deployment. `/api/case?version=v1` continues showing historic v1 cases; `/api/case?version=v2` targets ONLY a separately configured V2 contract, checks the GenLayer record identity and independently rechecks its Base USDC Transfer. A GenLayer `DECIDED` read does not independently audit the originating GenLayer TX finality; the wallet adapter checks TX status and GenVM success before acknowledging a signed write.

**Critical anti-replay:** The browser writes a persistent per-case action lock before asking its wallet to submit; when a TX ID is available it stores it and only polls **read-only**. An unknown submission or RPC timeout must never be resubmitted merely to clear a UI error. Only a wallet's explicit EIP-1193 rejection can clear an attempt lock. On success, the web reads the exact V2 case ID before advancing.

**Historic V1:** Original 0.01 USDC testnet payment `0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5` was already filed and decided. Browser disallows V2 re-filing that known paid transaction; no payment replay is needed for V2 validation.

## Deployment gate (deployment TX observed; readback and live authorization pending)

1. Review `contracts/PayJuryV2.py` and offline Python tests `tests/test_contract_v2.py`; verify `npm run check`, `npm run build:web` and GitHub Actions PASS.
2. **Deployment already completed:** inspect the reported TX and the contract address above. Do not deploy again. Never replace V1 at its old address.
3. Run `npm run v2:verify` to independently check the reported deploy TX, version marker and payer-versus-stranger authorization behavior without signing. Confirm real deployment TX FINALIZED/GenVM SUCCESS and the V2 address. Confirm the deployed methods `version`, `set_delegate`, `can_file_for`, `filing_status`, `file_case`, `adjudicate_case`, `get_case`. The read-only `version()` must return exactly `PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1`. Also verify actual source identity if RPC permits; a version marker alone can be imitated.
4. Only after deployment and V2 method checks pass, set `GENLAYER_V2_CONTRACT_ADDRESS=0x0a6171C6a580c58d999a251436CE7c63FFc3dc31` in private `.env` and restart the website. **Never use the V1 address as the V2 address.**
5. On a brand-new **independently verified payment reference** (do not re-pay the old test to fabricate coverage), verify source data; confirm payer wallet files directly and unauthorized stranger is rejected. For the delegation path, have the payer sign **set_delegate(..., true)**, confirm its FINALIZED/SUCCESS and `can_file_for` return `true`. Then delegate files a different legitimate case. Finally payer signs revocation and confirms `can_file_for(...)=false`.
6. Independently check onchain finalized `file_case`, `get_case=FILED`, finalized `adjudicate_case`, and `get_case=DECIDED` with a real case verdict. Do not demand a specific favorable result.

**Still pending:** actual V2 GenVM execution, MetaMask/wallet end-to-end browser acceptance, full delivery-body evidence integrity, alternate outcomes REWORK and UNVERIFIABLE, multi-wallet compatibility testing, and external security review. CI tests are **offline simulations**, not GenLayer Studio acceptance.

## Scope and disclaimer

V2 does **not** bridge assets, escrow USDC, refund buyers or recover funds. No GenLayer Intelligent Contract can infer that a Base USDC Transfer equates to correct API delivery from wallet addresses alone. Current case data is plaintext and public onchain; avoid personal information, credentials and raw private API responses. For production, separately authenticate and anchor a minimal redacted response commitment, and design stronger provider attestations and secure evidence access.

See [live V1 acceptance ledger](ACCEPTANCE.md), [wallet/receipt security model](SECURITY.md), and [historical paid case](FIRST_PAID_CASE.md).

**SDK source read correction (2026-11-11):** `genlayer-js@1.1.8` expects `getContractCode(contractAddress)` with a bare address string, not `{address: contractAddress}`. An earlier read-only inspection mistakenly wrapped the address in an object, producing `psycopg2.ProgrammingError: can't adapt type 'dict'` at `gen_getContractCode`. This is a verifier argument bug, **not** proof of a failed deployment. Re-run `npm run v2:verify` with the corrected script. Do not enable wallet writes if the deployed source is reported mismatched. A source read failure leaves source identity unverified; it does not justify redeployment.

## Source-difference investigation (11 Nov 2026)

After correcting the SDK call signature, the owner observed `sourceIdentity=SOURCE_TEXT_MISMATCH` on the already-finalized V2 contract while `version()` and payer-versus-stranger authorization passed. **Do not enable V2 signing or redeploy on this evidence alone.**

The enhanced `npm run v2:verify` prints `sourceDiagnosis` with transport classification (plain Python versus a Base64 wrapper), local and deployed SHA-256, UTF-8 byte sizes, logical line counts, and the **first differing line** truncated to 130 characters. It reports `SOURCE_FORMAT_ONLY_DIFFERENCE` if only a BOM/newline convention/trailing blank lines differ; that also remains blocked until exact source is independently reviewed. True Python changes must be reviewed against the source actually uploaded to Studio. Source-code identity cannot be established from `version()` alone.

**Next safe command (Codespaces; no payment, transaction or signature):**

```bash
git pull --ff-only
npm run v2:verify
```

Inspect `sourceDiagnosis.firstDifferentLine`, `sourceDiagnosis.encoding`, `sourceDiagnosis.localSha256` and `sourceDiagnosis.deployedSha256` before deciding next action. Preserve the existing deployment and V1 acceptance evidence. Only enable wallet signing after exact deployed source and authorization checks have passed independent review. Do not edit the deployed V2 contract: any genuinely different code would need separately reviewed source and explicit user-authorized deployment of a new version.

## V2 source-difference follow-up — CRLF / terminal newline hypothesis

The owner ran `v2:verify` after the SDK fix. Deployed bytes were **11,361**, local bytes **11,116** (difference **245**). The local file was **248 logical split lines**, the deployed result **247**, and the first differing location was beyond the final content line (an empty line at EOF). This pattern strongly suggests the 246 content-line separators became `CRLF` on deployment and one terminal `LF` was dropped. The evidence does not yet exclude other text changes; no transaction should be sent on this hypothesis alone.

The improved comparer now removes **only** an optional UTF-8 BOM, CRLF versus LF line-ending conventions and terminal newline-only differences for a separate normalized comparison. It also prints `localNewlines`, `deployedNewlines`, and `normalizedSha256` alongside the deployed normalized hash. If the hashes agree while raw hashes differ, the source content matches within these narrowly specified formatting differences. It **does not** change the original raw source hashes or automatically enable V2 signing; the result remains `SOURCE_FORMAT_ONLY_DIFFERENCE` / `V2_NOT_READY_FOR_SIGNING` pending manual source review. Any changed Python code, indentation, inline whitespace, or internal blank line remains a real mismatch.

Read-only next step: `git pull --ff-only && npm run v2:verify`. Preserve V2 deployment TX `0x1fd845e9574e6c0956d5fd03afac8c7c70e75ea6532d4095fae3aa1276045f98`. Do not redeploy or repeat the existing x402 payment merely to troubleshoot line endings.

## Verified source-content review: 11 Nov 2026

The owner observed a strict normalized SHA-256 match between local `contracts/PayJuryV2.py` and the deployed GenLayer source:

`fed2f075824c0a0dd1e6c8e6b431a9b29e4d1a28a675de07699ad3566f1bdfd2`

There were zero changed Python content lines. The raw byte difference was precisely 246 CRLF separators vs 247 LF separators (one terminal newline present only locally), yielding the measured 245-byte size delta. The live contract also returned the correct V2 version marker, `can_file_for(payer)=true` and `can_file_for(unapproved_stranger)=false`, and its original deployment is FINALIZED / GenVM SUCCESS. The SDK still does **not** demonstrate byte-for-byte equivalence of original source; this is **content equivalence under strictly defined newline normalization**.

The verifier distinguishes `V2_DEPLOY_AND_AUTHORIZATION_FORMAT_ONLY_REVIEW_REQUIRED` from a genuine mismatch and from a read failure. This state is evidence for an owner-reviewed, **controlled Studionet acceptance test**, not an automatic permission to submit transactions, an external audit, or proof of cross-chain Base verification inside GenLayer.

**Owner opt-in on Codespaces:** once the owner has reviewed this report and accepted controlled testnet wallet operation, set only `GENLAYER_V2_CONTRACT_ADDRESS=0x0a6171C6a580c58d999a251436CE7c63FFc3dc31` in local private `.env` (do not commit). Restart `npm run dev`. Before any GenLayer write, first open the site and verify the V2 marker and wallet connection without signing a transaction. The payer wallet must authorize each payment-scoped delegation, filing and adjudication separately. **Never submit the already-decided V1 case again**; reuse its public transaction only for read-only UI checks.

A browser delegate preflight bug found in `web/app.js` was fixed: `can_file_for` now receives **four arguments** `[payer, network, txHash, delegate]`, matching the deployed V2 function; offline tests enforce this ABI. This is not yet live wallet acceptance.

## Browser wallet connection fix — 11 Nov 2026

Screenshot acceptance found PAYJURY V2 showing **"An unknown RPC error occurred"** immediately after **Connect GenLayer wallet**, without a wallet address or signed TX. Investigation found the site's Content Security Policy originally set `connect-src 'self'`, blocking direct GenLayer SDK browser RPC calls to `https://studio.genlayer.com/api`. This is a browser/RPC configuration defect, **not** an on-chain GenLayer transaction error. The screenshot alone cannot establish whether the first failure was CSP, CORS, or the wallet's network-change request.

The website now uses two carefully separated paths:

- **Read-only:** `GET /api/v2/read` permits only the configured deployed V2 address and allowlisted methods `version`, `can_file_for`, `filing_status`, and `get_case`, with strict argument shape/length/type validation. `GET /api/v2/tx` inspects one existing GenLayer transaction ID and returns status/GenVM execution, never rebroadcasts. The Node backend already had successful SDK GenLayer read access, so browser reads no longer depend on a cross-origin SDK call.
- **Wallet-approved writes only:** EIP-1193 `eth_requestAccounts` grants access to an address. `eth_chainId` checks for **61999 / 0xf22f**. If already correct, the SDK does not make an unnecessary wallet network switch request; otherwise it calls `client.connect('studionet')` and validates the chain afterward. **Only** the wallet-provider-backed browser SDK can submit `file_case`, `set_delegate`, and `adjudicate_case`, and only after each separate user confirmation. The server exposes **NO write endpoints** or payment/fee endpoints.

CSP remains tightly scoped: `connect-src 'self' https://studio.genlayer.com` (no wildcard origins). RPC and wallet errors are displayed with the failing stage, instead of unqualified `An unknown RPC error occurred`.

**Acceptance after updating Codespaces:** `git pull --ff-only`; stop and restart `npm run dev` to rebuild `web/studio-wallet.bundle.js`; hard-refresh page; press **Connect GenLayer wallet**. Successful read preflight plus approved account/chain must display `Connected 0x... on GenLayer Studionet`. If network add/switch fails, inspect the stage-specific error, do not supply or expose seed/private keys. No V2 case TX or new payment is necessary for this acceptance step.
