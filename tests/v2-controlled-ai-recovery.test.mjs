import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const app=()=>readFile(new URL('../web/app.js',import.meta.url),'utf8');
test('Extra adjudication is pinned to one case and old TX with fresh consensus and case checks',async()=>{
  const s=await app();
  assert.match(s,/const SECOND_AI_CASE='pj_6575f7352b41602401caf317ce30f86b'/);
  assert.match(s,/const FIRST_AI_ATTEMPT='0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510'/);
  assert.match(s,/tx\\.status!=='FINALIZED'/);
  assert.match(s,/entered!=='UNDETERMINED'/);
  assert.match(s,/caseData\.caseStatus!=='FILED'/);
  assert.match(s,/caseData\.verdict!=='PENDING'/);
  assert.match(s,/caseData\.settlement\?\.status!=='BASE_USDC_TRANSFER_VERIFIED'/);
  assert.match(s,/sdk\.readV2Contract\(v2Address,'get_case',\[p\.caseId\]\)/);
});
test('Never clear initial AI or x402 lock and separate recovery remains one-shot',async()=>{
  const s=await app();
  assert.match(s,/v2Write\('adjudicate_case',p\.caseId,\[p\.caseId\],null,'adjudicate_case_recovery'\)/);
  assert.match(s,/signedLock\(p\.caseId,'adjudicate_case_recovery'\)/);
  assert.match(s,/writeLock\(caseId,lockMethod,/);
  assert.match(s,/const recovery=signedLock\(id,'adjudicate_case_recovery'\)/);
  const start=s.indexOf("$('v2-adjudicate-recovery').addEventListener");
  const end=s.indexOf("$('v2-resume').addEventListener",start);
  const code=s.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.doesNotMatch(code,/payV2X402Once|\bfile_case\b|removeItem/);
});
