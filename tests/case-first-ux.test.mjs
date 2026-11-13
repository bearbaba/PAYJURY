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
test('user overview, manager workspace and presentation all show authentic live case',async()=>{
  await serve(async base=>{
    const html=await (await fetch(base+'/')).text();
    const js=await (await fetch(base+'/app.js')).text();
    const css=await (await fetch(base+'/styles.css')).text();
    assert.ok(html.indexOf('id="case-tracker"')>0);
    assert.ok(html.indexOf('id="case-tracker"')<html.indexOf('id="workflow"'));
    assert.match(html,/href="#case-tracker">View verified V2 verdict/);
    assert.match(html,/data-open-view="overview"/);
    assert.match(html,/data-open-view="workspace"/);
    assert.match(html,/data-open-view="demo"/);
    assert.match(html,/body data-view="overview"/);
    assert.match(html,/id="proof-timeline"/);
    assert.match(html,/id="track-outcome"/);
    assert.match(html,/id="track-export"/);
    assert.match(html,/id="track-docket"/);
    assert.match(html,/id="track-decision-link"/);
    assert.match(html,/WHY GENLAYER AI/);
    assert.match(html,/Load latest verified V2 case/);
    assert.match(html,/id="track-version"/);
    assert.match(html,/value="pj_6575f7352b41602401caf317ce30f86b"/);
    assert.match(html,/id="deployment-message"/);
    assert.match(js,/queueMicrotask\(\(\)=>/);
    assert.match(js,/\$\('track-form'\)\.requestSubmit\(\)/);
    assert.match(js,/function openPayjuryView/);
    assert.match(js,/function proofState/);
    assert.match(js,/lastVerifiedTrack=null/);
    assert.match(css,/body\[data-view=overview\] #workflow/);
    assert.match(css,/body\[data-view=demo\] \.tracker-head/);
    assert.match(css,/\.proof-timeline\{display:grid/);
  });
});
test('workflow has four accessible phases and no misleading permanent read-only claim',async()=>{
  await serve(async base=>{
    const html=await (await fetch(base+'/')).text();
    assert.deepEqual([...html.matchAll(/data-workflow-step="(\d)"/g)].map(m=>Number(m[1])),
      [1,2,3,4]);
    assert.match(html,/Manage a case\. Not a dozen tabs\./);
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
