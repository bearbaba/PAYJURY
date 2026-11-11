import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';
import {firstPaymentClaim} from '../scripts/prepare-first-paid-case.mjs';
import {caseIdForClaim} from '../src/payment.mjs';

test('V1 stays read-only and V2 signing is not advertised before a new V2 deployment',async()=>{
  const original=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  const server=createServer({rpcUrl:'https://sepolia.base.org'});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const status=await (await fetch(base+'/api/status')).json();
    assert.equal(status.v2FilingEnabled,false);
    assert.equal(status.genlayerV2ContractAddress,null);
    assert.equal(status.acceptsPayments,false);
    assert.equal(status.signsGenLayerWrites,false);
    const missing=await fetch(base+'/api/case?version=v2&caseId='+caseIdForClaim(firstPaymentClaim()));
    assert.equal(missing.status,503);
    assert.match((await missing.json()).error,/V2 contract not configured/);
    const html=await (await fetch(base+'/')).text();
    for(const needle of ['id="v2-connect"','id="v2-file"','id="v2-adjudicate"','id="v2-authorize"','id="v2-revoke"','id="v2-mode"','id="track-version"'])
      assert.ok(html.includes(needle),needle);
    const bundle=await fetch(base+'/studio-wallet.bundle.js');
    assert.equal(bundle.status,200);
    assert.match(bundle.headers.get('content-type'),/javascript/);
  }finally{
    if(original===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=original;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
test('V2 tracker reads only the configured second contract, not historical V1',async()=>{
  const addr='0x'+'a'.repeat(40);
  const prev=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=addr;
  const claim=firstPaymentClaim();
  const caseId=caseIdForClaim(claim);
  const record={case_id:caseId,network:claim.network,tx_hash:claim.txHash,
    asset:claim.asset,payer:claim.payer,payee:claim.payee,
    amount_atomic:claim.amountAtomic,endpoint:claim.endpoint,
    terms:claim.terms,delivery:claim.delivery,evidence:claim.evidence,
    claimant:'0x'+'a'.repeat(40),status:'FILED',verdict:'PENDING',reason:''};
  let seen=null;
  const server=createServer({rpcUrl:undefined,
    caseReader:async (id,address)=>{seen={id,address};return record;}});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const res=await fetch(base+'/api/case?version=v2&caseId='+caseId);
    assert.equal(res.status,200);
    assert.deepEqual(seen,{id:caseId,address:addr});
    const body=await res.json();
    assert.equal(body.caseStatus,'FILED');
    assert.equal(body.contractVersion,'v2');
    assert.equal(body.contractAddress,addr);
    assert.equal(body.settlement.status,'NOT_VERIFIED');
  }finally{
    if(prev===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prev;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
