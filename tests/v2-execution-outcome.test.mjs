import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from '../src/server.mjs';
import {summarizeV2ReadOnlyTx} from '../src/genlayer-v2-tx-outcome.mjs';

const TX='0xd6dffb31d5595ef5b70e1f3b75816161950822916e6444e39a5a3385e9ad2018';
const CONTRACT='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const receipt=execution_result=>({
  hash:TX,statusName:'FINALIZED',
  consensus_data:{leader_receipt:[{
    execution_result,genvm_result:{stdout:'',stderr:''}
  }]}
});

test('Studio GenVM receipt SUCCESS is final success even if SDK top-level execution fields are missing',()=>{
  const x=summarizeV2ReadOnlyTx(receipt('SUCCESS'),TX);
  assert.equal(x.status,'FINALIZED');
  assert.equal(x.execution,'FINISHED_WITH_RETURN');
  assert.equal(x.executionKnown,true);
  assert.equal(x.success,true);
  assert.match(x.executionSource,/leader_receipt/);
});
test('Studio GenVM receipt ERROR is a genuine error even if consensus says FINALIZED',()=>{
  const x=summarizeV2ReadOnlyTx(receipt('ERROR'),TX);
  assert.equal(x.execution,'FINISHED_WITH_ERROR');
  assert.equal(x.success,false);
  assert.equal(x.finalized,true);
});
test('unknown execution NEVER implies a failed contract call or successful GenLayer filing',()=>{
  const x=summarizeV2ReadOnlyTx({hash:TX,statusName:'FINALIZED'},TX);
  assert.equal(x.finalized,true);
  assert.equal(x.execution,'UNKNOWN');
  assert.equal(x.executionKnown,false);
  assert.equal(x.success,false);
  assert.match(x.note,/not evidence/);
});
test('top-level SDK execution and receipt agree; contradicting sources fail closed',()=>{
  const agrees=summarizeV2ReadOnlyTx({
    ...receipt('SUCCESS'),txExecutionResult:1,txExecutionResultName:'FINISHED_WITH_RETURN'
  },TX);
  assert.equal(agrees.success,true);
  assert.equal(agrees.executionConflict,false);
  const contradicts=summarizeV2ReadOnlyTx({
    ...receipt('ERROR'),txExecutionResult:1,txExecutionResultName:'FINISHED_WITH_RETURN'
  },TX);
  assert.equal(contradicts.execution,'UNKNOWN');
  assert.equal(contradicts.executionConflict,true);
  assert.equal(contradicts.success,false);
});
test('normalizes single leader-receipt object and numeric execution codes',()=>{
  const x=summarizeV2ReadOnlyTx({
    status:'FINALIZED',txExecutionResult:'2',
    consensus_data:{leader_receipt:{execution_result:'FINISHED_WITH_ERROR'}}
  },TX);
  assert.equal(x.execution,'FINISHED_WITH_ERROR');
  assert.equal(x.executionKnown,true);
  assert.equal(x.success,false);
});
test('ACCEPTED / SUCCESS GenVM remains not FINALIZED success',()=>{
  const x=summarizeV2ReadOnlyTx({...receipt('SUCCESS'),statusName:'ACCEPTED'},TX);
  assert.equal(x.finalized,false);
  assert.equal(x.success,false);
});
async function serve(reader,fn){
  const prev=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=CONTRACT;
  const server=createServer({rpcUrl:undefined,v2TxReader:reader});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try{await fn('http://127.0.0.1:'+server.address().port);}
  finally{
    if(prev===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prev;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
test('same-origin V2 transaction endpoint decodes actual Studio receipt and never retransmits',async()=>{
  let reads=0;
  await serve(async({hash})=>{
    assert.equal(hash,TX);reads++;return receipt('SUCCESS');
  },async base=>{
    const r=await fetch(base+'/api/v2/tx?hash='+TX);
    assert.equal(r.status,200);
    const x=await r.json();
    assert.equal(x.execution,'FINISHED_WITH_RETURN');
    assert.equal(x.success,true);
    assert.equal(x.executionKnown,true);
    assert.equal(x.finalized,true);
  });
  assert.equal(reads,1);
});
test('backend catches both hash and txId mismatches, never trusts wrong TX',async()=>{
  await serve(async()=>({...receipt('SUCCESS'),hash:undefined,txId:'0x'+'a'.repeat(64)}),
    async base=>{
      const r=await fetch(base+'/api/v2/tx?hash='+TX);
      assert.equal(r.status,503);
      assert.match((await r.json()).error,/hash mismatch/);
    });
});
test('browser treats UNKNOWN execution as unverified and only advances after independent canonical V2 case readback',async()=>{
  const ui=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  const sdk=await readFile(new URL('../web/studio-wallet.mjs',import.meta.url),'utf8');
  assert.match(ui,/state\.execution==='UNKNOWN'/);
  assert.match(ui,/return refreshV2Readback\(caseId,method,\{executionUnverified:true\}\)/);
  assert.match(ui,/result\.identityBinding!=='DETERMINISTIC_ID_MATCHED'/);
  assert.match(ui,/result\.settlement\?\.status!=='BASE_USDC_TRANSFER_VERIFIED'/);
  assert.match(ui,/if\(method==='adjudicate_case'&&result\.caseStatus!=='DECIDED'\)/);
  assert.match(ui,/if\(method==='file_case'&&!\['FILED','DECIDED'\]\.includes\(result\.caseStatus\)\)/);
  assert.match(sdk,/executionKnown:body\.executionKnown===true/);
});
