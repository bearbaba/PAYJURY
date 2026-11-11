import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  PROPOSED_ADDRESS,STUDIO_RPC,normalizedSource,analyzeContractSource,probePayJury,DeploymentProbeError
} from '../scripts/verify-genlayer-deployment.mjs';
const localSource=await readFile(new URL('../contracts/PayJury.py',import.meta.url),'utf8');
const b64=x=>Buffer.from(x,'utf8').toString('base64');

test('finalized deployed code matches the local PAYJURY contract without any on-chain write',async()=>{
  let count=0;
  const mock=async(url,options)=>{
    count++;
    assert.equal(url,STUDIO_RPC);
    assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);
    assert.equal(body.method,'gen_getContractCode');
    assert.deepEqual(body.params,[{address:PROPOSED_ADDRESS,status:'finalized'}]);
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:b64(localSource)})};
  };
  const result=await probePayJury({fetchImpl:mock,localSource});
  assert.equal(count,1);
  assert.equal(result.status,'SOURCE_MATCHED_FINALIZED_STATE');
  assert.equal(result.sourceMatches,true);
  assert.equal(result.deploymentTxVerified,false);
  assert.deepEqual(result.expectedMethodsInDeployedSource,['file_case','adjudicate_case','get_case']);
});
test('changed contract code is not silently treated as the same deployed PAYJURY contract',()=>{
  const altered=localSource.replace('class PayJury','class OtherJury');
  const r=analyzeContractSource(localSource,b64(altered));
  assert.equal(r.status,'DEPLOYED_SOURCE_DIFFERENT');
  assert.equal(r.sourceMatches,false);
});
test('absent code, malformed Base64 and unsupported GenLayer addresses fail closed',()=>{
  assert.equal(analyzeContractSource(localSource,'' ).status,'DEPLOYED_CODE_UNVERIFIED');
  assert.equal(analyzeContractSource(localSource,'not*base64').status,'DEPLOYED_CODE_UNVERIFIED');
  assert.throws(()=>analyzeContractSource(localSource,b64(localSource),{address:'0xdeadbeef'}),/Invalid GenLayer/);
});
test('normalization accepts only newline formatting differences',()=>{
  assert.equal(normalizedSource('a\r\nb\n\n'),'a\nb\n');
  assert.equal(analyzeContractSource(localSource,b64(localSource.replace(/\n/g,'\r\n'))).sourceMatches,true);
});
test('RPC error and unsupported endpoints cannot produce a match',async()=>{
  await assert.rejects(probePayJury({
    localSource, rpcUrl:'https://unknown-host.example/api',
    fetchImpl:async()=>{throw Error('must not be called');}
  }),/Only official/);
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>({ok:true,json:async()=>({error:{code:-32000,message:'unavailable'}})})}),error=>error instanceof DeploymentProbeError && error.code==='RPC_REJECTED_FINALIZED_CODE_READ' && error.rpcCode===-32000);
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>({ok:false,status:503})}),error=>error instanceof DeploymentProbeError && error.code==='RPC_HTTP_ERROR' && error.httpStatus===503);
});

test('probe classifies unsupported method without showing raw provider text',async()=>{
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>({ok:true,json:async()=>({error:{
      code:-32601,message:'secret-api-key-must-not-print'
    }})})}),
    error=>error instanceof DeploymentProbeError &&
      error.code==='RPC_METHOD_UNSUPPORTED'&&error.rpcCode===-32601&&
      !error.message.includes('secret-api-key')
  );
});
test('probe distinguishes network timeouts, invalid JSON and empty finalized result',async()=>{
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>{throw Object.assign(new Error('full endpoint is private'),{name:'TimeoutError'});}}),
    error=>error instanceof DeploymentProbeError && error.code==='RPC_TIMEOUT'
  );
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>({ok:true,json:async()=>{throw Error('non-JSON body with credentials');}})}),
    error=>error instanceof DeploymentProbeError && error.code==='RPC_INVALID_JSON'
  );
  await assert.rejects(probePayJury({localSource,
    fetchImpl:async()=>({ok:true,json:async()=>({result:null})})}),
    error=>error instanceof DeploymentProbeError && error.code==='RPC_CODE_RESULT_MISSING'
  );
});
