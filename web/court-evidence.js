// Read-only V2 case docket validation.
// Both summaries and SDK payloads are untrusted until matched field by field.
// Never use this helper for a wallet write, payment or validator-consensus claim.
const HEX_40=/^0x[0-9a-f]{40}$/i;
function sameAddress(a,b){
  return typeof a==='string'&&typeof b==='string'&&
    HEX_40.test(a)&&HEX_40.test(b)&&a.toLowerCase()===b.toLowerCase();
}
export function validateV2CourtDocket(payload,verified){
  if(!verified||verified.contractVersion!=='v2'||verified.caseStatus!=='DECIDED'||
     verified.identityBinding!=='DETERMINISTIC_ID_MATCHED'||
     verified.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED')
    throw Error('Live V2 case and Base receipt must be independently verified first');
  if(!sameAddress(payload?.address,verified.contractAddress))
    throw Error('GenLayer contract mismatch');
  let c=payload?.result;
  if(typeof c==='string'){try{c=JSON.parse(c);}catch{throw Error('Unparseable contract response');}}
  if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Invalid on-chain case response');
  if(c.case_id!==verified.caseId||
     c.status!=='DECIDED'||c.verdict!==verified.verdict||c.reason!==verified.reason||
     c.network!==verified.network||c.tx_hash!==verified.txHash||
     c.amount_atomic!==String(verified.amountAtomic)||c.endpoint!==verified.endpoint||
     !sameAddress(c.payer,verified.payer)||!sameAddress(c.payee,verified.payee)||
     !sameAddress(c.asset,verified.asset))
    throw Error('On-chain V2 case differs from independently verified proof');
  for(const [field,limit] of [['terms',1400],['delivery',2500],['evidence',2500]]){
    if(typeof c[field]!=='string'||!c[field].trim()||c[field].length>limit)
      throw Error('Invalid or oversized on-chain '+field);
  }
  if(!['ACCEPT','REWORK','UNVERIFIABLE'].includes(c.verdict)||
     typeof c.reason!=='string'||!c.reason.trim())
    throw Error('Invalid verdict');
  return Object.freeze({terms:c.terms,delivery:c.delivery,evidence:c.evidence,
    verdict:c.verdict,reason:c.reason,caseId:c.case_id});
}
