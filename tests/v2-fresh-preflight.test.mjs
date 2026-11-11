import test from 'node:test';
import assert from 'node:assert/strict';
import {checkV2FreshPaymentReadiness,V2_SIGNER,KNOWN_PREVIOUS_PAYEE,
  PROPOSED_PAID_ENDPOINT,NETWORK} from '../src/v2-fresh-preflight.mjs';
const TOKEN='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const QUOTE={status:'X402_QUOTE_INSPECTED_NOT_PAID',options:[{
  network:NETWORK,scheme:'exact',asset:TOKEN,amountAtomic:'10000',payee:KNOWN_PREVIOUS_PAYEE
}]};
function mockRpc(balance,chain='0x14a34'){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    assert.equal(url,'https://sepolia.base.org/');
    const req=JSON.parse(opts.body);
    calls.push(req);
    return {ok:true,json:async()=>({
      jsonrpc:'2.0',id:req.id,result:req.method==='eth_chainId'?chain:balance
    })};
  };
  return {fetchImpl,calls};
}
test('correct wallet and exactly one existing merchant quote: no signer or payment is involved',async()=>{
  const {fetchImpl,calls}=mockRpc('0x2710');
  const x=await checkV2FreshPaymentReadiness({rpcUrl:'https://sepolia.base.org',
    fetchImpl,quoteReader:async(url,config)=>{
      assert.equal(url,PROPOSED_PAID_ENDPOINT);
      assert.equal(config.allowedHost,'x402.payai.network');
      return QUOTE;
    }});
  assert.equal(x.result,'V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY');
  assert.equal(x.wallet,V2_SIGNER);
  assert.equal(x.merchant,KNOWN_PREVIOUS_PAYEE);
  assert.equal(x.availableAtomic,'10000');
  assert.equal(x.paymentExecuted,false);
  assert.equal(x.signaturesRequested,0);
  assert.deepEqual(calls.map(c=>c.method),['eth_chainId','eth_call']);
  assert.equal(calls[1].params[0].to,TOKEN);
  assert.match(calls[1].params[0].data,/^0x70a08231/);
  assert.equal(calls[1].params[0].data.slice(-40),V2_SIGNER.slice(2));
});
test('insufficient official Base Sepolia USDC never authorizes any payment',async()=>{
  const {fetchImpl}=mockRpc('0x270f');
  const x=await checkV2FreshPaymentReadiness({rpcUrl:'https://sepolia.base.org',
    fetchImpl,quoteReader:async()=>QUOTE});
  assert.equal(x.result,'V2_FRESH_PAYER_NEEDS_TEST_USDC');
  assert.equal(x.paymentExecuted,false);
});
test('wrong chain or changed merchant/price prevents a new signature',async()=>{
  const bad=mockRpc('0x2710','0x2105');
  await assert.rejects(checkV2FreshPaymentReadiness({
    rpcUrl:'https://sepolia.base.org',
    fetchImpl:bad.fetchImpl,quoteReader:async()=>QUOTE
  }),/wrong chain/);
  const ok=mockRpc('0x2710');
  await assert.rejects(checkV2FreshPaymentReadiness({
    rpcUrl:'https://sepolia.base.org',
    fetchImpl:ok.fetchImpl,quoteReader:async()=>({...QUOTE,options:[{...QUOTE.options[0],amountAtomic:'11000'}]})
  }),/quote not verified/);
  assert.equal(ok.calls.length,0);
  await assert.rejects(checkV2FreshPaymentReadiness({
    rpcUrl:'https://sepolia.base.org',
    fetchImpl:ok.fetchImpl,
    endpoint:'https://untrusted.example/api',quoteReader:async()=>QUOTE
  }),/not explicitly approved/);
  await assert.rejects(checkV2FreshPaymentReadiness({
    rpcUrl:'https://sepolia.base.org',
    fetchImpl:ok.fetchImpl,
    payee:V2_SIGNER,quoteReader:async()=>QUOTE
  }),/Invalid payer\/merchant/);
});
