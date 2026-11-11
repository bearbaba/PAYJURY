# PAYJURY — optional real x402 Base Sepolia client

**UNEXECUTED.** This code is provided for a separate, explicitly operator-approved test only. The repository's CI and public website never initiate a payment.

The buyer is implemented with the official `@x402/core`, `@x402/evm` and `@x402/fetch` v2.30.0 packages. It uses the x402 EIP-3009 `exact` scheme on **Base Sepolia only** (`eip155:84532`). It permits precisely **10,000 atomic USDC = 0.01 USDC** to one explicitly approved merchant. It blocks unexpected recipients, other networks, non-USDC tokens, different amounts, and Permit2 schemes.

## Preconditions

1. Review an actual provider's URL, public reputation, `PAYMENT-REQUIRED` challenge, and official USDC address. Do not buy a random or untrusted API endpoint. Do not reuse a SpendProof payment as if PAYJURY made it.
2. Fund a **dedicated expendable Base Sepolia test wallet** with test USDC. Do not use a mainnet signing key.
3. Configure `X402_TESTNET_PRIVATE_KEY` as a private Codespaces Secret or process secret. Do not commit or paste it into web forms, chat, GitHub or logs.
4. Set `X402_QUOTE_URL` to the exact HTTPS paid resource, `X402_ALLOWED_HOST` to its exact hostname, `X402_APPROVED_PAYEE` to its verified recipient and `BASE_RPC_URL` to a trusted Base Sepolia RPC.
5. Before any payment, run the no-signature discovery:

```bash
npm run quote
```

Confirm the resulting `X402_QUOTE_INSPECTED_NOT_PAID` includes the exact intended `payee`, network `eip155:84532`, official USDC and amount `10000`. There is no wallet operation at this stage.

## Explicitly authorized paid acceptance — not automatic

After reviewing and approving a **single testnet transaction**, set the one-shot confirmation environment variable and run:

```bash
PAYJURY_CONFIRM_ONE_PAYMENT=I_APPROVE_ONE_TESTNET_X402_PAYMENT npm run pay:testnet -- --execute
```

This performs another initial GET; it is not guaranteed that a provider will repeat the same quote. The SDK payment policy rejects all newly proposed requirements except exactly the approved payee, network, token, amount, scheme, and EIP-3009 method. A local `.payjury-payment-attempt-<id>.lock` is written **before the paid request**. If the request fails, times out, or yields no receipt: **never remove the lock or retry blindly**; on-chain settlement might already have happened.

The CLI accepts success only after a matching `PAYMENT-RESPONSE` header and an independent `eth_getTransactionReceipt` showing successful exact official USDC Transfer from the dedicated buyer to the approved recipient with **two Base Sepolia confirmations**. Its final log emits a public transaction hash, confirmations and a **SHA-256 of the HTTP response body**, not raw response content or signing key. A returned HTTP 200 alone is not accepted as payment proof.

**Security limitation:** A USDC Transfer is not conclusive proof of the semantic correctness of delivered API data. Further, a buyer's HTTP body digest is not a server-signed response attestation. GenLayer separately adjudicates contested delivery claims; it cannot issue cross-chain refunds. A real GenLayer case and independent transaction finality checks are still required for complete E2E acceptance.
