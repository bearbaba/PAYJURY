// Owner-supplied public acceptance evidence for the ONE existing, paid x402 transaction.
// This record is NOT a wallet key, PAYMENT-SIGNATURE, refund authorization, or proof
// of API content correctness. Always reverify the actual Base USDC Transfer before use.
import {validateClaim,caseIdForClaim,makeCasePacket} from './payment.mjs';

export const ACCEPTED_V2_CASE_ID='pj_9f2276fd1904120b16d5f5b6ea5f7a2b';
export const ACCEPTED_V2_BASE_TX='0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2';
export const acceptedV2Claim=validateClaim({
  network:'eip155:84532',
  asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  payer:'0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb',
  payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  txHash:ACCEPTED_V2_BASE_TX,
  amountAtomic:'10000',
  endpoint:'https://x402.payai.network/api/base-sepolia/paid-content',
  terms:'The purchased Base Sepolia x402 paid-content endpoint must respond with HTTP 2xx and a nonempty body after the exact 0.01 test USDC settlement. This case does not adjudicate the semantic accuracy or quality of the response.',
  delivery:'The one-time HTTP GET returned status 200 with 467 response bytes. The client computed body SHA-256 a0a53e9a69031d2c5d512e74b0f031792046f18ec3a780b0a3c2ab6431cf379a. Raw response contents were not retained in the PAYJURY evidence packet.',
  evidence:'Payer-authorized new x402 EIP-3009 request on 2026-11-11T11:59:11.871Z. PAYMENT-RESPONSE reported Base Sepolia TX 0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2. PAYJURY independently verified official USDC Transfer to the exact merchant, 10000 atomic units, block 57382405, confirmations 11. Paid HTTP response status 200, body length 467, SHA-256 a0a53e9a69031d2c5d512e74b0a3c2ab6431cf379a. Hash and observations are client-side/server relay evidence, not a signed merchant attestation of response correctness.'
});
if(caseIdForClaim(acceptedV2Claim)!==ACCEPTED_V2_CASE_ID)
  throw Error('Saved owner evidence changed and no longer matches immutable V2 case ID');

export async function restoreAcceptedV2Case({verifyTransfer,rpcUrl}={}){
  if(typeof verifyTransfer!=='function'||!rpcUrl)
    throw Error('Independent Base RPC verifier is required before restoration');
  const settlement=await verifyTransfer(acceptedV2Claim,{rpcUrl,requiredConfirmations:2});
  const packet=makeCasePacket(acceptedV2Claim,settlement);
  if(packet.caseId!==ACCEPTED_V2_CASE_ID||packet.txHash!==ACCEPTED_V2_BASE_TX||
    packet.status!=='PREPARED_NOT_FILED')
    throw Error('Canonical case binding could not be recovered');
  return packet;
}
