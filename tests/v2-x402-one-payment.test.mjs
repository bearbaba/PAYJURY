import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  serveV2X402,validateV2PaymentSignature,EXPECTED_ATOMIC,EXPECTED_TOKEN
} from '../src/v2-x402-relay.mjs';
import {V2_SIGNER,KNOWN_PREVIOUS_PAYEE,PROPOSED_PAID_ENDPOINT} from '../src/v2-fresh-preflight.mjs';
const TX='0x'+'a'.repeat(64);
const NOW=Math.floor(Date.now()/1000);
const accepted={
  scheme:'exact',network:'eip155:84532',amount:EXPECTED_ATOMIC,
  asset:EXPECTED_TOKEN,payTo:KNOWN_PREVIOUS_PAYEE,
  maxTimeoutSeconds:60,extra:{name:'USDC',version:'2',assetTransferMethod:'eip3009'}
};
const payment={
  x402Version:2,resource:{url:PROPOSED_PAID_ENDPOINT},
  accepted,payload:{
    signature:'0x'+'1'.repeat(130),
    authorization:{
      from:V2_SIGNER,to:KNOWN_PREVIOUS_PAYEE,value:EXPECTED_ATOMIC,
      validAfter:String(NOW-60),validBefore:String(NOW+60),nonce:TX
    }
  },extensions:{}
};
const header=Buffer.from(JSON.stringify(payment)).toString('base64');
const quoted=Buffer.from(JSON.stringify({
  x402Version:2,resource:{url:PROPOSED_PAID_ENDPOINT},accepts:[accepted]
})).toString('base64');
const settlement=Buffer.from(JSON.stringify({
  success:true,network:'eip155:84532',transaction:TX,payer:V2_SIGNER
})).toString('base64');
const proof={
  result:'BASE_USDC_TRANSFER_VERIFIED',network:'eip155:84532',
  txHash:TX,asset:EXPECTED_TOKEN,payer:V2_SIGNER,payee:KNOWN_PREVIOUS_PAYEE,
  amountAtomic:EXPECTED_ATOMIC,confirmations:3,blockNumber:'8888'
};
function fResponse(status,headers={},body='ok'){
  return {status,ok:status>=200&&status<300,
    headers:{get:key=>headers[key.toLowerCase()]||null},
    arrayBuffer:async()=>new TextEncoder().encode(body).buffer};
}
async function mockServer(fn,{fetchImpl,ready,verify,lockDir}={}){
  const server=http.createServer((req,res)=>serveV2X402({
    req,res,rpcUrl:'https://sepolia.base.org',fetchImpl,
    ready,verify,lockDir
  }));
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{await fn('http://127.0.0.1:'+server.address().port);}
  finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
const PREVIEW={result:'V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY',
  wallet:V2_SIGNER,network:'eip155:84532',requiredAtomic:EXPECTED_ATOMIC,
  quoteVerified:true,availableAtomic:'20000'};
const ready=async()=>PREVIEW;
test('exact matching signed EIP-3009 envelope is accepted; other asset, payer or Permit2 is not',()=>{
  assert.equal(validateV2PaymentSignature(header).payer,V2_SIGNER);
  const variants=[
    {...payment,accepted:{...accepted,amount:'20000'}},
    {...payment,accepted:{...accepted,network:'eip155:8453'}},
    {...payment,accepted:{...accepted,extra:{assetTransferMethod:'permit2'}}},
    {...payment,payload:{...payment.payload,authorization:{
      ...payment.payload.authorization,from:'0x'+'3'.repeat(40)}}}
  ];
  for(const bad of variants){
    assert.throws(()=>validateV2PaymentSignature(Buffer.from(JSON.stringify(bad)).toString('base64')),
      /does not match approved purchase/);
  }
});
test('GET quote performs no wallet signing or purchase and advertises exact one-shot testnet cap',async()=>{
  await mockServer(async base=>{
    const r=await fetch(base+'/api/v2/x402/quote');
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.oneShot,true);
    assert.equal(data.wallet,V2_SIGNER);
    assert.equal(data.paymentExecuted,undefined);
    assert.equal(data.operatorMustApproveWalletSignature,true);
  },{ready});
});
test('unsigned GET execute returns exact merchant 402 header without making a paid request',async()=>{
  let calls=0;
  await mockServer(async base=>{
    const r=await fetch(base+'/api/v2/x402/execute');
    assert.equal(r.status,402);
    assert.equal(r.headers.get('payment-required'),quoted);
    assert.equal(calls,1);
  },{fetchImpl:async url=>{
    calls++;assert.equal(url,PROPOSED_PAID_ENDPOINT);
    return fResponse(402,{'payment-required':quoted});
  }});
});
test('signed payment can only be forwarded once after signer/quote/balance checks; yields PREPARED not FILED',async()=>{
  const lockDir=await mkdtemp(join(tmpdir(),'payjury-x402-test-'));
  let purchaseCalls=0;
  try{
    await mockServer(async base=>{
      const first=await fetch(base+'/api/v2/x402/execute',{headers:{'payment-signature':header}});
      assert.equal(first.status,200);
      const result=await first.json();
      assert.equal(result.result,'PAYMENT_AND_BASE_USDC_VERIFIED_V2_CASE_PREPARED');
      assert.equal(result.paymentTx,TX);
      assert.equal(result.packet.payer,V2_SIGNER);
      assert.equal(result.packet.status,'PREPARED_NOT_FILED');
      assert.equal(result.packet.settlement.result,'BASE_USDC_TRANSFER_VERIFIED');
      assert.equal(result.genlayerFileCaseSubmitted,false);
      assert.equal(result.genlayerDecisionSubmitted,false);
      const repeat=await fetch(base+'/api/v2/x402/execute',{headers:{'payment-signature':header}});
      assert.equal(repeat.status,409);
      assert.equal((await repeat.json()).result,'EXISTING_PAYMENT_ATTEMPT_LOCKED');
    },{
      ready,
      verify:async(claim,{rpcUrl,requiredConfirmations})=>{
        assert.equal(rpcUrl,'https://sepolia.base.org');
        assert.equal(requiredConfirmations,2);
        assert.equal(claim.payer,V2_SIGNER);
        return proof;
      },
      lockDir,
      fetchImpl:async(url,opts)=>{
        assert.equal(url,PROPOSED_PAID_ENDPOINT);
        assert.equal(opts.headers['payment-signature'],header);
        purchaseCalls++;
        return fResponse(200,{'payment-response':settlement},'{"hello":"world"}');
      }
    });
    assert.equal(purchaseCalls,1);
    const file=await readFile(join(lockDir,'out','v2-new-'+TX.slice(2)+'.json'),'utf8');
    assert.match(file,/PAYMENT_AND_BASE_USDC_VERIFIED_V2_CASE_PREPARED/);
    assert.doesNotMatch(file,/payment-signature|privateKey|secret/i);
  }finally{await rm(lockDir,{recursive:true,force:true});}
});
test('upstream network failure after signed payment remains locked and never retries',async()=>{
  const lockDir=await mkdtemp(join(tmpdir(),'payjury-x402-unknown-'));
  let calls=0;
  try{
    await mockServer(async base=>{
      const a=await fetch(base+'/api/v2/x402/execute',{headers:{'payment-signature':header}});
      assert.equal(a.status,202);
      assert.equal((await a.json()).result,'PAYMENT_OUTCOME_UNKNOWN');
      const b=await fetch(base+'/api/v2/x402/execute',{headers:{'payment-signature':header}});
      assert.equal(b.status,409);
    },{lockDir,ready,fetchImpl:async()=>{calls++;throw Error('upstream disconnected');}});
    assert.equal(calls,1);
  }finally{await rm(lockDir,{recursive:true,force:true});}
});
test('rejected signature and wrong chain never call paid endpoint',async()=>{
  const lockDir=await mkdtemp(join(tmpdir(),'payjury-x402-invalid-'));
  let calls=0;
  try{
    await mockServer(async base=>{
      const bad=await fetch(base+'/api/v2/x402/execute',{
        headers:{'payment-signature':'invalid'}});
      assert.equal(bad.status,422);
      const post=await fetch(base+'/api/v2/x402/execute',{method:'POST'});
      assert.equal(post.status,405);
    },{lockDir,ready,fetchImpl:async()=>{calls++;return fResponse(200);}});
    assert.equal(calls,0);
  }finally{await rm(lockDir,{recursive:true,force:true});}
});
