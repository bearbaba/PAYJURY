# Internet Court: Partner Demo Lab — PAYJURY submission evidence

**Mission dates:** 9–23 November 2026. **Partner:** x402 (Internet Court founding partner; see [Internet Court's official partner list](https://internetcourt.org/)). **Implementation:** PAYJURY V2 on GenLayer Studionet with one actual x402 payment and independently verified adjudication.

## One-line pitch

> PAYJURY makes x402 API payments accountable: prove the USDC transfer on Base Sepolia, file immutable delivery evidence and let GenLayer's AI validators decide whether the original acceptance terms were met.

## The reproducible demonstration

**No one should repay or re-sign to reproduce the demo.**

1. Open [PAYJURY](https://payjury.vercel.app/) and navigate to **GenLayer Case Tracker**.
2. Select **V2** and enter `pj_6575f7352b41602401caf317ce30f86b`.
3. Press **Refresh proof**. The site reads `get_case` from the actual V2 contract and independently re-verifies the Base transfer.
4. See **DECIDED / ACCEPT**, **TRANSFER VERIFIED** and **ID MATCHED**, then export proof JSON.
5. To reproduce from code, follow [the root README](../README.md), [SKILL.md](../SKILL.md) and `npm run check`.

## Exact evidence, not simulations

| Proof | Public link |
| --- | --- |
| New 12 Nov payment: 0.01 test USDC / 10,000 atomic | [BaseScan](https://sepolia.basescan.org/tx/0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd) |
| GenLayer contract performing real AI adjudication | [PayJury V2 Contract](https://explorer-studio.genlayer.com/address/0x0a6171C6a580c58d999a251436CE7c63FFc3dc31) |
| First AI transaction (honestly show *Undetermined* if mentioning it) | [GenLayer Explorer](https://explorer-studio.genlayer.com/tx/0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510) |
| Second AI transaction, final stored verdict | [GenLayer Explorer](https://explorer-studio.genlayer.com/tx/0x5caff764597a0a43655cd0eb694023c03719a845b5b7d57b0730b36e289d3374) |
| Decided case ID / independently checked receipt | [PAYJURY V2 JSON](https://payjury.vercel.app/api/case?version=v2&caseId=pj_6575f7352b41602401caf317ce30f86b) |

**Verdict scope:** HTTP 200 and nonempty API response (467 bytes) after a Base Sepolia transfer of 0.01 test USDC. Neither the model nor the transfer proves API content correctness or a signed merchant delivery. This is testnet; no escrow, no refunds, no Mainnet claim.

## Final video — required editing checklist

- Hard maximum **45 seconds**, preferred **40–43 seconds**, 1920×1080 MP4, readable English captions.
- Use **Internet Court, GenLayer and x402** as the three clear logos. Use original brand assets; do not confuse x402 protocol membership with PayAI merchant or facilitator membership.
- Use **actual recorded footage** of wallet-authorized x402 purchase / Base proof, canonical case, GenLayer filing and `DECIDED / ACCEPT` V2 readback; no constructed payment screen or synthetic AI verdict.
- Use AI-assisted editorial work (script, timing, cuts, captions, zoom/motion). Render transitions and zooms with an actual video editor. The video must look edited, not like a raw screen capture.
- The **last proof frame** must show the *new case* `pj_6575f7352b41602401caf317ce30f86b`; do not show a historical V1/V2 ACCEPT as this purchase's result.
- Keep the browser legible: crop out OBS, wallet balances, unrelated desktop areas and the outdated imported packet's `NOT FILED` badge. The verified tracker remains authoritative.
- Do not narrate a fake refund or claim the contract verified USDC internally. Clearly distinguish **Base USDC Transfer** from **GenLayer AI verdict**.
- Make a public video link and submit it **along with** the live demo URL, this public GitHub repo and read-only case proof. No reward can be assumed until official acceptance.

## Suggested 42-second beat sheet

| Interval | Visual | On-screen English |
| --- | --- | --- |
| 00:00–00:04 | Brand card with three partner logos, animated graphic | **PAYJURY — Proof before verdict** |
| 00:04–00:11 | Real x402 purchase recording / receipt evidence | **01 · PAY — 0.01 test USDC via x402** |
| 00:11–00:18 | Base settlement independently verified | **TRANSFER VERIFIED · BASE SEPOLIA** |
| 00:18–00:25 | PAYJURY case form and new canonical case | **02 · FILE — Exact payment. Immutable terms.** |
| 00:25–00:32 | Real GenLayer V2 adjudication TX / workflow | **03 · JUDGE — GenLayer AI consensus** |
| 00:32–00:39 | New case readback, large `DECIDED / ACCEPT` | **FINAL VERDICT · ACCEPT** |
| 00:39–00:42 | Three brand marks, real case ID + website | **One payment. One case. Verifiable AI verdict.** |

## Mission compliance status

| Gate | Status |
| --- | --- |
| Partner choice | **x402 official founding member verified** |
| Real GenLayer AI functionality | **V2 contract and live `DECIDED/ACCEPT` readback verified** |
| Reproducible interface | **Public read-only tracker** (no new wallet signature) |
| Public source and documentation | **README, contract, agent skill, tests** |
| Final 45-second edited video | **Must be exported and supplied with all three logos** |
| Mission points / acceptance | **Unverified** until the mission administrator accepts the contribution; the mission screen's 0 points is not a contract failure. |
