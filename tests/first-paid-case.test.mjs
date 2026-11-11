import test from 'node:test';
import assert from 'node:assert/strict';
import {firstPaymentClaim,prepareFirstPaidCase,prepareStudioCalls,FIRST_PAYMENT}
  from '../scripts/prepare-first-paid-case.mjs';
import {caseIdForClaim} from '../src/payment.mjs';
const claim=firstPaymentClaim();
const proof={result:'BASE_USDC_TRANSFER_VERIFIED',network:claim.network,
  txHash:claim.txHash,asset:claim.asset,payer:claim.payer,payee:claim.payee,
  amountAtomic:claim.amountAtomic,blockNumber:'57288759',confirmations:10};
test('prepared x402 case uses the exact one-shot Base transaction and original public evidence',()=>{
  assert.equal(claim.txHash,FIRST_PAYMENT.txHash);
  assert.equal(claim.network,'eip155:84532');
  assert.equal(claim.amountAtomic,'10000');
  assert.equal(claim.payee,'0xe3837fe309618ae075dbef0a20735c0615a308e6');
  assert.match(claim.delivery,/raw body bytes were not retained/);
  assert.match(claim.evidence,/NOT saved/);
});
test('studio field positions exactly match deployed PayJury.file_case source signature',()=>{
  const result=prepareStudioCalls(claim,proof);
  assert.equal(result.status,'PAYJURY_CASE_PREPARED_NOT_FILED');
  assert.equal(result.statusOnGenLayer,'NOT_FILED');
  assert.equal(result.signerActionsPerformed,0);
  assert.equal(result.contractAddress,'0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8');
  assert.deepEqual(Object.keys(result.fileCase.fields),
    ['case_id','network','tx_hash','asset','payer','payee','amount_atomic','endpoint','terms','delivery','evidence']);
  assert.equal(result.fileCase.args.length,11);
  assert.equal(result.caseId,caseIdForClaim(claim));
  assert.deepEqual(result.adjudicateCase.args,[result.caseId]);
  assert.deepEqual(result.getCase.args,[result.caseId]);
  assert.equal(result.bodyAvailable,false);
});
test('tampering with actual paid tx, amount or recipient cannot create a verified case',()=>{
  const fake={...proof,txHash:'0x'+'a'.repeat(64)};
  assert.throws(()=>prepareStudioCalls(claim,fake),/Independent Base/);
  assert.throws(()=>prepareStudioCalls(claim,{...proof,payee:'0x'+'b'.repeat(40)}),/Independent Base/);
  assert.throws(()=>prepareStudioCalls(claim,{...proof,amountAtomic:'10001'}),/Independent Base/);
});
test('fresh independent RPC verification is required before packet preparation',async()=>{
  let calls=0;
  const packet=await prepareFirstPaidCase({rpcUrl:'https://sepolia.base.org',
    verify:async(actual,{rpcUrl,requiredConfirmations})=>{
      calls++;
      assert.equal(actual.txHash,FIRST_PAYMENT.txHash);
      assert.equal(rpcUrl,'https://sepolia.base.org');
      assert.equal(requiredConfirmations,2);
      return proof;
    }});
  assert.equal(calls,1);
  assert.equal(packet.paymentEvidence.result,'BASE_USDC_TRANSFER_VERIFIED');
  assert.equal(packet.caseId,caseIdForClaim(claim));
  await assert.rejects(prepareFirstPaidCase({rpcUrl:null}),/RPC required/);
  await assert.rejects(prepareFirstPaidCase({rpcUrl:'https://sepolia.base.org',
    verify:async()=>{throw Error('RPC failed');}}),/RPC failed/);
});
