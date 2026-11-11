import test from 'node:test';
import assert from 'node:assert/strict';
import {runReadDiagnosis,classifyReadError,REFERENCE} from '../scripts/diagnose-v2-read.mjs';
test('read-only GenLayer V2 diagnostic makes four exact sequential ABI calls and never signs',async()=>{
  const calls=[];
  const reader=async req=>{
    calls.push(req);
    if(req.method==='version')return 'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
    if(req.method==='can_file_for')return true;
    if(req.method==='filing_status')return 'READY_REQUIRES_BASE_PROOF';
    throw Object.assign(new Error('Unknown case'),{code:-32000});
  };
  const outcome=await runReadDiagnosis({reader});
  assert.equal(outcome.payerAuthorized,true);
  assert.equal(outcome.status,'READY_REQUIRES_BASE_PROOF');
  assert.equal(outcome.noWrite,true);
  assert.equal(outcome.noSignature,true);
  assert.equal(outcome.noNewPayment,true);
  assert.deepEqual(calls.map(c=>c.method),[
    'version','can_file_for','filing_status','get_case']);
  assert.deepEqual(calls[2].args,[
    REFERENCE.caseId,REFERENCE.network,REFERENCE.txHash,REFERENCE.asset,
    REFERENCE.payer,REFERENCE.payee,REFERENCE.amount,REFERENCE.payer]);
  assert.equal(outcome.results[3].status,'READ_ERROR');
});
test('ambiguous RPC filing_status error is not misreported as READY',async()=>{
  const cause=Object.assign(new Error('GenLayer JSON-RPC rejected call'),{code:-32603});
  const error=new Error('Read failed',{cause});
  const outcome=await runReadDiagnosis({reader:async ({method})=>{
    if(method==='version')return 'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
    if(method==='can_file_for')return true;
    throw error;
  }});
  assert.equal(outcome.status,'FILING_STATUS_UNVERIFIED');
  assert.equal(outcome.payerAuthorized,true);
  assert.equal(outcome.results[2].error.levels[1].code,'-32603');
});
test('SDK error metadata is bounded and redacts long hex payloads',()=>{
  const msg='A'.repeat(800)+' 0x'+'a'.repeat(140);
  const e=classifyReadError(Object.assign(new Error(msg),{code:-32000}));
  assert.equal(e.levels[0].code,'-32000');
  assert.ok(e.levels[0].message.length<=270);
  assert.equal(e.category,'READ_FAILED_NOT_A_TX');
});
test('missing version or invalid permission data remains blocked',async()=>{
  const outcome=await runReadDiagnosis({reader:async ({method})=>{
    if(method==='version')return 'MALICIOUS_VERSION';
    if(method==='can_file_for')return 'true';
    if(method==='filing_status')return 'UNKNOWN';
    throw Error('Unknown case');
  }});
  assert.equal(outcome.status,'FILING_STATUS_UNVERIFIED');
  assert.equal(outcome.payerAuthorized,'UNKNOWN');
  assert.equal(outcome.results[0].status,'READ_ERROR');
});

test('nonfinal READY cannot bypass a failing finalized snapshot',async()=>{
  const requests=[];
  const out=await runReadDiagnosis({reader:async req=>{
    requests.push(req);
    if(req.method==='version')return 'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
    if(req.method==='can_file_for')return true;
    if(req.method==='filing_status'&&req.variant==='latest-final'){
      throw Object.assign(new Error('RLP string ends with 331 superfluous bytes'),{code:-32603});
    }
    if(req.method==='filing_status'&&req.variant==='latest-nonfinal'){
      return 'READY_REQUIRES_BASE_PROOF';
    }
    throw Object.assign(new Error('No case filed'),{code:-32000});
  }});
  assert.equal(out.status,'FILING_STATUS_UNVERIFIED');
  assert.equal(out.readSnapshot,'LATEST_FINAL');
  assert.equal(out.nonFinalProbe.status,'READ_OK_DIAGNOSTIC_ONLY');
  assert.equal(out.nonFinalProbe.result,'READY_REQUIRES_BASE_PROOF');
  assert.equal(out.noWrite,true);
  assert.equal(requests.length,5);
  assert.equal(requests[2].variant,'latest-final');
});
