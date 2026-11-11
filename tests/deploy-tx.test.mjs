import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDeployTransaction,inspectDeployTransaction,PAYJURY_ADDRESS,PAYJURY_DEPLOY_TX} from '../scripts/inspect-deploy-tx.mjs';

const successful={
  hash:PAYJURY_DEPLOY_TX,statusName:'FINALIZED',recipient:PAYJURY_ADDRESS,
  consensus_data:{leader_receipt:[{execution_result:'SUCCESS'},{execution_result:'SUCCESS'}]}
};
test('a verified deploy requires finalized state, GenVM success and matching deployed address',()=>{
  const r=summarizeDeployTransaction(successful);
  assert.equal(r.result,'FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED');
  assert.equal(r.status,'FINALIZED');
  assert.equal(r.execution,'SUCCESS');
  assert.equal(r.contractAddressStatus,'MATCHED');
  assert.equal(r.sourceMatchesUnverified,true);
});
test('tx identifier mismatch is rejected before interpreting a successful receipt',()=>{
  const r=summarizeDeployTransaction({...successful,hash:'0x'+'a'.repeat(64)});
  assert.equal(r.result,'WRONG_TRANSACTION_HASH');
});
test('finalized alone is not GenVM success',()=>{
  assert.equal(summarizeDeployTransaction({...successful,consensus_data:{}}).result,
    'FINALIZED_EXECUTION_UNCONFIRMED');
  assert.equal(summarizeDeployTransaction({...successful,
    consensus_data:{leader_receipt:[{execution_result:'ERROR'}]}}).result,
    'FINALIZED_EXECUTION_ERROR');
});
test('wrong recipient cannot count as the target contract',()=>{
  assert.equal(summarizeDeployTransaction({...successful,recipient:'0x'+'3'.repeat(40)}).result,
    'FINALIZED_SUCCESS_ADDRESS_CONFLICT');
});
test('SDK absence of a recipient does not allow fabricated address match',()=>{
  const {recipient,...withoutRecipient}=successful;
  assert.equal(summarizeDeployTransaction(withoutRecipient).result,
    'FINALIZED_GENVM_SUCCESS_ADDRESS_UNVERIFIED');
});
test('a pending deploy is not finalized evidence',()=>{
  assert.equal(summarizeDeployTransaction({...successful,statusName:'PENDING'}).result,
    'TRANSACTION_NOT_FINALIZED_OR_UNAVAILABLE');
});
test('read-only inspect fetches exactly one existing transaction without retries or writes',async()=>{
  let calls=0;
  const r=await inspectDeployTransaction({getTransaction:async({hash})=>{
    calls++;
    assert.equal(hash,PAYJURY_DEPLOY_TX);
    return successful;
  }});
  assert.equal(calls,1);
  assert.equal(r.result,'FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED');
});
test('unparseable IDs and missing lookup result fail closed',async()=>{
  assert.throws(()=>summarizeDeployTransaction(null),/No transaction/);
  assert.throws(()=>summarizeDeployTransaction(successful,{address:'not-an-address'}),/Invalid/);
  await assert.rejects(inspectDeployTransaction({getTransaction:async()=>{throw Error('RPC unavailable')}}),/RPC unavailable/);
});
