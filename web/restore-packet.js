// Restore the already paid one-take V2 case after a website reload.
// The pasted JSON is UNTRUSTED: this function only extracts a claim for
// independent server-side Base USDC receipt re-verification. It never pays,
// signs or infers GenLayer filing from supplied state.
export const ONE_TAKE_CASE='pj_6575f7352b41602401caf317ce30f86b';
export const ONE_TAKE_TX='0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd';
const PAYER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const MERCHANT='0xe3837fe309618ae075dbef0a20735c0615a308e6';
const TOKEN='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const ENDPOINT='https://x402.payai.network/api/base-sepolia/paid-content';
export function claimFromOneTakePacket(saved){
  if(!saved||typeof saved!=='object'||Array.isArray(saved)||
     saved.caseId!==ONE_TAKE_CASE||saved.txHash!==ONE_TAKE_TX||
     saved.network!=='eip155:84532'||saved.amountAtomic!=='10000'||
     String(saved.payer||'').toLowerCase()!==PAYER||
     String(saved.payee||'').toLowerCase()!==MERCHANT||
     String(saved.token||'').toLowerCase()!==TOKEN||
     saved.endpoint!==ENDPOINT)
    throw Error('Saved packet is not the approved paid one-take case');
  for(const [key,max] of [['terms',1400],['delivery',2500],['evidence',2500]]){
    if(typeof saved[key]!=='string'||!saved[key].trim()||saved[key].length>max)
      throw Error('Saved packet contains invalid '+key);
  }
  return {
    network:saved.network,asset:TOKEN,txHash:ONE_TAKE_TX,
    payer:PAYER,payee:MERCHANT,amountAtomic:'10000',endpoint:ENDPOINT,
    terms:saved.terms,delivery:saved.delivery,evidence:saved.evidence
  };
}
