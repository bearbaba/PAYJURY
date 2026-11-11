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

## Actual GenLayer V2 authorization acceptance — 11 November 2026

The owner supplied original GenLayer Explorer execution details and fresh local RPC state reads for a permission-only test on **deployed V2** `0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`. Payer/signer was `0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb`, delegate `0x2222222222222222222222222222222222222222`, payment network `eip155:84532`, and reference `0x840a6ddf18558c452b1f1cbdd0b200b83e0a3ace06b68a5356769aefbc46f2b7`. The reference was **synthetic, not a Base payment** and must never be filed as one.

- Initially, `can_file_for(payer, network, ref, delegate)` returned `false` from the real V2 contract.
- [Authorize TX](https://explorer-studio.genlayer.com/tx/0x87fe1daef62b203e6fe3bd470a4f09b95f73eb2838290901458a227f3c861538): `set_delegate(..., true)` from payer, `FINALIZED`, Consensus Accepted, **GenVM SUCCESS**, 0 GEN transfer; post-write read returned **`true`**.
- [Revoke TX](https://explorer-studio.genlayer.com/tx/0xe87e736f91575e059f730ff4506499be2e76056b6dc1b72b1589d009faf6340c): `set_delegate(..., false)` from SAME payer for SAME network, reference and delegate, `FINALIZED`, Consensus Accepted, **GenVM SUCCESS**; post-write read returned **`false`**.

This closes the **real on-chain delegation/revocation acceptance**, not the V2 file/adjudicate flow. No payment was made; the fake reference does not establish settlement.

## Reuse existing SpendProof Base Mainnet x402 evidence without repaying

A separate builder-owned [SpendProof](https://github.com/bearbaba/SpendProof/blob/main/docs/KITE_PAID_ACCEPTANCE.md) acceptance reported an already-paid **IP402 GeoIP GET** on **Base Mainnet (8453)**, not PAYJURY's historical Base Sepolia V1 purchase. Exact transaction: [`0xe3e247e6cc7f3cd740ed7cc814f7d39f39e21f38e1633de6677cfe68175921cd`](https://basescan.org/tx/0xe3e247e6cc7f3cd740ed7cc814f7d39f39e21f38e1633de6677cfe68175921cd). SpendProof operator evidence reports 0.01 official Base USDC (`10000` atomic), sender `0xEDC10586eC36dF06ef87429b14Cd577A7cb68456`, merchant `0xEd617F79201248Df99909fBde4269b6EEAEE39B6`, HTTP 200 and Kite `completed` activity. PAYJURY does **not** automatically trust those operator-reported results. It independently fetches the Base receipt with exact Transfer topics, verifies official USDC address/amount/confirmations, probes V2 `can_file_for` and the payment reference's prior-use status, *all read-only*.

**One-time setup in Codespaces:** maintain `BASE_RPC_URL=https://sepolia.base.org` for V1, and set `BASE_MAINNET_RPC_URL=https://mainnet.base.org` as a separate variable in the private `.env`. Public Base RPC is rate-limited; use a stable provider for production. Restart `npm run dev`, then execute:

```bash
npm run v2:candidate
```

Expected **only if** independent receipt passes and V2 payment reference is unused: result will be `PAYMENT_VERIFIED_V2_SIGNER_NOT_AUTHORIZED` with `claimantAuthorized=false` for the user's connected GenLayer browser wallet `0x4C7c...8Dcb`, unless an additional *legitimate payer-signed on-chain authorization* has been recorded. If the Base receipt cannot be independently fetched, report it as unverified rather than success. The script does **not** sign, purchase, create a case or call OpenServ.

**Critical signer boundary:** user confirms they controlled the **Kite Passport Gmail/passkey Approval** that authorized SpendProof's payment. This does not automatically establish the capability to sign as the exact onchain **Base payer** `0xEDC105...8456` on GenLayer. V2 accepts only (a) an EIP-1193 GenLayer wallet with `gl.message.sender_address` matching that Base payer address, or (b) a separately payer-signed onchain `set_delegate(network,tx_hash,delegate,true)`. An account login, passkey consent, wallet balance, API payment, or an arbitrary owner-signed delegation cannot substitute for those rules. **Do not export Kite/Passport credentials or reconstruct any agent private key to force matching addresses.** If the payer cannot sign GenLayer V2, stop here and use a different legitimately owned onchain payer payment or design a separately audited authorization mechanism; never bypass V2 onchain rules.

After validated signed authority exists, prepare truthful terms/delivery data for the exact IP402 GeoIP GET, verify payment once more and obtain the deterministic V2 case ID from PAYJURY. A response/Activity log is *operator-observed evidence*, not an independent merchant-signed payload. Check `filing_status` again before one wallet-approved `file_case`. A successful receipt must be `FINALIZED` / GenVM SUCCESS and `get_case=FILED`. Only then sign `adjudicate_case(case_id)` ONCE, monitor finality, and independently read `get_case=DECIDED` plus actual verdict/reason. **No re-payment, no old V1 re-filing, no duplicate signatures on uncertain outcomes.**

## Explicitly approved NEW testnet payment (owner request, 11 November 2026)

The owner authorized a fresh purchase for V2 acceptance rather than reusing SpendProof's Kite Passport payment. Use the **same EVM address as the already-connected GenLayer V2 signer**, `0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb`, as the **Base Sepolia payer**, otherwise V2 rejects filing unless the real payer signs an on-chain delegate approval. Retain V1 and SpendProof evidence unchanged.

**Read-only readiness**: `npm run v2:fresh-preflight` requests one public HTTP 402 quote from the previously used `https://x402.payai.network/api/base-sepolia/paid-content`, insists on the previously verified merchant `0xe3837fe309618ae075dbef0a20735c0615a308e6`, exactly `10000` atomic official Base Sepolia USDC, verifies RPC chain ID 84532 and reads `balanceOf` for the exact signer address. It never signs, transfers, submits an HTTP PAYMENT-SIGNATURE, or files a GenLayer case. A provider quote may have changed; any mismatch BLOCKS payment.

If insufficient balance, use a trusted issuer's **Base Sepolia** test USDC faucet for the same address (e.g. https://faucet.circle.com/); the faucet is a separate user-initiated step. Base Sepolia test USDC uses `0x036cbd53842c5426634e7929541ec2318f3dcf7e`. Do not use mainnet USDC.

**Critical implementation gap before an actual new x402 charge:** Existing `npm run pay:testnet -- --execute` takes a private key from Codespaces, and its already-used account is NOT the GenLayer V2 signer. Do not rerun it, delete its permanent payment lock, export wallet secrets, or pretend it can sign as the connected browser wallet. A future wallet-provider-based EIP-3009 x402 purchase path must be implemented and reviewed, or the owner may manually execute a separately vetted, explicit purchase with the **same EOA** from a trusted wallet-capable client. Only after an independently confirmed new official Base USDC transfer with **that exact payer** and honest delivery evidence can the V2 browser file `file_case` once, then `adjudicate_case` once after FINALIZED/FILED. A transfer without merchant receipt is not automatically an x402 purchase.

No current signed payment TX or V2 FILED/DECIDED verdict is claimed by this stage.

## V2 beta: one fresh wallet-approved x402 test purchase

PAYJURY now has a bounded New x402 test purchase action under Payment evidence. Explicit parameters: Base Sepolia 84532, native Circle USDC testnet token, 10000 atomic USDC (0.01 TEST USDC), payer 0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb, merchant 0xe3837fe309618ae075dbef0a20735c0615a308e6, and HTTPS endpoint https://x402.payai.network/api/base-sepolia/paid-content.

The server has NO signer or custody. Browser viem requests an EIP-1193 wallet typed-data signature; the official x402 exact EVM scheme generates EIP-3009 authorization and the HTTP x402 fetch wrapper uses the payment-signature envelope through a same-origin relay. Server enforces exact amount/merchant/payer/network/asset and one permanent atomic payment-attempt lock before a signed request reaches the merchant. It never retries a signed payment if the upstream outcome is ambiguous. A new payment is NOT executed by deployment, CI or the quote check.

On observed paid success, a separate Base RPC receipt verification must confirm the same official USDC transfer and payer. The server records the paid response body digest and byte count but not raw sensitive response or EIP-3009 signature, and produces the deterministic V2 packet as PREPARED_NOT_FILED. The UI prepopulates original payment details and honest delivery scope but never files or adjudicates automatically.

Operator procedure: (1) update code, rebuild npm run dev; (2) press Check 402 quote & wallet balance; (3) inspect 0.01 TEST USDC, Base Sepolia and exact merchant; (4) explicitly press Confirm one x402 purchase and approve ONE EIP-712 signature in the same 0x4C7c... GenLayer claimant wallet; (5) capture the new Base TX. If the payment outcome is ambiguous, STOP, retain one-shot locks and inspect existing TX; never repay blindly; (6) if a new Base transfer is confirmed, reconnect the SAME wallet to GenLayer Studionet 61999, review exact case and approve one file_case; (7) after FILED / FINALIZED / SUCCESS, approve one AI adjudication; (8) read actual DECIDED verdict and reason. No original V1 payment is ever reused.

Tests of the proxy are mock-only. Browser SDK signing and live merchant payment cannot be labeled accepted without actual wallet approval, Base TX and readback. Merchant x402 quote may change and cause safe fail-closed. No public mainnet payment is authorized by this feature.


## One-case V2 acceptance when upstream GenLayer RPC RLP read is broken (2026-11-11)

The owner made exactly one new Base Sepolia x402 test USDC payment (TX `0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2`; `10000` atomic official USDC; same payer `0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb`). Canonical prepared case `pj_9f2276fd1904120b16d5f5b6ea5f7a2b` has NOT yet been submitted or adjudicated. The owner supplied the independent Base receipt verification: 11 confirmations at observation time, 200 HTTP and response hash. No second purchase is necessary.

On live GenLayer V2, finalized `version` and `can_file_for` PASSED, but 8-arg `filing_status` failed at RPC with `RLP string ends with 331 superfluous bytes` on both final/non-final read. Upstream bug is documented in [genlayer-studio #1745](https://github.com/genlayerlabs/genlayer-studio/issues/1745). The attempted raw GenVM calldata workaround was REJECTED by the live VM; it must NOT be claimed as success. `get_case` returned a generic execution failure while the case was unfiled.

**One-case controlled fallback:** when and only when the server identifies the exact upstream RLP read error, it reports `GENLAYER_RLP_255_READ_UNAVAILABLE`, not READY. The browser can allow the user's separately confirmed ONE filing for this exact canonical case ID, payment tx, payer, merchant, token, amount, and GenLayer V2 address; it verifies the Base receipt again, the contract marker using a normal finalized read, and the payer's right via the short finalized `can_file_for` call. The user is warned: `filing_status` remains UNVERIFIED, the real V2 onchain `file_case` function enforces payer authorization, canonical immutable ID, duplicate case and duplicate transfer rejection. A rejected transaction can incur fees. The existing write-once browser lock must remain in place if a signature is attempted or the outcome is unknown. **No auto-retry, no repeat payment, no fake READY status, no auto adjudication.**

After a real `file_case` transaction, do not assume success from a local UI banner. Verify its GenLayer hash is `FINALIZED` and execution `SUCCESS`, then call `get_case` on the original contract and confirm `status=FILED` and all original payment/evidence fields. Only then separately approve one `adjudicate_case`, independently verify its finality and read back `status=DECIDED`, `verdict` and `reason` on-chain. Keep record of any rejection without repeating the same write.

**Codespaces with one terminal is sufficient:** `npm run v2:diagnose` is a one-shot CLI and exits. `npm run dev` is the long-running website server: keep it open while using the browser. To update, stop with Ctrl+C, pull GitHub changes, and start `npm run dev` again. Do not clear localStorage or any permanent payment/write locks.


## One-take V2 filing and AI verdict acceptance — no new payment, one Codespaces terminal

One already-paid Base Sepolia x402 transaction is independently recorded: `0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2`, amount 10,000 atomic test USDC, merchant `0xe3837fe309618ae075dbef0a20735c0615a308e6`, payer `0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb`. Immutable evidence packet `pj_9f2276fd1904120b16d5f5b6ea5f7a2b`. The original evidence text is owned by the operator; the API rechecks the original Base receipt before reconstructing it. This is not a new x402 purchase, nor proof that the V2 case has already been filed.

- Only one Codespaces terminal is needed. Stop previous server with `Ctrl+C`, then `git pull --ff-only` and `npm run dev`. Open forwarded port 4173 in browser. Keep server running.
- Under Payment evidence click **Restore verified case**. The read-only `GET /api/v2/resume-known` verifies original Base USDC again and recovers the exact owner-provided evidence and canonical case ID; it does not sign or charge anything.
- Connect the **same payer** `0x4c7c...8dcb` on **GenLayer Studionet 61999**. Check correct contract V2; click **Review & file one case**. An upstream GenLayer RLP read bug may cause `filing_status` to be unverified; only a known-bug, one-case-specific, original-canonical-proof path is eligible. It still runs independent finalized version/permission checks. The owner's one explicit wallet-approved `file_case` write is the first and only V2 filing attempt. Rejected writes can incur network fees.
- Observe GenLayer transaction hash **FINALIZED** and **GenVM SUCCESS**. Do not repeat any uncertain write. After success independently read `get_case(case_id)` and confirm `status=FILED`, including original payer, payee, transfer and terms. `GET /api/case?version=v2&caseId=...` automatically includes Base settlement proof and case identity. The on-chain duplicate prevention remains enforced.
- Only after FILED is confirmed, use **Request AI decision** once. It sends `adjudicate_case(case_id)` with its own wallet approval. Wait for FINALIZED / GenVM SUCCESS, then read `get_case` and confirm `status=DECIDED` and the actual independent AI `verdict` and `reason`. Do not invent a verdict or claim a refund or merchant fault.
- Film the visible sequence: recovered original Base TX → original case ID → signer/contract → first real GenLayer TX and FILED → second real GenLayer TX and DECIDED + reason. Do not show passkey/private keys/wallet seed.
- The GenLayer SDK network-fee estimate is now obtained before creating a persistent signed write lock; an error while estimating fees alone is not a signed transaction and should not strand the one-shot lock. Once a wallet request has been attempted, the write lock remains until the original transaction outcome is resolved; there is no blind retry.

No software run or PR merge is evidence of successful mainnet settlement, a V2 GenLayer filing, or a final AI verdict. Record the signed explorer hashes and exact readbacks before claiming a complete demonstration.
