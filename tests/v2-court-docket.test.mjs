import test from 'node:test';
import assert from 'node:assert/strict';
import {validateV2CourtDocket} from '../web/court-evidence.js';
const caseId='pj_6575f7352b41602401caf317ce30f86b';
const addr='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const payer='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const payee='0xe3837fe309618ae075dbef0a20735c0615a308e6';
const asset='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const tx='0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd';
const endpoint='https://x402.payai.network/api/base-sepolia/paid-content';
const reason='Payment and non-empty HTTP body supported.';
function data(){
  const verified={contractVersion:'v2',caseStatus:'DECIDED',identityBinding:'DETERMINISTIC_ID_MATCHED',
    settlement:{status:'BASE_USDC_TRANSFER_VERIFIED'},contractAddress:addr,caseId,
    verdict:'ACCEPT',reason,network:'eip155:84532',txHash:tx,payer,payee,
    asset,amountAtomic:'10000',endpoint};
  const onchain={case_id:caseId,status:'DECIDED',verdict:'ACCEPT',reason,
    network:verified.network,tx_hash:tx,payer,payee,asset,amount_atomic:'10000',
    endpoint,terms:'Return 2xx and nonempty body',delivery:'200 and 467 bytes',
    evidence:'Receipt and body length'};
  return {verified,onchain,payload:{address:addr,result:JSON.stringify(onchain)}};
}
test('on-chain fields are safely extracted only after a matched verified V2 read',()=>{
  const d=data();
  assert.equal(validateV2CourtDocket(d.payload,d.verified).terms,d.onchain.terms);
});
test('identity and evidence mismatches fail closed',()=>{
  for(const field of ['case_id','status','verdict','reason','network','tx_hash','payer','payee',
    'asset','amount_atomic','endpoint','terms']){
    const d=data();
    d.onchain[field]=field==='status'?'FILED':field==='terms'?'':'wrong';
    d.payload.result=JSON.stringify(d.onchain);
    assert.throws(()=>validateV2CourtDocket(d.payload,d.verified),undefined,field);
  }
  const d=data();d.payload.address='0x'+'f'.repeat(40);
  assert.throws(()=>validateV2CourtDocket(d.payload,d.verified),/contract mismatch/);
  d.payload.address=addr;d.verified.settlement.status='NOT_VERIFIED';
  assert.throws(()=>validateV2CourtDocket(d.payload,d.verified),/independently verified/);
});
test('malformed and overlong contract responses fail closed',()=>{
  const d=data();d.payload.result='not json';
  assert.throws(()=>validateV2CourtDocket(d.payload,d.verified),/Unparseable/);
  d.payload.result=JSON.stringify({...d.onchain,evidence:'x'.repeat(2501)});
  assert.throws(()=>validateV2CourtDocket(d.payload,d.verified),/oversized/);
});
