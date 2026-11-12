import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=()=>readFile(new URL('../web/app.js',import.meta.url),'utf8');

test('restoring a verified V2 packet does not claim that its chain case is NOT FILED',async()=>{
  const app=await read();
  const start=app.indexOf("$('v2-import-verify').addEventListener");
  const end=app.indexOf("fetch('/api/status')",start);
  assert.ok(start>0&&end>start);
  const restore=app.slice(start,end);
  assert.match(restore,/\$\('verdict'\)\.textContent='NOT CHECKED'/);
  assert.match(restore,/\/api\/case\?version=v2&caseId=/);
  assert.match(restore,/method:'GET',cache:'no-store'/);
  assert.match(restore,/syncCurrentV2WorkflowReadback\(onChain\)/);
  assert.doesNotMatch(restore,/Original paid case restored — not filed/);
  assert.doesNotMatch(restore,/v2Write|sendV2Write|payV2X402Once|requestSubmit/);
});

test('Current Workflow only reflects the matching canonical V2 GenLayer case and independent Base transfer',async()=>{
  const app=await read();
  const start=app.indexOf('function syncCurrentV2WorkflowReadback(data)');
  const end=app.indexOf('function updateV2TrackedCase(data)',start);
  assert.ok(start>0&&end>start);
  const helper=app.slice(start,end);
  for(const fragment of [
    "data?.caseId!==p.caseId","data.contractVersion!=='v2'",
    "data.identityBinding!=='DETERMINISTIC_ID_MATCHED'",
    "data.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED'",
    "data.txHash!==p.txHash","data.payer!==p.payer",
    "data.payee!==p.payee","data.amountAtomic!==p.amountAtomic",
    "'FILED','DECIDED'","data.reason.trim()","data.verdict!=='PENDING'"
  ])assert.ok(helper.includes(fragment),fragment);
  assert.match(helper,/\$\('verdict'\)\.textContent=data\.caseStatus==='DECIDED'\?data\.verdict:'PENDING'/);
  assert.match(app,/function updateV2TrackedCase\(data\)\{\n  trackedCaseV2=data;\n  syncCurrentV2WorkflowReadback\(data\);/);
});
