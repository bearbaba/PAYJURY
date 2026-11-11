import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyV2ReadOnly,compareV2Source,V2_ADDRESS,V2_DEPLOY_TX,V2_MARKER
} from '../scripts/verify-v2-deployment.mjs';
const expectedTx={
  hash:V2_DEPLOY_TX,statusName:'FINALIZED',
  txExecutionResultName:'FINISHED_WITH_RETURN',contractAddress:V2_ADDRESS
};
const v2Reads=async ({address,functionName,args})=>{
  assert.equal(address,V2_ADDRESS);
  if(functionName==='version'){assert.deepEqual(args,[]);return V2_MARKER;}
  if(functionName==='can_file_for'){
    assert.equal(args.length,4);
    return args[0]===args[3];
  }
  throw Error('Unknown method');
};
test('V2 deployed TX, version marker, payer allowed, unrelated wallet denied, optional source match',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async address=>{assert.equal(address,V2_ADDRESS);return 'contract V2 source';},
    localSource:'contract V2 source'
  });
  assert.equal(out.result,'V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS');
  assert.equal(out.deployment.result,'FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED');
  assert.equal(out.sourceIdentity,'SOURCE_TEXT_MATCHED');
  assert.equal(out.payerCanFile,true);
  assert.equal(out.strangerCanFile,false);
  assert.equal(out.signedTransactions,0);
});
test('read-only deploy inspection never treats version mismatch or stranger authorization as success',async()=>{
  const wrongMarker=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async a=>a.functionName==='version'?'PAYJURY_V1':false
  });
  assert.equal(wrongMarker.result,'V2_NOT_READY_FOR_SIGNING');
  const wrongAuth=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async a=>a.functionName==='version'?V2_MARKER:true
  });
  assert.equal(wrongAuth.result,'V2_NOT_READY_FOR_SIGNING');
});
test('RPC code-read error cannot be misreported as source match',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async address=>{assert.equal(address,V2_ADDRESS);throw Error('GenLayer RPC -32603');},
    localSource:'different source'
  });
  assert.equal(out.result,'V2_READBACK_PASS_SOURCE_UNVERIFIED');
  assert.equal(out.sourceIdentity,'UNVERIFIED');
  assert.equal(out.sourceContentMatched,false);
  assert.ok(out.warnings.some(x=>x.startsWith('SOURCE_RPC_READ_UNAVAILABLE')));
  assert.ok(out.warnings.some(x=>x.startsWith('SOURCE_IDENTITY_NOT_PROVEN')));
});
test('declared source mismatches block readiness',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async address=>{assert.equal(address,V2_ADDRESS);return 'unrelated source';},
    localSource:'contract V2 source'
  });
  assert.equal(out.result,'V2_NOT_READY_FOR_SIGNING');
  assert.equal(out.sourceIdentity,'SOURCE_TEXT_MISMATCH');
});
test('deployment RPC mismatch or unavailable read is never full deployment verification',async()=>{
  const conflict=await verifyV2ReadOnly({
    getTransaction:async()=>({...expectedTx,contractAddress:'0x'+'3'.repeat(40)}),
    readContract:v2Reads
  });
  assert.equal(conflict.result,'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED');
  const unavailable=await verifyV2ReadOnly({
    getTransaction:async()=>{throw Error('RPC down');},readContract:v2Reads
  });
  assert.equal(unavailable.result,'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED');
  assert.equal(unavailable.signedTransactions,0);
  assert.ok(unavailable.warnings.some(x=>x.startsWith('DEPLOY_RPC_READ_UNAVAILABLE')));
});
test('method read failures are not a reason to redeploy',async()=>{
  const out=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,
    readContract:async()=>{throw Error('RPC cannot read GenLayer finalized state');}
  });
  assert.equal(out.result,'V2_NOT_READY_FOR_SIGNING');
  assert.equal(out.version,null);
  assert.equal(out.payerCanFile,null);
  assert.ok(out.warnings.some(x=>x.startsWith('V2_METHOD_READ_UNAVAILABLE')));
});

