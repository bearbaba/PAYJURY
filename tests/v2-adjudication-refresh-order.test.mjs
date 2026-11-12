import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const readApp=()=>readFile(new URL('../web/app.js',import.meta.url),'utf8');

test('Refresh recorded TX prioritizes the already submitted adjudication',async()=>{
  const app=await readApp();
  assert.match(app,/for\(const action of \['adjudicate_case','file_case'\]\)/);
  assert.match(app,/if\(existing\?\.hash\)\{await refreshRecordedTransaction\(id,action,existing\.hash\);return;\}/);
});

test('Existing signed AI decision disables a second adjudicate prompt',async()=>{
  const app=await readApp();
  assert.match(app,/signedLock\(trackedCaseV2\.caseId,'adjudicate_case'\)/);
  assert.match(app,/\$\('v2-adjudicate'\)\.disabled=!signed\|\|!pending\|\|attemptedDecision/);
  assert.match(app,/const existing=signedLock\(caseId,method\);/);
  assert.match(app,/if\(existing\)throw Error\(/);
});

test('Refresh remains read-only and never retries payment or signs a TX',async()=>{
  const app=await readApp();
  const start=app.indexOf("$('v2-resume').addEventListener('click'");
  const end=app.indexOf("$('v2-delegate').addEventListener('input'",start);
  assert.ok(start>0&&end>start);
  const refreshHandler=app.slice(start,end);
  assert.match(refreshHandler,/refreshRecordedTransaction/);
  assert.doesNotMatch(refreshHandler,/v2Write|sendV2Write|payV2X402Once/);
});
