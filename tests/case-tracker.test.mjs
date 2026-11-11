import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';
import {firstPaymentClaim,FIRST_PAYMENT} from '../scripts/prepare-first-paid-case.mjs';
import {caseIdForClaim} from '../src/payment.mjs';
import {trackFiledCase} from '../src/case-tracker.mjs';

const claim=firstPaymentClaim(),caseId=caseIdForClaim(claim);
const record={
  case_id:caseId,network:claim.network,asset:claim.asset,
  tx_hash:claim.txHash,payer:claim.payer,payee:claim.payee,
  amount_atomic:claim.amountAtomic,endpoint:claim.endpoint,
  terms:claim.terms,delivery:claim.delivery,evidence:claim.evidence,
  claimant:'0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb',
  status:'DECIDED',verdict:'ACCEPT',reason:'Payment-and-delivery receipt supports the narrow case terms.'
};
const paymentProof={
  result:'BASE_USDC_TRANSFER_VERIFIED',network:claim.network,txHash:claim.txHash,
  asset:claim.asset,payer:claim.payer,payee:claim.payee,
  amountAtomic:claim.amountAtomic,confirmations:12,blockNumber:'57288759',transferLogIndex:'0x0'
};
const readCase=async id=>{assert.equal(id,caseId);return record;};
const verifyTransfer=async received=>{
  assert.equal(received.txHash,FIRST_PAYMENT.txHash);
  assert.equal(received.payee,claim.payee);
  return paymentProof;
};
test('read-only tracked case reconciles stored AI decision and independently verified Base USDC transfer',async()=>{
  const result=await trackFiledCase(caseId,{readCase,verifyTransfer,rpcUrl:'https://sepolia.base.org'});
  assert.equal(result.caseStatus,'DECIDED');
  assert.equal(result.verdict,'ACCEPT');
  assert.equal(result.identityBinding,'DETERMINISTIC_ID_MATCHED');
  assert.equal(result.settlement.status,'BASE_USDC_TRANSFER_VERIFIED');
  assert.equal(result.settlement.confirmations,12);
  assert.match(result.contractEvidence,/TX_FINALITY_NOT_INDEPENDENTLY_AUDITED/);
  assert.match(result.disclaimer,/claimant authorization/);
});
test('GenLayer read alone never implies a verified Base transfer',async()=>{
  const result=await trackFiledCase(caseId,{readCase});
  assert.equal(result.caseStatus,'DECIDED');
  assert.equal(result.settlement.status,'NOT_VERIFIED');
  assert.equal(result.settlement.reason,'BASE_RPC_NOT_CONFIGURED');
  const failed=await trackFiledCase(caseId,{readCase,rpcUrl:'https://sepolia.base.org',verifyTransfer:async()=>{throw Error('RPC down');}});
  assert.equal(failed.verdict,'ACCEPT');
  assert.equal(failed.settlement.status,'NOT_VERIFIED');
  assert.equal(failed.settlement.reason,'BASE_RECEIPT_UNAVAILABLE');
});
test('mismatched Base proof, forged IDs, invalid verdicts and missing readback fail closed',async()=>{
  const mismatch=await trackFiledCase(caseId,{readCase,rpcUrl:'https://sepolia.base.org',
    verifyTransfer:async()=>({...paymentProof,payee:'0x'+'f'.repeat(40)})});
  assert.equal(mismatch.settlement.status,'NOT_VERIFIED');
  const changed=await trackFiledCase(caseId,{readCase:async()=>({...record,evidence:record.evidence+' tampered'}),
    verifyTransfer,rpcUrl:'https://sepolia.base.org'});
  assert.equal(changed.identityBinding,'NON_CANONICAL_ID');
  for(const alteration of [
    {status:'DECIDED',verdict:'DOUBTFUL'},{status:'FILED',verdict:'ACCEPT'},
    {case_id:'pj_'+'0'.repeat(32)},{claimant:'invalid'}
  ])await assert.rejects(trackFiledCase(caseId,{readCase:async()=>({...record,...alteration})}));
  await assert.rejects(trackFiledCase('not-a-case',{readCase}),/Invalid case ID/);
});
test('unadjudicated case is FILED/PENDING, not a synthetic verdict',async()=>{
  const result=await trackFiledCase(caseId,{readCase:async()=>({...record,status:'FILED',verdict:'PENDING',reason:''})});
  assert.equal(result.caseStatus,'FILED');
  assert.equal(result.verdict,'PENDING');
  assert.equal(result.reason,null);
});
test('API allows case lookup with mock RPC proof, returns no signing actions',async()=>{
  const server=createServer({rpcUrl:'https://sepolia.base.org',
    caseReader:readCase,verifyTransfer});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(base+'/api/case?caseId='+caseId);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.caseStatus,'DECIDED');
    assert.equal(result.settlement.status,'BASE_USDC_TRANSFER_VERIFIED');
    assert.equal(result.identityBinding,'DETERMINISTIC_ID_MATCHED');
    assert.equal(result.contractEvidence,'GENLAYER_CONTRACT_READ_ONLY_TX_FINALITY_NOT_INDEPENDENTLY_AUDITED');
    const bad=await fetch(base+'/api/case?caseId=invalid');
    assert.equal(bad.status,422);
    const status=await (await fetch(base+'/api/status')).json();
    assert.equal(status.acceptsPayments,false);
    assert.equal(status.signsGenLayerWrites,false);
  }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
