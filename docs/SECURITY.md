# Security model

PAYJURY is evidence-first and non-custodial. There is no hosted wallet, escrow or refund.

## Threats and protections

- **Forged HTTP 200:** The web does not infer payment from an HTTP status. Base RPC checks actual transaction success and exact ERC-20 Transfer logs.
- **Wrong token/network:** Chain ID is read independently from RPC. Only official Base mainnet and Base Sepolia USDC contracts are accepted.
- **Misattributed transfer:** Payer, payee, amount and asset must all match the same receipt log. Duplicate identical matches fail closed.
- **Overpayment:** Quote inspector filters >0.10 USDC. The public website never signs payments. A separate testnet-only CLI can sign exactly one EIP-3009 authorization if the operator explicitly opts in, an exact merchant is approved and a 0.01 USDC cap is satisfied.
- **Provider-side false claim:** `PAYMENT-RESPONSE` is not a secure substitute for on-chain checks. Even a verified transfer is not independently proof that an API response was correct.
- **Endpoint SSRF:** Browser input endpoint is stored but never fetched by the server. Read-only quote CLI requires a public HTTPS URL and exact hostname allowlist. Do not use privileged internal URLs.
- **Prompt injection:** GenLayer contract prompt treats terms, evidence and delivery as untrusted data. Independent AI validators compare categorical verdicts; they can still disagree.
- **False GenLayer finality:** The web `get_case` is a contract read, not an independently inspected GenVM transaction receipt. Do not claim a fully finalized E2E merely from `DECIDED`.
- **Key leakage:** No private keys are accepted by this web app. The optional CLI consumes a dedicated testnet secret privately and does not log it. Do not share wallet keys, PAYMENT-SIGNATURE authorizations, webhook secrets or full internal logs.

## Trust boundaries

Trust a configured Base RPC only to independently report on-chain EVM receipts; independent public explorer evidence is recommended for production. Trust GenLayer validators only for the content judgment, not for a cryptographic Base verification. The source contract itself is not a cross-chain oracle. The browser and user evidence are untrusted until checked.

## Before production use

Introduce API quotas and abuse protection, durable case storage, signer isolation, independent transaction finality checks, provider attestations bound cryptographically to HTTP response content, reproducible deployment, and manual security review. Do not enable public signing or paid auto-execution as a shortcut.

## V2 payer authorization boundary

The existing V1 contract has not enforced who may file for a Base payer. The **new proposed V2 contract is not deployed**; it requires a GenLayer signer matching the payer EVM address or an onchain payer-signed delegate authorization scoped to the specific Base network and payment TX. This only authenticates the claimant relationship; the source does not independently verify Base settlements or x402 merchant delivery. V2 also rechecks a canonical SHA-256 case ID and limits the same payment TX to one V2 case. Signing is disabled in the website until a *new* verified V2 address is configured. The browser uses EIP-1193; a submitted operation is locally locked, and failures after a possible broadcast must not result in automatic resubmission. No claim of full audited production security is made.

## Automatic transfer discovery (read-only)

`/api/inspect` reads the configured Base RPC, requires the expected EVM chain, successful transaction and exactly **one** official USDC Transfer, and independently re-verifies exact amount, payer and payee. It never signs and never guesses among multiple Transfer logs. An ERC-20 Transfer does not prove x402 causality or a valid delivery dispute; untrusted endpoint and submitted evidence remain distinct inputs. Require RPC quotas and abuse protection before exposing this service widely.
