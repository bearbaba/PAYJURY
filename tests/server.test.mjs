import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';

async function serve(fn){
  const server=createServer({rpcUrl:undefined});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try {await fn(base);}finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
}
test('web UI and styles are served without external scripts or server-side pay actions',async()=>{
  await serve(async base=>{
    for(const path of ['/','/app.js','/styles.css']){
      const res=await fetch(base+path);
      assert.equal(res.status,200);
      const body=await res.text();
      assert.ok(body.length>400);
    }
    const res=await fetch(base+'/');
    assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
  });
});
test('status reports no signed execution and no fictitious success',async()=>{
  await serve(async base=>{
    const res=await fetch(base+'/api/status');
    const data=await res.json();
    assert.equal(data.acceptsPayments,false);
    assert.equal(data.signsGenLayerWrites,false);
    assert.equal(data.mode,'evidence-first');
  });
});
test('payment verification without a configured RPC refuses to prepare a case',async()=>{
  const claim={network:'eip155:84532',asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    txHash:'0x'+'a'.repeat(64),payer:'0x'+'1'.repeat(40),payee:'0x'+'2'.repeat(40),
    amountAtomic:'10000',endpoint:'https://api.example.com/report',terms:'Requirement',
    delivery:'Output',evidence:'Supporting record'};
  await serve(async base=>{
    const res=await fetch(base+'/api/verify',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(claim)});
    assert.equal(res.status,503);
    assert.match((await res.json()).error,/Base RPC for selected network not configured/);
  });
});
test('empty or malformed verification payload is rejected without signing',async()=>{
  await serve(async base=>{
    const res=await fetch(base+'/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:'not-json'});
    assert.equal(res.status,422);
  });
});
test('missing GenLayer deployment must never synthesize a verdict',async()=>{
  await serve(async base=>{
    const res=await fetch(base+'/api/verdict?caseId=pj_'+'a'.repeat(32));
    assert.equal(res.status,422);
    assert.match((await res.json()).error,/not independently readable/);
  });
});

test('payment auto-fill API refuses execution if Base RPC is not configured',async()=>{
  await serve(async base=>{
    const txHash='0x'+'a'.repeat(64);
    const res=await fetch(base+'/api/inspect?network=eip155:84532&txHash='+txHash);
    assert.equal(res.status,503);
    assert.match((await res.json()).error,/Base RPC for selected network not configured/);
    const html=await (await fetch(base+'/')).text();
    assert.match(html,/id="autofill-transfer"/);
  });
});
