import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';

const V2='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const TX='0xe3e247e6cc7f3cd740ed7cc814f7d39f39e21f38e1633de6677cfe68175921cd';
const PAYER='0xedc10586ec36df06ef87429b14cd577a7cb68456';
const PAYEE='0xed617f79201248df99909fbde4269b6eeaee39b6';
const ASSET='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const SIGNER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const verified={
  result:'BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED',
  txHash:TX,network:'eip155:8453',asset:ASSET,payer:PAYER,payee:PAYEE,
  amountAtomic:'10000',blockNumber:'53494088',confirmations:24,
  transferLogIndex:'45'
};
async function serve(fn,{inspect=async()=>verified,v2=async req=>
    req.functionName==='can_file_for'?false:'READY_REQUIRES_BASE_PROOF',
  rpc='https://sepolia.base.org',mainnet='https://mainnet.base.org',verify}={}){
  const prev=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=V2;
  const server=createServer({rpcUrl:rpc,mainnetRpcUrl:mainnet,
    inspectTransfer:inspect,v2Reader:v2,...(verify?{verifyTransfer:verify}:{})});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    await fn('http://127.0.0.1:'+server.address().port);
  }finally{
    if(prev===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prev;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
function candidateUrl(claimant=SIGNER,network='eip155:8453',hash=TX){
  return '/api/v2/candidate?network='+encodeURIComponent(network)+
    '&txHash='+hash+'&claimant='+claimant;
}
test('existing SpendProof USDC evidence: independent Base MAINNET receipt first, V2 reuse and authorization read next',async()=>{
  const reads=[],rpc=[];
  await serve(async base=>{
    const r=await fetch(base+candidateUrl());
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.result,'PAYMENT_VERIFIED_V2_SIGNER_NOT_AUTHORIZED');
    assert.deepEqual(data.transfer,verified);
    assert.equal(data.claimantAuthorized,false);
    assert.equal(data.unusedInV2,true);
    assert.equal(data.v2FilingStatus,'READY_REQUIRES_BASE_PROOF');
    assert.equal(data.paymentPerformed,false);
    assert.equal(data.signingPerformed,false);
    assert.equal(data.readOnly,true);
  },{
    inspect:async (arg,{rpcUrl})=>{rpc.push(rpcUrl);assert.deepEqual(arg,{network:'eip155:8453',txHash:TX});return verified;},
    v2:async req=>{reads.push(req);return req.functionName==='can_file_for'?false:'READY_REQUIRES_BASE_PROOF';}
  });
  assert.deepEqual(rpc,['https://mainnet.base.org']);
  assert.equal(reads.length,2);
  const permission=reads.find(x=>x.functionName==='can_file_for');
  assert.deepEqual(permission,{address:V2,functionName:'can_file_for',
    args:[PAYER,'eip155:8453',TX,SIGNER]});
  const filing=reads.find(x=>x.functionName==='filing_status');
  assert.equal(filing.args[4],PAYER);
  assert.equal(filing.args[7],PAYER);
  assert.equal(filing.args[0],'pj_'+'0'.repeat(32));
});
test('authorized claimant may only be preflight-eligible, never automatically file',async()=>{
  await serve(async base=>{
    const r=await fetch(base+candidateUrl(PAYER));
    const data=await r.json();
    assert.equal(data.result,'PAYMENT_VERIFIED_V2_FILING_PREFLIGHT_POSSIBLE');
    assert.equal(data.unusedInV2,true);
    assert.equal(data.claimantAuthorized,true);
    assert.equal(data.signingPerformed,false);
  },{v2:async req=>req.functionName==='can_file_for'?true:'READY_REQUIRES_BASE_PROOF'});
});
test('preexisting V2 filing blocks a duplicate even if payment and wallet are valid',async()=>{
  await serve(async base=>{
    const r=await fetch(base+candidateUrl(PAYER));
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.result,'PAYMENT_VERIFIED_BUT_V2_ALREADY_FILED');
    assert.equal(data.unusedInV2,false);
  },{v2:async req=>req.functionName==='can_file_for'?true:'TRANSFER_ALREADY_FILED'});
});
test('bad Base receipt, false RPC claim or unresolved V2 access fails closed',async()=>{
  await serve(async base=>{
    const r=await fetch(base+candidateUrl());
    assert.equal(r.status,422);
    assert.match((await r.json()).error,/Independent Base USDC/);
  },{inspect:async()=>({...verified,payer:'invalid'})});
  await serve(async base=>{
    const r=await fetch(base+candidateUrl());
    assert.equal(r.status,503);
    assert.match((await r.json()).error,/authorization or payment reuse state/);
  },{v2:async()=>{throw Error('RPC offline');}});
});
test('Mainnet candidate cannot silently use Sepolia RPC when Base Mainnet is not configured',async()=>{
  let called=0;
  await serve(async base=>{
    const r=await fetch(base+candidateUrl());
    assert.equal(r.status,503);
    assert.match((await r.json()).error,/Base RPC for selected network not configured/);
    const status=await (await fetch(base+'/api/status')).json();
    assert.equal(status.baseMainnetRpcConfigured,false);
    assert.equal(status.baseSepoliaRpcConfigured,true);
  },{mainnet:null,inspect:async()=>{called++;return verified;}});
  assert.equal(called,0);
});
test('Get transfer discovery uses mainnet RPC only when mainnet is chosen',async()=>{
  const seen=[];
  await serve(async base=>{
    const r=await fetch(base+'/api/inspect?network=eip155:8453&txHash='+TX);
    assert.equal(r.status,200);
    assert.equal((await r.json()).txHash,TX);
  },{inspect:async (arg,{rpcUrl})=>{seen.push(rpcUrl);return verified;}});
  assert.deepEqual(seen,['https://mainnet.base.org']);
});
test('Existing V1 case from Sepolia stays on original RPC, independent of mainnet config',async()=>{
  const source=await import('../scripts/prepare-first-paid-case.mjs');
  const {caseIdForClaim}=await import('../src/payment.mjs');
  const claim=source.firstPaymentClaim();
  const caseId=caseIdForClaim(claim);
  const calls=[];
  await serve(async base=>{
    const r=await fetch(base+'/api/verify',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(claim)});
    assert.equal(r.status,200);
    assert.equal((await r.json()).caseId,caseId);
  },{verify:async (arg,{rpcUrl})=>{
    calls.push(rpcUrl);
    return {result:'BASE_USDC_TRANSFER_VERIFIED',
      network:arg.network,txHash:arg.txHash,asset:arg.asset,payer:arg.payer,
      payee:arg.payee,amountAtomic:arg.amountAtomic,confirmations:2}
  }});
  assert.deepEqual(calls,['https://sepolia.base.org']);
});
