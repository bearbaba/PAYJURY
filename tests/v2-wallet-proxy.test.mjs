import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';

const V2='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const EVM_ADDRESS='0x'+'1'.repeat(40);
const ANOTHER='0x'+'2'.repeat(40);
const TX='0x'+'a'.repeat(64);
const CASE='pj_'+'b'.repeat(32);
async function serve(testFn,read=async()=>true,tx=async()=>({
  hash:TX,statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN',result:1
})){
  const previous=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=V2;
  const server=createServer({rpcUrl:undefined,v2Reader:read,v2TxReader:tx});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{await testFn(base);}finally{
    if(previous===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=previous;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
function url(method,args){
  return '/api/v2/read?method='+encodeURIComponent(method)+
    '&args='+encodeURIComponent(JSON.stringify(args));
}
test('CSP permits only same-origin and canonical GenLayer Studionet for SDK wallet RPC',async()=>{
  await serve(async base=>{
    const r=await fetch(base+'/');
    const csp=r.headers.get('content-security-policy');
    assert.match(csp,/connect-src 'self' https:\/\/studio\.genlayer\.com;/);
    assert.doesNotMatch(csp,/connect-src \*/);
    assert.match(csp,/script-src 'self'/);
  });
});
test('same-origin V2 version read verifies exact configured address without wallet signing',async()=>{
  const seen=[];
  await serve(async base=>{
    const response=await fetch(base+url('version',[]));
    assert.equal(response.status,200);
    const output=await response.json();
    assert.equal(output.address,V2);
    assert.equal(output.method,'version');
    assert.equal(output.result,'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1');
    assert.equal(output.readOnly,true);
  },async req=>{
    seen.push(req);
    return 'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
  });
  assert.deepEqual(seen,[{address:V2,functionName:'version',args:[]}]);
});
test('read-only proxy correctly accepts four scoped signer authorization args',async()=>{
  const calls=[];
  await serve(async base=>{
    const response=await fetch(base+url('can_file_for',[EVM_ADDRESS,'eip155:84532',TX,ANOTHER]));
    assert.equal(response.status,200);
    assert.equal((await response.json()).result,false);
  },async call=>{calls.push(call);return false;});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].args,[EVM_ADDRESS,'eip155:84532',TX,ANOTHER]);
});
test('get_case and filing_status use only valid, bounded exact contract arguments',async()=>{
  await serve(async base=>{
    const get=await fetch(base+url('get_case',[CASE]));
    assert.equal(get.status,200);
    assert.equal((await get.json()).result,true);
    const filing=await fetch(base+url('filing_status',[
      CASE,'eip155:84532',TX,EVM_ADDRESS,EVM_ADDRESS,ANOTHER,'10000',EVM_ADDRESS]));
    assert.equal(filing.status,200);
  });
});
test('rejects arbitrary read methods, malformed arguments, extraneous args and other chains',async()=>{
  let calls=0;
  await serve(async base=>{
    const probes=[
      url('file_case',[]),url('writeContract',[]),url('adjudicate_case',[]),
      url('version',[EVM_ADDRESS]),url('can_file_for',[EVM_ADDRESS,ANOTHER]),
      url('can_file_for',[EVM_ADDRESS,'eip155:1',TX,ANOTHER]),
      url('get_case',['pj_'+'z'.repeat(32)]),
      url('filing_status',[CASE,'eip155:84532']),
      '/api/v2/read?method=version&args=%7Bnot-json',
      '/api/v2/read?method=version&args='+encodeURIComponent(JSON.stringify(['a'.repeat(2000)]))
    ];
    for(const probe of probes){
      const response=await fetch(base+probe);
      assert.equal(response.status,422,probe);
    }
    const post=await fetch(base+'/api/v2/read',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    assert.equal(post.status,404);
  },async()=>{calls++;return true;});
  assert.equal(calls,0);
});
test('read-only V2 RPC failure is a clear nontransactional error, not invented success',async()=>{
  await serve(async base=>{
    const r=await fetch(base+url('version',[]));
    assert.equal(r.status,503);
    assert.match((await r.json()).error,/RPC read unavailable.*No wallet transaction/);
  },async()=>{throw Error('An unknown RPC error occurred');});
});
test('transaction finality readback is server-side and never retransmits',async()=>{
  let reads=0;
  await serve(async base=>{
    const r=await fetch(base+'/api/v2/tx?hash='+TX);
    assert.equal(r.status,200);
    const result=await r.json();
    assert.equal(result.finalized,true);
    assert.equal(result.success,true);
    assert.equal(result.hash,TX);
    const missing=await fetch(base+'/api/v2/tx?hash=invalid');
    assert.equal(missing.status,422);
  },undefined,async({hash})=>{assert.equal(hash,TX);reads++;return {
    hash,statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'
  };});
  assert.equal(reads,1);
});
test('contract not configured prevents V2 browser reads',async()=>{
  const previous=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  const server=createServer({rpcUrl:undefined,v2Reader:async()=>true});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const response=await fetch('http://127.0.0.1:'+server.address().port+url('version',[]));
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/not configured/);
  }finally{
    if(previous!==undefined)process.env.GENLAYER_V2_CONTRACT_ADDRESS=previous;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
