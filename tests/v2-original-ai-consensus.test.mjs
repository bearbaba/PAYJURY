import test from 'node:test';
import assert from 'node:assert/strict';
import {ORIGINAL_AI_TX,verifyOriginalAiConsensus} from '../src/genlayer-consensus-receipt.mjs';
const payer='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const contract='0x0a6171c6a580c58d999a251436ce7c63ffC3dc31'.toLowerCase();
function mock(status=7,result=5,extra={}){
  return async (url,opts)=>{
    assert.equal(url,'https://studio.genlayer.com/api');
    assert.equal(opts.method,'POST');
    const request=JSON.parse(opts.body);
    assert.equal(request.method,'gen_getTransactionReceipt');
    assert.equal(request.params[0].txId,ORIGINAL_AI_TX);
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result:{
      id:ORIGINAL_AI_TX,txOrigin:payer,recipient:contract,status,result,...extra
    }})};
  };
}
test('A finalized NoMajority receipt authorizes READ ONLY eligibility',async()=>{
  const proof=await verifyOriginalAiConsensus({fetchImpl:mock()});
  assert.equal(proof.finalized,true);
  assert.equal(proof.consensusResult,'NO_MAJORITY');
  assert.equal(proof.readOnly,true);
});
test('Fails closed if original hash, sender, recipient or no majority differs',async()=>{
  await assert.rejects(verifyOriginalAiConsensus({hash:'0x'+'f'.repeat(64),fetchImpl:mock()}),/Only approved/);
  await assert.rejects(verifyOriginalAiConsensus({fetchImpl:mock(7,5,{recipient:'0x'+'0'.repeat(40)})}),/identity mismatch/);
  assert.equal((await verifyOriginalAiConsensus({fetchImpl:mock(7,1)})).consensusResult,'MAJORITY_AGREE');
  assert.equal((await verifyOriginalAiConsensus({fetchImpl:mock(6,5)})).finalized,false);
  await assert.rejects(verifyOriginalAiConsensus({fetchImpl:async()=>({ok:true,json:async()=>({error:{message:'unsupported'}})})}),/did not return/);
});
