import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';

async function serve(callback){
  const server=createServer({rpcUrl:undefined});
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{await callback(base);}finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
test('case creation precedes historical tracker and primary CTAs lead to correct section',async()=>{
  await serve(async base=>{
    const html=await (await fetch(base+'/')).text();
    assert.ok(html.indexOf('id="workflow"')>0);
    assert.ok(html.indexOf('id="case-tracker"')>html.indexOf('id="workflow"'));
    assert.match(html,/href="#workflow">Start a case/);
    assert.match(html,/href="#case-tracker">Track an existing case/);
    assert.match(html,/href="#workflow">Create case/);
    assert.match(html,/href="#case-tracker">Track case/);
    assert.match(html,/id="deployment-message"/);
  });
});
test('workflow has four accessible phases and no misleading permanent read-only claim',async()=>{
  await serve(async base=>{
    const html=await (await fetch(base+'/')).text();
    assert.deepEqual([...html.matchAll(/data-workflow-step="(\d)"/g)].map(m=>Number(m[1])),
      [1,2,3,4]);
    assert.match(html,/One place\./);
    assert.doesNotMatch(html,/Nothing is signed or paid by this page\./);
    assert.match(html,/filing and wallet approvals remain locked|Wallet signing remains unavailable/);
    assert.match(html,/id="v2-connect" disabled/);
    assert.match(html,/id="v2-file" disabled/);
    assert.match(html,/id="v2-adjudicate" disabled/);
    assert.match(html,/id="autofill-transfer"/);
  });
});
test('payment detection is first, advanced metadata collapses, and JS invalidates stale case when edited',async()=>{
  await serve(async base=>{
    const html=await (await fetch(base+'/')).text();
    const js=await (await fetch(base+'/app.js')).text();
    const css=await (await fetch(base+'/styles.css')).text();
    const p=html.indexOf('id="network"');
    const tx=html.indexOf('name="txHash"');
    const detected=html.indexOf('id="autofill-transfer"');
    const terms=html.indexOf('name="terms"');
    const advanced=html.indexOf('class="advanced-payment"');
    assert.ok(p>0 && p<tx && tx<detected && detected<advanced && advanced<terms);
    assert.equal((html.match(/name="asset"/g)||[]).length,1);
    assert.match(html,/<details class="advanced-payment">/);
    assert.match(js,/function setWorkflowStage/);
    assert.match(js,/form\.addEventListener\('input'/);
    assert.match(js,/updateV2PreparedPacket\(null\)/);
    assert.match(css,/\.hero\{min-height:410px/);
    assert.match(css,/\.work-grid\>\*\{min-width:0\}/);
  });
});
