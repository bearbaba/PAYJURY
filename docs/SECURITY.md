# Security model

PAYJURY is evidence-first and non-custodial. There is no hosted wallet, escrow or refund.

## Threats and protections

- **Forged HTTP 200:** The web does not infer payment from an HTTP status. Base RPC checks actual transaction success and exact ERC-20 Transfer logs.
- **Wrong token/network:** Chain ID is read independently from RPC. Only official Base mainnet and Base Sepolia USDC contracts are accepted.
- **Misattributed transfer:** Payer, payee, amount and asset must all match the same receipt log. Duplicate identical matches fail closed.
- **Overpayment:** Quote inspector filters >0.10 USDC. The client currently does not sign payments at all.
- **Provider-side false claim:** `PAYMENT-RESPONSE` is not a secure substitute for on-chain checks. Even a verified transfer is not independently proof that an API response was correct.
- **Endpoint SSRF:** Browser input endpoint is stored but never fetched by the server. Read-only quote CLI requires a public HTTPS URL and exact hostname allowlist. Do not use privileged internal URLs.
- **Prompt injection:** GenLayer contract prompt treats terms, evidence and delivery as untrusted data. Independent AI validators compare categorical verdicts; they can still disagree.
- **False GenLayer finality:** The web `get_case` is a contract read, not an independently inspected GenVM transaction receipt. Do not claim a fully finalized E2E merely from `DECIDED`.
- **Key leakage:** No private keys are accepted by this web app. Do not share wallet keys, PAYMENT-SIGNATURE authorizations, webhook secrets or full internal logs.

## Trust boundaries

Trust a configured Base RPC only to independently report on-chain EVM receipts; independent public explorer evidence is recommended for production. Trust GenLayer validators only for the content judgment, not for a cryptographic Base verification. The source contract itself is not a cross-chain oracle. The browser and user evidence are untrusted until checked.

## Before production use

Introduce API quotas and abuse protection, durable case storage, signer isolation, independent transaction finality checks, provider attestations bound cryptographically to HTTP response content, reproducible deployment, and manual security review. Do not enable public signing or paid auto-execution as a shortcut.
