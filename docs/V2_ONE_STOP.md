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
