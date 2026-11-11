import test from 'node:test';
import assert from 'node:assert/strict';
import {abi} from 'genlayer-js';
import {fromHex,toHex} from 'viem';
import {REFERENCE} from '../scripts/diagnose-v2-read.mjs';
import {
  bareCalldata,rawGenLayerRead,safelyReadV2FilingStatusRaw,isGenLayerOverlongRlpError
} from '../src/v2-raw-read.mjs';

const CONTRACT=REFERENCE.contract;
const full=[REFERENCE.caseId,REFERENCE.network,REFERENCE.txHash,REFERENCE.asset,
  REFERENCE.payer,REFERENCE.payee,REFERENCE.amount,REFERENCE.payer];
const param={address:CONTRACT,functionName:'filing_status',args:full};
const auth=[REFERENCE.payer,REFERENCE.network,REFERENCE.txHash,REFERENCE.payer];
function result(value){
  return {data:toHex(abi.calldata.encode(value)).slice(2),status:{code:0,message:'success'}};
}
function reader({functionName}){
  if(functionName==='version')return 'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
  if(functionName==='can_file_for')return true;
  throw Error('Regular SDK cannot parse long RLP input');
}
function mockClient(status='READY_REQUIRES_BASE_PROOF'){
  const calls=[];
  const client={account:{address:REFERENCE.payer},request:async(req)=>{
    calls.push(req);
    const call=abi.calldata.decode(fromHex(req.params[0].data,'bytes'));
    assert.ok(call instanceof Map);
    if(call.get('method')==='version')return result('PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1');
    if(call.get('method')==='can_file_for')return result(true);
    if(call.get('method')==='filing_status')return result(status);
    throw Error('Unrecognized mocked contract call');
  }};
  return {client,calls};
}
test('overlong GenLayer filing status calldata round-trips without outer RLP and never ends in 00',()=>{
  const raw=bareCalldata('filing_status',full);
  assert.ok((raw.length-2)/2>253);
  assert.notEqual(raw.slice(2,4).toLowerCase(),'f8');
  assert.ok(!raw.endsWith('00'));
  const decoded=abi.calldata.decode(fromHex(raw,'bytes'));
  assert.equal(decoded.get('method'),'filing_status');
  assert.deepEqual(decoded.get('args'),full);
});
test('raw gen_call only issues type read; checks short SDK method equivalence before filing_status',async()=>{
  const {client,calls}=mockClient();
  const observed=await safelyReadV2FilingStatusRaw(client,param,{authoritativeReader:reader});
  assert.equal(observed,'READY_REQUIRES_BASE_PROOF');
  assert.deepEqual(calls.map(x=>x.method),['gen_call','gen_call','gen_call']);
  assert.ok(calls.every(x=>x.params[0].type==='read'));
  assert.ok(calls.every(x=>x.params[0].transaction_hash_variant==='latest-final'));
  assert.ok(calls.every(x=>x.params[0].to===CONTRACT));
  assert.ok(calls.every(x=>x.params[0].from===REFERENCE.payer));
  assert.ok(calls.every(x=>!x.params[0].fees&&!x.params[0].value));
});
test('no auto-READY result if SDK and bare permission results disagree',async()=>{
  const {client}=mockClient();
  await assert.rejects(safelyReadV2FilingStatusRaw(client,param,{
    authoritativeReader:async req=>req.functionName==='version'?
      'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1':false
  }),/permission comparison mismatch/);
});
test('status not in deployed V2 enum is rejected even when sender and version compare',async()=>{
  const {client}=mockClient('UNEXPECTED_OK');
  await assert.rejects(safelyReadV2FilingStatusRaw(client,param,{
    authoritativeReader:reader
  }),/Unrecognized V2 filing status/);
});
test('wrong payable claim, method, payer or address cannot use raw fallback',async()=>{
  const {client}=mockClient();
  await assert.rejects(safelyReadV2FilingStatusRaw(client,{
    ...param,functionName:'file_case'
  },{authoritativeReader:reader}),/Unsafe unwrapped calldata/);
  await assert.rejects(safelyReadV2FilingStatusRaw(client,{
    ...param,args:[...full.slice(0,7),'not-an-address']
  },{authoritativeReader:reader}),/Invalid filing_status arguments/);
  await assert.rejects(rawGenLayerRead(client,{address:CONTRACT,
    functionName:'adjudicate_case',args:[REFERENCE.caseId]}),/not allowlisted/);
});
test('RLP error recognition is narrow and does not reinterpret arbitrary VM failures',()=>{
  assert.ok(isGenLayerOverlongRlpError(new Error('An internal error',{cause:
    new Error('RLP string ends with 331 superfluous bytes')})));
  assert.equal(isGenLayerOverlongRlpError(new Error('Unknown case')),false);
  assert.equal(isGenLayerOverlongRlpError(new Error('network timeout')),false);
});
