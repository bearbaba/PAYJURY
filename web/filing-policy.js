// One approved freshly paid V2 testnet case; older decided cases are not reusable.
// Explicit single-case fallback when GenLayer Studio #1745 breaks the
// read-only filing_status ABI. NOT a proof that a transfer is unclaimed.
// On-chain PayJuryV2.file_case STILL validates immutable case ID,
// payer authorization, duplicate case and duplicate payment reference.
export const KNOWN_RLP_READ_CODE='GENLAYER_RLP_255_READ_UNAVAILABLE';
const CASE='pj_6575f7352b41602401caf317ce30f86b';
const TX='0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd';
const PAYER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const PAYEE='0xe3837fe309618ae075dbef0a20735c0615a308e6';
const TOKEN='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const V2='0x0a6171c6a580c58d999a251436ce7c63ffC3dc31'.toLowerCase();
const lower=x=>typeof x==='string'?x.toLowerCase():'';
export function assessV2FilingPreflight({
  packet,signer,contract,versionConfirmed,filingStatus=null,
  readErrorCode=null,payerRights=null
}={}){
  if(versionConfirmed!==true||!packet||
     packet.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED'||
     lower(signer)!==lower(packet.payer)||
     lower(packet.payer)!==PAYER||
     lower(contract)!==V2||
     packet.caseId!==CASE||lower(packet.txHash)!==TX||
     packet.network!=='eip155:84532'||lower(packet.token)!==TOKEN||
     lower(packet.payee)!==PAYEE||packet.amountAtomic!=='10000'||
     packet.status!=='PREPARED_NOT_FILED'){
    return {allow:false,mode:'UNVERIFIED_PAYMENT_OR_V2_IDENTITY'};
  }
  if(filingStatus==='READY_REQUIRES_BASE_PROOF'&&readErrorCode===null)
    return {allow:true,mode:'NORMAL_FINALIZED_PREFLIGHT',warning:null};
  if(readErrorCode===KNOWN_RLP_READ_CODE&&filingStatus===null&&payerRights===true)
    return {allow:true,mode:'KNOWN_UPSTREAM_RLP_RECOVERY',warning:
      'V2 filing_status is NOT VERIFIED due to upstream GenLayer RLP bug. The contract itself rejects duplicate case and payment references. A rejected filing can incur GenLayer fees. Submit at most one user-approved transaction and never retry an uncertain outcome.'};
  return {allow:false,mode:'V2_FILING_PREFLIGHT_NOT_CONFIRMED'};
}