test('Base64 transport decoding can prove identical Python source bytes',()=>{
  const source='# {"Depends": "py-genlayer"}\nfrom genlayer import *\nclass PayJuryV2: pass\n';
  const diagnosed=compareV2Source(Buffer.from(source,'utf8').toString('base64'),source);
  assert.equal(diagnosed.result,'SOURCE_TEXT_MATCHED');
  assert.equal(diagnosed.encoding,'BASE64_TRANSPORT');
  assert.equal(diagnosed.firstDifferentLine,null);
  assert.equal(diagnosed.deployedSha256,diagnosed.localSha256);
});
test('newline/BOM-only differences are classified but do not automatically authorize V2',async()=>{
  const local='from genlayer import *\nclass PayJuryV2: pass\n';
  const deployed='\ufefffrom genlayer import *\r\nclass PayJuryV2: pass\r\n\r\n';
  const diagnosed=compareV2Source(deployed,local);
  assert.equal(diagnosed.result,'SOURCE_FORMAT_ONLY_DIFFERENCE');
  assert.notEqual(diagnosed.deployedSha256,diagnosed.localSha256);
  const result=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async()=>deployed,localSource:local
  });
  assert.equal(result.sourceIdentity,'SOURCE_FORMAT_ONLY_DIFFERENCE');
  assert.equal(result.result,'V2_DEPLOY_AND_AUTHORIZATION_FORMAT_ONLY_REVIEW_REQUIRED');
  assert.equal(result.sourceContentMatched,true);
  assert.equal(result.requiresManualWalletApproval,true);
});
test('a genuine source change reports the first difference without dumping whole contract',()=>{
  const local='from genlayer import *\nclass PayJuryV2: pass\n';
  const deployed='from genlayer import *\nclass PayJuryV2: risk\n';
  const diagnosed=compareV2Source(deployed,local);
  assert.equal(diagnosed.result,'SOURCE_TEXT_MISMATCH');
  assert.equal(diagnosed.firstDifferentLine.number,2);
  assert.equal(diagnosed.firstDifferentLine.local,'class PayJuryV2: pass');
  assert.equal(diagnosed.firstDifferentLine.deployed,'class PayJuryV2: risk');
  assert.equal(diagnosed.localLineCount,3);
  assert.equal(diagnosed.deployedLineCount,3);
});
test('missing contract code remains unverified, not declared source matched',()=>{
  const info=compareV2Source(null,'from genlayer import *');
  assert.equal(info.result,'UNVERIFIED');
  assert.equal(info.deployedSha256,null);
});

test('247 content lines: 246 CRLF delimiters versus 247 LF plus EOF newline yields exact 245-byte mismatch',async()=>{
  const lines=Array.from({length:247},(_,i)=>'# source code line '+i);
  const local=lines.join('\n')+'\n';
  const deployed=lines.join('\r\n');
  const result=compareV2Source(deployed,local);
  assert.equal(result.deployedBytes-result.localBytes,245);
  assert.equal(result.localLineCount,248);
  assert.equal(result.deployedLineCount,247);
  assert.equal(result.result,'SOURCE_FORMAT_ONLY_DIFFERENCE');
  assert.equal(result.firstDifferentLine,null);
  assert.equal(result.localNewlines.lf,247);
  assert.equal(result.deployedNewlines.crlf,246);
  assert.equal(result.localNewlines.endsWithNewline,true);
  assert.equal(result.deployedNewlines.endsWithNewline,false);
  assert.equal(result.normalizedSha256,result.deployedNormalizedSha256);
  assert.notEqual(result.localSha256,result.deployedSha256);
  const verified=await verifyV2ReadOnly({
    getTransaction:async()=>expectedTx,readContract:v2Reads,
    getContractCode:async address=>{assert.equal(address,V2_ADDRESS);return deployed;},
    localSource:local
  });
  assert.equal(verified.result,'V2_DEPLOY_AND_AUTHORIZATION_FORMAT_ONLY_REVIEW_REQUIRED');
  assert.equal(verified.sourceIdentity,'SOURCE_FORMAT_ONLY_DIFFERENCE');
  assert.equal(verified.sourceContentMatched,true);
  assert.equal(verified.requiresManualWalletApproval,true);
  assert.equal(verified.signedTransactions,0);
});
test('indentation or Python source text changes never pass format-only normalization',()=>{
  const original='from genlayer import *\nclass PayJuryV2:\n  def file_case(self):\n    return False\n';
  const altered='from genlayer import *\r\nclass PayJuryV2:\r\n  def file_case(self):\r\n    return True';
  const diagnosis=compareV2Source(altered,original);
  assert.equal(diagnosis.result,'SOURCE_TEXT_MISMATCH');
  assert.equal(diagnosis.firstDifferentLine.number,4);
  assert.notEqual(diagnosis.normalizedSha256,diagnosis.deployedNormalizedSha256);
});
