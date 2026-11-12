# PAYJURY — x402 payments meet GenLayer AI adjudication

**A real testnet payment. A canonical case. An independently readable GenLayer verdict.**

[Live demo / case tracker](https://payjury.vercel.app/?view=overview) · [Read-only verified V2 result](https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b) · [Agent skill](SKILL.md) · [Partner Demo Lab submission guide](docs/PARTNER_DEMO_2026.md)

PAYJURY is a small, non-custodial, reproducible integration of **x402** (an Internet Court founding partner) and **GenLayer**. A buyer pays for an HTTP API response using x402 and Base Sepolia test USDC. PAYJURY independently checks the USDC Transfer, binds the paid request and immutable delivery evidence to a canonical case ID, and a payer-authorized GenLayer V2 Intelligent Contract adjudicates the submitted evidence.

> **Verified demo on 12 November 2026:** The *new* browser-wallet x402 purchase and V2 case reached **`DECIDED / ACCEPT`** on GenLayer Studionet 61999. This is **testnet evidence, not Mainnet readiness, proof of response correctness, merchant-signed delivery evidence, escrow, or an automatic refund.** The first AI transaction reached consensus `Undetermined`; one later, explicitly approved AI transaction produced a verdict that was independently read from the deployed contract. No further transaction is required for the demo.

## Internet Court: Partner Demo Lab — fit

| Mission requirement | Where to verify |
| --- | --- |
| Pick an Internet Court partner | **x402** is listed as a founding partner by [Internet Court](https://internetcourt.org/). PayAI provides the paid test API endpoint, but is **not claimed** to be an Internet Court founding partner. |
| Meaningful GenLayer integration | [`contracts/PayJuryV2.py`](contracts/PayJuryV2.py) performs payer/delegate-authorized filing, canonical ID/replay checks and nondeterministic AI adjudication backed by validator consensus. The verdict **cannot** be produced by a static frontend. |
| Reproducible interface or skill | [Live case tracker](https://payjury.vercel.app/?view=overview), [`SKILL.md`](SKILL.md), local startup below, and read-only endpoints. A public viewer does **not** need a wallet or a second payment to reproduce the verified readback. |
| Professional demo video, 45 s max, three logos | See [submission guide](docs/PARTNER_DEMO_2026.md) and [45 s storyboard](docs/DEMO_45S.md). All final footage must show Internet Court, GenLayer and x402 branding. |
| Public, documented implementation | This repository contains contract, frontend, server, tests and security boundaries. |

## Reproduce in under one minute — no wallet needed

1. Open [PAYJURY overview](https://payjury.vercel.app/?view=overview).
2. In **GenLayer Case Tracker**, choose **V2** and paste `pj_6575f7352b41602401caf317ce30f86b`.
3. Click **Refresh proof / Track case**. The app performs a fresh GenLayer V2 `get_case` read and separately verifies the Base USDC settlement.
4. Check `DECIDED`, `ACCEPT`, `DETERMINISTIC_ID_MATCHED`, `BASE_USDC_TRANSFER_VERIFIED`. Inspect the contract reason and links. If an RPC is unavailable, the interface must say **unverified**, not invent proof.
5. Independently verify the same [read-only JSON](https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b).

These steps reproduce **readback of an already completed transaction**. They do not perform another paid purchase or GenLayer write; the original one-shot payment and signed transactions must never be replayed.

## Public evidence — the new 12 Nov 2026 case

| Evidence | Canonical reference |
| --- | --- |
| **Base Sepolia** official test USDC payment | [TX `0x8f90716a…5f24bd`](https://sepolia.basescan.org/tx/0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd); 10,000 atomic USDC = **0.01 test USDC**; payer `0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb`, merchant `0xe3837fe309618ae075dbef0a20735c0615a308e6` |
| V2 case ID | `pj_6575f7352b41602401caf317ce30f86b` |
| GenLayer V2 contract | [`0x0a6171C6a580c58d999a251436CE7c63FFc3dc31`](https://explorer-studio.genlayer.com/address/0x0a6171C6a580c58d999a251436CE7c63FFc3dc31), Studionet chain ID **61999** |
| First AI attempt — **not the final verdict** | [TX `0x1104d521…b30510`](https://explorer-studio.genlayer.com/tx/0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510), consensus **Undetermined**; persisted case stayed FILED/PENDING |
| Second AI attempt | [TX `0x5caff764…9d3374`](https://explorer-studio.genlayer.com/tx/0x5caff764597a0a43655cd0eb694023c03719a845b5b7d57b0730b36e289d3374), `FINALIZED` and GenVM leader return, with separately verified **`get_case=DECIDED/ACCEPT`** |
| Authoritative app reconciliation | [Read-only `/api/case` JSON](https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b) recomputes deterministic identity and rechecks Base receipt |

The on-chain reason says: *Payment of 0.01 USDC verified on Base Sepolia; API response substantiated with HTTP 200 and a nonempty body (467 bytes).* The adjudication was scoped to HTTP success and nonempty output, **not correctness or semantic quality** of the content. Original raw response bytes and a signed merchant delivery attestation were not retained.

## Architecture — why GenLayer is essential

```text
x402 HTTP 402 quote -> wallet-authorized EIP-3009 payment (Base Sepolia)
       |                              |
       v                              v
Paid HTTP 200 response          Base ERC-20 receipt
       |                              |
       +-----> immutable claim <------+
              terms / delivery / evidence / exact transfer
                          |
          independent receipt verification (PAYJURY server)
                          |
               canonical pj_… ID (SHA-256)
                          |
           GenLayer V2 file_case (payer/delegate)
                          |
        GenLayer nondeterministic AI adjudicate_case
                          |
        contract get_case -> DECIDED / verdict / reason
                          |
          independent read-only UI and exported proof
```

The GenLayer Intelligent Contract stores case state, checks who may file, prevents duplicate payment references, and performs AI adjudication through validator deliberation (`gl.nondet.exec_prompt`, `gl.vm.run_nondet_unsafe`). PAYJURY **never** claims the GenLayer contract itself reads Base receipts. The receipt verification is a separate trust boundary.

## Run the source locally

**Node.js 22+**, Python 3 for contract checks.

```bash
git clone https://github.com/bearbaba/PAYJURY.git
cd PAYJURY
npm install
npm run check
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:4173`. Set a trusted Base Sepolia RPC and Studionet read configuration per [`.env.example`](.env.example). Do not commit real private keys or tokens.

Read-only API examples:

```bash
curl "https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b"
curl "https://payjury.vercel.app/api/v2/read?method=get_case&args=%5B%22pj_6575f7352b41602401caf317ce30f86b%22%5D"
```

Key source files: [V2 Intelligent Contract](contracts/PayJuryV2.py), [backend](src/server.mjs), [Base receipt verification](src/payment.mjs), [x402](src/x402.mjs), [wallet UI](web/app.js), [tests](tests/), [SKILL](SKILL.md).

## Security and honest scope

- **No custody.** Wallet approval is explicit, each signed GenLayer write is separate; no private keys are requested by the site. One-shot payment and AI transaction locks prevent accidental resubmission.
- **Base Transfer ≠ service-quality proof.** The USDC log proves token transfer; the relay's reported HTTP 200, 467-byte length and SHA-256 are not a signed merchant attestation.
- **AI verdict ≠ legal ruling or automatic refund.** PAYJURY does not escrow funds, order merchant repayments or guarantee delivery semantics.
- **Testnet only.** The demonstrated payment used official Base Sepolia test USDC; GenLayer was Studionet, not Mainnet.
- **Do not blindly retry.** The first decision had `Undetermined` consensus; a second independently approved write resulted in stored `ACCEPT`. This observation does not guarantee subsequent consensus.
- **Older V1 and earlier V2 cases are different demonstrations.** Do not merge their hashes or verdicts with the 12 Nov case.

[Earlier acceptance ledger](docs/ACCEPTANCE.md) · [V2 runbook](docs/V2_ONE_STOP.md) · [security](docs/SECURITY.md) · [live payment safety](docs/X402_LIVE_CLIENT.md) · [partner-demo evidence and video](docs/PARTNER_DEMO_2026.md)
