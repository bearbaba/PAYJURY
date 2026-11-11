import {caseIdForClaim,validateClaim,verifyBaseUSDCTransfer} from './payment.mjs';

const CASE_ID=/^pj_[0-9a-f]{32}$/;
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const VERDICTS=new Set(['ACCEPT','REWORK','UNVERIFIABLE']);

// Read-only reconciliation across GenLayer and Base. Never signs, pays or files.
// GenLayer contains submitted assertions; Base receipt independently proves only a transfer.
export async function trackFiledCase(caseId, {readCase,verifyTransfer=verifyBaseUSDCTransfer,rpcUrl,selectRpcUrl}={}){
  if(typeof caseId!=='string'||!CASE_ID.test(caseId))throw Error('Invalid case ID');
  if(typeof readCase!=='function')throw Error('GenLayer case reader unavailable');
  const record=await readCase(caseId);
  if(!record||record.case_id!==caseId)throw Error('GenLayer case ID mismatch');
  if(!ADDRESS.test(record.claimant||''))throw Error('Malformed GenLayer claimant');
  if(!['FILED','DECIDED'].includes(record.status))throw Error('Invalid on-chain case status');
  if(record.status==='DECIDED'&&(!VERDICTS.has(record.verdict)||typeof record.reason!=='string'||!record.reason.trim()))
    throw Error('Invalid on-chain verdict');
  if(record.status==='FILED'&&record.verdict!=='PENDING')throw Error('Filed case must have pending verdict');
  const claim=validateClaim({
    network:record.network,txHash:record.tx_hash,asset:record.asset,
    payer:record.payer,payee:record.payee,amountAtomic:record.amount_atomic,
    endpoint:record.endpoint,terms:record.terms,delivery:record.delivery,evidence:record.evidence
  });
  const identityBinding=caseIdForClaim(claim)===caseId?'DETERMINISTIC_ID_MATCHED':'NON_CANONICAL_ID';
  // Routing the same RPC to both Base Mainnet and Sepolia yields false failures.
  // The selection is made only after the filed record's network has been validated.
  const receiptRpc=typeof selectRpcUrl==='function'?selectRpcUrl(claim.network):rpcUrl;
  let settlement={status:'NOT_VERIFIED',reason:receiptRpc?'BASE_RECEIPT_UNAVAILABLE':'BASE_RPC_NOT_CONFIGURED'};
  if(receiptRpc){
    try{
      const proof=await verifyTransfer(claim,{rpcUrl:receiptRpc,requiredConfirmations:2});
      if(proof?.result!=='BASE_USDC_TRANSFER_VERIFIED'||proof.txHash!==claim.txHash||
         proof.network!==claim.network||proof.asset!==claim.asset||proof.payer!==claim.payer||
         proof.payee!==claim.payee||proof.amountAtomic!==claim.amountAtomic)
        throw Error('Base receipt mismatch');
      settlement={status:'BASE_USDC_TRANSFER_VERIFIED',confirmations:proof.confirmations,
        blockNumber:proof.blockNumber,transferLogIndex:proof.transferLogIndex??null};
    }catch{
      // A temporary RPC failure must NEVER imply transaction failure or successful payment.
      settlement={status:'NOT_VERIFIED',reason:'BASE_RECEIPT_UNAVAILABLE'};
    }
  }
  return Object.freeze({
    caseId,caseStatus:record.status,verdict:record.verdict,
    reason:record.status==='DECIDED'?record.reason:null,
    claimant:record.claimant,network:claim.network,
    txHash:claim.txHash,payer:claim.payer,payee:claim.payee,
    amountAtomic:claim.amountAtomic,asset:claim.asset,endpoint:claim.endpoint,
    identityBinding,settlement,
    contractEvidence:'GENLAYER_CONTRACT_READ_ONLY_TX_FINALITY_NOT_INDEPENDENTLY_AUDITED',
    disclaimer:'A Base USDC Transfer does not prove API response accuracy, x402 causation, or claimant authorization.'
  });
}
