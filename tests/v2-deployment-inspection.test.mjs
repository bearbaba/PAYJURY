import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyV2ReadOnly,V2_ADDRESS,V2_DEPLOY_TX,V2_MARKER
} from '../scripts/verify-v2-deployment.mjs';
const expectedTx={
  hash:V2_DEPLOY_TX,statusName:'FINALIZED',
  txExecutionResultName:'FINISHED_WITH_RETURN',contractAddress:V2_ADDRESS
};
const v2Reads=async ({address,functionName,args})=>{
  assert.equal(address,V2_ADDRESS);
  if(functionName==='version'){assert.deepEqual(args,[]);return V2_MARKER;}
  if(functionName==='can_file_for'){
    assert.equal(args.length,4);
    return args[0]===args[3];
  }
  throw Error('Unknown method');
};
test('V2 deployed TX, version marker, payer allowed, unrelated wallet denied, optional source match',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async()=> 'contract V2 source',
    localSource:'contract V2 source'
  });
  assert.equal(out.result,'V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS');
  assert.equal(out.deployment.result,'FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED');
  assert.equal(out.sourceIdentity,'SOURCE_TEXT_MATCHED');
  assert.equal(out.payerCanFile,true);
  assert.equal(out.strangerCanFile,false);
  assert.equal(out.signedTransactions,0);
});
test('read-only deploy inspection never treats version mismatch or stranger authorization as success',async()=>{
  const wrongMarker=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async a=>a.functionName==='version'?'PAYJURY_V1':false
  });
  assert.equal(wrongMarker.result,'V2_NOT_READY_FOR_SIGNING');
  const wrongAuth=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async a=>a.functionName==='version'?V2_MARKER:true
  });
  assert.equal(wrongAuth.result,'V2_NOT_READY_FOR_SIGNING');
});
test('RPC code-read error cannot be misreported as source match',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async()=>{throw Error('GenLayer RPC -32603');},
    localSource:'different source'
  });
  assert.equal(out.result,'V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS');
  assert.equal(out.sourceIdentity,'UNVERIFIED');
  assert.ok(out.warnings.some(x=>x.startsWith('SOURCE_RPC_READ_UNAVAILABLE')));
  assert.ok(out.warnings.some(x=>x.startsWith('SOURCE_IDENTITY_NOT_PROVEN')));
});
test('declared source mismatches block readiness',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async()=> 'unrelated source',
    localSource:'contract V2 source'
  });
  assert.equal(out.result,'V2_NOT_READY_FOR_SIGNING');
  assert.equal(out.sourceIdentity,'SOURCE_TEXT_MISMATCH');
});
test('deployment RPC mismatch or unavailable read is never full deployment verification',async()=>{
  const conflict=await verifyV2ReadOnly({
    getTransaction:async()=>({...expectedTx,contractAddress:'0x'+'3'.repeat(40)}),
    readContract:v2Reads
  });
  assert.equal(conflict.result,'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED');
  const unavailable=await verifyV2ReadOnly({
    getTransaction:async()=>{throw Error('RPC down');},readContract:v2Reads
  });
  assert.equal(unavailable.result,'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED');
  assert.equal(unavailable.signedTransactions,0);
  assert.ok(unavailable.warnings.some(x=>x.startsWith('DEPLOY_RPC_READ_UNAVAILABLE')));
});
test('method read failures are not a reason to redeploy',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async()=>{throw Error('RPC cannot read GenLayer finalized state');}
  });
  assert.equal(out.result,'V2_NOT_READY_FOR_SIGNING');
  assert.equal(out.version,null);
  assert.equal(out.payerCanFile,null);
  assert.ok(out.warnings.some(x=>x.startsWith('V2_METHOD_READ_UNAVAILABLE')));
});
