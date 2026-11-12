import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from '../src/server.mjs';
import {caseIdForClaim} from '../src/payment.mjs';
import {acceptedV2Claim,ACCEPTED_V2_CASE_ID,ACCEPTED_V2_BASE_TX,
  restoreAcceptedV2Case} from '../src/v2-known-case.mjs';
const CONTRACT='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const validReceipt={
  result:'BASE_USDC_TRANSFER_VERIFIED',
  network:acceptedV2Claim.network,txHash:acceptedV2Claim.txHash,
  asset:acceptedV2Claim.asset,payer:acceptedV2Claim.payer,
  payee:acceptedV2Claim.payee,amountAtomic:acceptedV2Claim.amountAtomic,
  confirmations:18,blockNumber:'57382405'
};
test('owner-provided paid V2 packet has the exact existing canonical ID, never invents a new case',()=>{
  assert.equal(caseIdForClaim(acceptedV2Claim),ACCEPTED_V2_CASE_ID);
  assert.equal(acceptedV2Claim.txHash,ACCEPTED_V2_BASE_TX);
  assert.equal(acceptedV2Claim.network,'eip155:84532');
  assert.equal(acceptedV2Claim.amountAtomic,'10000');
});
test('resume existing V2 case fails closed without independent Base USDC verifier',async()=>{
  await assert.rejects(restoreAcceptedV2Case({}),/Independent Base RPC verifier is required/);
  await assert.rejects(restoreAcceptedV2Case({verifyTransfer:async()=>({
    ...validReceipt,payee:'0x'+'a'.repeat(40)
  }),rpcUrl:'https://sepolia.base.org'}),/Independent Base payment verification required/);
});
test('GET resume-known independently re-verifies existing Base TX without any payment or wallet write',async()=>{
  const prior=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=CONTRACT;
  let checks=0;
  const server=createServer({rpcUrl:'https://sepolia.base.org',
    verifyTransfer:async (claim,{rpcUrl,requiredConfirmations})=>{
      checks++;
      assert.deepEqual(claim,acceptedV2Claim);
      assert.equal(rpcUrl,'https://sepolia.base.org');
      assert.equal(requiredConfirmations,2);
      return validReceipt;
    }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/resume-known');
    assert.equal(res.status,200);
    const out=await res.json();
    assert.equal(out.caseId,ACCEPTED_V2_CASE_ID);
    assert.equal(out.txHash,ACCEPTED_V2_BASE_TX);
    assert.equal(out.status,'PREPARED_NOT_FILED');
    assert.equal(out.restoredReadOnly,true);
    assert.equal(out.genlayerFileCaseSubmitted,false);
    assert.equal(out.genlayerDecisionSubmitted,false);
    assert.equal(out.settlement.result,'BASE_USDC_TRANSFER_VERIFIED');
    assert.equal(out.x402ReceiptMatched,false);
    assert.equal(out.terms,acceptedV2Claim.terms);
    assert.equal(out.delivery,acceptedV2Claim.delivery);
    assert.equal(out.evidence,acceptedV2Claim.evidence);
    assert.equal(checks,1);
  }finally{
    if(prior===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prior;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
test('resume-known rejects receipt mismatch; no false payment acceptance',async()=>{
  const prior=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=CONTRACT;
  const server=createServer({rpcUrl:'https://sepolia.base.org',
    verifyTransfer:async()=>({...validReceipt,amountAtomic:'20000'})});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/v2/resume-known');
    assert.equal(r.status,503);
    assert.match((await r.json()).error,/could not be independently reverified/);
  }finally{
    if(prior===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prior;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
test('V2 wallet uses REAL genlayer-js 1.1.8 supported writer, never unsupported fee estimator',async()=>{
  const [{createClient,createAccount},{studionet}]=await Promise.all([
    import('genlayer-js'),import('genlayer-js/chains')
  ]);
  const client=createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
  assert.equal(typeof client.writeContract,'function');
  assert.equal(typeof client.estimateTransactionFeesForWrite,'undefined');
  const studio=await readFile(new URL('../web/studio-wallet.mjs',import.meta.url),'utf8');
  const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  assert.match(studio,/export async function preflightV2Write\(/);
  assert.match(studio,/export async function sendV2Write\(address,fn,args,preparedWrite\)/);
  assert.match(studio,/writeClient\.writeContract\(preparedWrite\)/);
  assert.match(studio,/value:0n/);
  assert.doesNotMatch(studio,/writeClient\.estimateTransactionFeesForWrite\(/);
  assert.doesNotMatch(studio,/fees:estimatedFees/);
  const start=app.indexOf('async function v2Write(');
  const source=app.slice(start,app.indexOf("fetch('/api/status')",start));
  const preflightAt=source.indexOf('sdk.preflightV2Write(');
  const lockAt=source.indexOf("writeLock(caseId,lockMethod,{state:'ATTEMPTED_UNKNOWN'");
  const writeAt=source.indexOf('sdk.sendV2Write(');
  assert.ok(preflightAt>=0&&lockAt>preflightAt&&writeAt>lockAt);
  assert.match(app,/\/api\/v2\/resume-known/);
  assert.match(html,/id="v2-restore-paid"/);
});
