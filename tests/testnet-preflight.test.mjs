import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {checkTestnetPayerReady,validatePreflightConfig} from '../src/testnet-payer-preflight.mjs';
const key='0x'+'1'.repeat(64);
const payer=privateKeyToAccount(key).address.toLowerCase();
const merchant='0xe3837fe309618ae075dbef0a20735c0615a308e6';
const asset='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const endpoint='https://x402.payai.network/api/base-sepolia/paid-content';
const env={
 X402_TESTNET_PRIVATE_KEY:key,
 X402_QUOTE_URL:endpoint,
 X402_ALLOWED_HOST:'x402.payai.network',
 X402_APPROVED_PAYEE:merchant,
 BASE_RPC_URL:'https://sepolia.base.org'
};
const quote={x402Version:2,resource:{url:endpoint},accepts:[
 {network:'eip155:84532',scheme:'exact',asset,payTo:merchant,amount:'10000'}
]};
const b64=Buffer.from(JSON.stringify(quote)).toString('base64');
const quoteFetchImpl=async(url,options)=>{
  assert.equal(url,endpoint);
  assert.equal(options.method,'GET');
  return {status:402,headers:{get:key=>key==='payment-required'?b64:null}};
};
function rpc(balance='10000',chain='0x14a34'){
  const calls=[];
  return Object.assign(async(url,options)=>{
    assert.equal(url,'https://sepolia.base.org/');
    assert.equal(options.method,'POST');
    const req=JSON.parse(options.body);
    calls.push(req.method);
    if(req.method==='eth_chainId')return {ok:true,json:async()=>({result:chain})};
    if(req.method==='eth_call'){
      assert.equal(req.params[0].to,asset);
      assert.equal(req.params[0].data,'0x70a08231'+payer.slice(2).padStart(64,'0'));
      assert.equal(req.params[1],'latest');
      return {ok:true,json:async()=>({result:'0x'+BigInt(balance).toString(16)})};
    }
    throw Error('Unexpected RPC method');
  },{calls});
}
test('read-only preflight proves exact quote, chain and sufficient official USDC balance',async()=>{
  const fetchImpl=rpc('20000');
  const result=await checkTestnetPayerReady({env,fetchImpl,quoteFetchImpl});
  assert.equal(result.status,'X402_TESTNET_PAYER_READY_NO_SIGNATURE');
  assert.equal(result.paymentExecuted,false);
  assert.equal(result.signedTransactions,0);
  assert.equal(result.amountAtomic,'10000');
  assert.equal(result.availableUsdcAtomic,'20000');
  assert.equal(result.payer,payer);
  assert.deepEqual(fetchImpl.calls,['eth_chainId','eth_call']);
  assert.ok(!JSON.stringify(result).includes(key));
});
test('underfunded test wallet is blocked before signing',async()=>{
  await assert.rejects(checkTestnetPayerReady({env,fetchImpl:rpc('9999'),quoteFetchImpl}),
    /Insufficient Base Sepolia test USDC/);
});
test('wrong RPC chain, forged merchant and wrong endpoint are blocked',async()=>{
  await assert.rejects(checkTestnetPayerReady({env,fetchImpl:rpc('10000','0x2105'),quoteFetchImpl}),
    /not Base Sepolia/);
  assert.throws(()=>validatePreflightConfig({...env,X402_APPROVED_PAYEE:'invalid'}),/merchant/);
  assert.throws(()=>validatePreflightConfig({...env,X402_ALLOWED_HOST:'fake.example'}),/host/);
  assert.throws(()=>validatePreflightConfig({...env,X402_TESTNET_PRIVATE_KEY:'invalid'}),/wallet secret/);
});
test('runtime testnet key must never be returned or sent to RPC',async()=>{
  const fetched=[];
  const fetchImpl=async(url,options)=>{
    fetched.push(options.body);
    return rpc('10000')(url,options);
  };
  await checkTestnetPayerReady({env,fetchImpl,quoteFetchImpl});
  assert.equal(fetched.length,2);
  assert.ok(fetched.every(body=>!body.includes(key)));
});
