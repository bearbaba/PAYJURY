import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from '../src/server.mjs';
import {assessV2FilingPreflight,KNOWN_RLP_READ_CODE} from '../web/filing-policy.js';

const payer='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const v2='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const packet={
  caseId:'pj_9f2276fd1904120b16d5f5b6ea5f7a2b',
  network:'eip155:84532',txHash:'0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2',
  token:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  payer,payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  amountAtomic:'10000',status:'PREPARED_NOT_FILED',
  settlement:{result:'BASE_USDC_TRANSFER_VERIFIED'}
};
function assess(other={}){
  return assessV2FilingPreflight({packet,signer:payer,contract:v2,
    versionConfirmed:true,...other});
}
test('exact confirmed finalized READY allows V2 filing with no fallback',()=>{
  const d=assess({filingStatus:'READY_REQUIRES_BASE_PROOF'});
  assert.equal(d.allow,true);
  assert.equal(d.mode,'NORMAL_FINALIZED_PREFLIGHT');
});
test('known RPC RLP bug permits only exact case, same payer and independent can_file_for true',()=>{
  const d=assess({readErrorCode:KNOWN_RLP_READ_CODE,payerRights:true});
  assert.equal(d.allow,true);
  assert.equal(d.mode,'KNOWN_UPSTREAM_RLP_RECOVERY');
  assert.match(d.warning,/NOT VERIFIED/);
  assert.match(d.warning,/can incur GenLayer fees/);
  for(const [key,value] of [
    ['caseId','pj_'+'b'.repeat(32)],['txHash','0x'+'c'.repeat(64)],
    ['payee','0x'+'b'.repeat(40)],['network','eip155:8453'],
    ['amountAtomic','20000'],['status','FILED'],
    ['payer','0x'+'b'.repeat(40)],['token','0x'+'b'.repeat(40)]
  ]){
    const reject=assess({packet:{...packet,[key]:value},
      readErrorCode:KNOWN_RLP_READ_CODE,payerRights:true});
    assert.equal(reject.allow,false,'changed '+key+' must reject');
  }
});
test('do not authorize forged, unknown, nonfinal or missing-rights read failures',()=>{
  for(const props of [
    {readErrorCode:KNOWN_RLP_READ_CODE,payerRights:false},
    {readErrorCode:KNOWN_RLP_READ_CODE,payerRights:null},
    {readErrorCode:'-32603',payerRights:true},
    {readErrorCode:'NETWORK_TIMEOUT',payerRights:true},
    {filingStatus:'TRANSFER_ALREADY_FILED'},
    {filingStatus:'CASE_EXISTS'},
    {filingStatus:'NOT_AUTHORIZED'},
    {readErrorCode:KNOWN_RLP_READ_CODE,payerRights:true,versionConfirmed:false},
    {readErrorCode:KNOWN_RLP_READ_CODE,payerRights:true,signer:'0x'+'b'.repeat(40)},
    {readErrorCode:KNOWN_RLP_READ_CODE,payerRights:true,contract:'0x'+'b'.repeat(40)},
    {filingStatus:'READY_REQUIRES_BASE_PROOF',readErrorCode:KNOWN_RLP_READ_CODE}
  ]){
    assert.equal(assess(props).allow,false,JSON.stringify(props));
  }
});
test('GenLayer known RLP error is classified but never reported as READY by server',async()=>{
  const prev=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
  process.env.GENLAYER_V2_CONTRACT_ADDRESS=v2;
  const server=createServer({rpcUrl:'https://sepolia.base.org',
    v2Reader:async({functionName})=>{
      if(functionName==='filing_status')throw new Error('An internal error',{cause:
        Object.assign(new Error('RLP string ends with 331 superfluous bytes'),{code:-32603})});
      return true;
    }});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const args=[packet.caseId,packet.network,packet.txHash,
      packet.token,packet.payer,packet.payee,packet.amountAtomic,packet.payer];
    const res=await fetch(base+'/api/v2/read?method=filing_status&args='+encodeURIComponent(JSON.stringify(args)));
    assert.equal(res.status,503);
    const out=await res.json();
    assert.equal(out.code,KNOWN_RLP_READ_CODE);
    assert.equal(out.readOnly,true);
    assert.equal(out.filingStatus,'UNVERIFIED');
    assert.equal(out.noWalletTransactionAttempted,true);
    assert.equal(out.result,undefined);
    const policy=await fetch(base+'/filing-policy.js');
    assert.equal(policy.status,200);
    assert.match(policy.headers.get('content-type'),/javascript/);
  }finally{
    if(prev===undefined)delete process.env.GENLAYER_V2_CONTRACT_ADDRESS;
    else process.env.GENLAYER_V2_CONTRACT_ADDRESS=prev;
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
});
test('browser file_case flow keeps single signed lock and secondary payer rights RPC',async()=>{
  const fs=await import('node:fs/promises');
  const text=await fs.readFile(new URL('../web/app.js',import.meta.url),'utf8');
  assert.match(text,/if\(error\?\.code!==KNOWN_RLP_READ_CODE\)throw error/);
  assert.match(text,/readV2Contract\(v2Address,'can_file_for'/);
  assert.match(text,/assessV2FilingPreflight/);
  assert.match(text,/if\(!policy.allow\)/);
  assert.match(text,/v2Write\('file_case',p.caseId/);
  assert.match(text,/writeLock\(caseId,method,\{state:'ATTEMPTED_UNKNOWN'/);
});
