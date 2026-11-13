---
name: payjury-evidence-court
description: Reproduce and independently inspect an actual x402-to-GenLayer V2 dispute: verify Base Sepolia USDC transfer, deterministic case identity, and persisted AI judgment. No wallet required for historical readback.
---

# PAYJURY agent skill — inspect an x402 payment and GenLayer AI decision

## When to use

A buyer/AI agent pays an x402 HTTP API, then asks if delivery satisfied the original immutable terms. PAYJURY connects independent **Base USDC settlement checks** to payer-authorized **GenLayer Intelligent Contract** filing and AI adjudication.

This skill documents an actual, completed 12 Nov 2026 V2 case. It **does not** authorize reproducing the paid purchase, signature, on-chain filing, or adjudication.

## Reproduce the live result (read-only; no wallet)

1. Open https://payjury.vercel.app/?view=overview . Select **V2** if needed. It loads the latest accepted case by default.
2. Select **Refresh proof** with case ID `pj_6575f7352b41602401caf317ce30f86b`.
3. Verify each field separately:
   - `caseStatus=DECIDED`, `verdict=ACCEPT` from GenLayer `get_case`.
   - `identityBinding=DETERMINISTIC_ID_MATCHED` independently recomputed.
   - `settlement.status=BASE_USDC_TRANSFER_VERIFIED`, after checking the Base receipt and official USDC Transfer log.
4. Open **Inspect the actual buyer terms and delivery evidence judged on-chain**. This read-only disclosure cross-checks the fresh contract `get_case` fields against the verified payment/case identity before showing original terms, delivered response metadata and supporting evidence.
5. Follow the Explorer records below. Never treat `FINALIZED` plus leader execution as proof of majority consensus if the SDK did not report the validator result.
6. Export proof JSON if needed; it is **not signed** and is not cryptographic proof that the merchant delivered correct content.

Read-only endpoints:
```bash
curl "https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b"
curl "https://payjury.vercel.app/api/v2/read?method=get_case&args=%5B%22pj_6575f7352b41602401caf317ce30f86b%22%5D"
```

## Authentic evidence ledger

| Source | Actual public proof |
| --- | --- |
| HTTP x402 payment | [Base Sepolia USDC TX](https://sepolia.basescan.org/tx/0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd) — exactly 10,000 atomic units, 0.01 test USDC |
| Intelligent Contract V2 | [GenLayer Studionet 61999](https://explorer-studio.genlayer.com/address/0x0a6171C6a580c58d999a251436CE7c63FFc3dc31) |
| First adjudication attempt | [GenLayer TX](https://explorer-studio.genlayer.com/tx/0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510): consensus Undetermined. **Not a persisted verdict.** |
| Second, explicitly approved AI adjudication | [GenLayer TX](https://explorer-studio.genlayer.com/tx/0x5caff764597a0a43655cd0eb694023c03719a845b5b7d57b0730b36e289d3374): FINALIZED; authoritative `get_case` reports DECIDED / ACCEPT |
| Verified case state | [Live PAYJURY JSON](https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b) |

The initial AI transaction did **not** persist the verdict, and Studio SDK did not expose the second receipt's validator consensus result. PAYJURY relies on independently checking the stored contract state, not fabricating a validator vote.

## What GenLayer actually does

`contracts/PayJuryV2.py` is not decorative. It implements:

- `file_case`: **only payer or on-chain-authorized delegate**; validates case ID built from payment reference + immutable terms/delivery/evidence, rejects replay of the same transaction.
- `adjudicate_case`: only claimant or payer may request judgment on a filed case. GenLayer `gl.nondet.exec_prompt` evaluates supplied natural-language terms and evidence; the contract validates JSON verdict `ACCEPT`, `REWORK` or `UNVERIFIABLE`.
- `gl.vm.run_nondet_unsafe(judge,validate_judge)`: validators independently re-evaluate the verdict category rather than trusting frontend output. A consensus error can leave the case FILED/PENDING, as observed in the first transaction.
- `get_case`: reads the persisted status, verdict and exact reason; the web app does not invent either.

**Important scope:** The one completed case demonstrates the **narrow** contract terms “HTTP 2xx and nonempty body after 0.01 test USDC settlement.” It does **not** test content correctness, subjective quality, or merchant misconduct. The contract's flexible adjudication engine can accept broader text requirements, but **no separate live REWORK or UNVERIFIABLE case is claimed**.

For example, a *future hypothetical case* might require “The paid API must provide five valid, source-linked citations; citations must actually support the stated assertions.” Evaluating this requires interpretation, unlike a binary HTTP status. This example is NOT a recorded PAYJURY verdict and must never be presented as one.

## Trust boundaries and safe limits

- Base Sepolia (84532) and GenLayer Studionet (61999) are separate chains. GenLayer's contract does not verify Base settlement itself; PAYJURY's off-chain service does.
- The original HTTP client reported status 200, 467-byte body and SHA-256 hash. The full raw response and merchant-signed delivery attestation were **not preserved**. Payment verification does not cryptographically prove x402 causality or content quality.
- Only the wallet may approve transactions; no server key. Completed transactions and one-shot payment markers must **never be replayed** to make a demo look successful.
- Do not paste private keys, wallet payment authorization headers, bearer tokens, secrets or webhooks into this skill.
- No escrow, refunds, legal binding, Mainnet guarantees or production audits.
- If a read fails, report `UNVERIFIED`, not `ACCEPT`. A leader's proposal is not the final stored verdict.

## For developers

```bash
git clone https://github.com/bearbaba/PAYJURY.git
cd PAYJURY
npm install
npm run check
cp .env.example .env
npm run dev
```

Set a trustworthy Base Sepolia and Studionet RPC in your local environment. The public proof can be inspected without local configuration.

For an unrelated new case, start with read-only quote inspection and receipt validation; use `POST /api/verify` to prepare a canonical `PREPARED_NOT_FILED` packet. Wallet-authorized x402 payment, new filing and AI decision must be explicitly approved **only for a distinct transaction**. This skill never performs those writes. See [security boundaries](docs/SECURITY.md), [mission guide](docs/PARTNER_DEMO_2026.md) and [README](README.md).
