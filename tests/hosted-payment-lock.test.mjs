import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedOneShotLock,validUpstashConfig,LIVE_PAYMENT_SESSION} from '../src/hosted-payment-lock.mjs';

const credentials={
  UPSTASH_REDIS_REST_URL:'https://grateful-duck-11111.upstash.io',
  UPSTASH_REDIS_REST_TOKEN:'test-only-credential-long-enough'
};
const marketplaceCredentials={
  KV_REST_API_URL:credentials.UPSTASH_REDIS_REST_URL,
  KV_REST_API_TOKEN:credentials.UPSTASH_REDIS_REST_TOKEN
};
const approved={
  payer:'0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb',
  payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  network:'eip155:84532',amountAtomic:'10000',
  envelopeSha256:'a'.repeat(64)
};

test('hosted checkout stays disabled with missing or unsafe Redis config',()=>{
  assert.equal(validUpstashConfig({}),false);
  assert.equal(validUpstashConfig({...credentials,UPSTASH_REDIS_REST_URL:'http://grateful-duck-11111.upstash.io'}),false);
  assert.equal(validUpstashConfig({...credentials,UPSTASH_REDIS_REST_URL:'https://evil.example'}),false);
  assert.equal(validUpstashConfig({...credentials,UPSTASH_REDIS_REST_TOKEN:'bad'}),false);
  assert.equal(validUpstashConfig(credentials),true);
  assert.throws(()=>createHostedOneShotLock({env:{}}),/Durable one-shot/);
});

test('Vercel Marketplace KV credentials work, but partial or unsafe overrides fail closed',()=>{
  assert.equal(validUpstashConfig(marketplaceCredentials),true);
  assert.equal(validUpstashConfig({...marketplaceCredentials,KV_REST_API_TOKEN:'short'}),false);
  assert.equal(validUpstashConfig({...marketplaceCredentials,
    UPSTASH_REDIS_REST_URL:'https://evil.example'}),false);
  assert.equal(validUpstashConfig({...marketplaceCredentials,
    UPSTASH_REDIS_REST_TOKEN:'test-only-credential-long-enough'}),false);
  assert.equal(validUpstashConfig({...marketplaceCredentials,
    KV_REST_API_URL:'https://grateful-duck-11111.upstash.io/other-path'}),false);
});

function mockRedis(){
  const values=new Map(),calls=[];
  const fetchImpl=async (url,opts)=>{
    assert.equal(url,credentials.UPSTASH_REDIS_REST_URL);
    assert.equal(opts.headers.authorization,'Bearer '+credentials.UPSTASH_REDIS_REST_TOKEN);
    const args=JSON.parse(opts.body);
    calls.push(args);
    let result;
    if(args[0]==='SET'&&args[3]==='NX'){
      assert.equal(args.length,4);
      if(values.has(args[1]))result=null;
      else{values.set(args[1],args[2]);result='OK';}
    }else if(args[0]==='SET'){
      values.set(args[1],args[2]);result='OK';
    }else if(args[0]==='EXISTS'){
      result=values.has(args[1])?1:0;
    }else throw Error('Unexpected command '+args[0]);
    return {ok:true,json:async()=>({result})};
  };
  return {fetchImpl,calls,values};
}

test('durable SET NX reserves exactly one signed testnet purchase across instances',async()=>{
  const mock=mockRedis();
  const first=createHostedOneShotLock({env:credentials,fetchImpl:mock.fetchImpl});
  const second=createHostedOneShotLock({env:credentials,fetchImpl:mock.fetchImpl});
  assert.equal(first.session,LIVE_PAYMENT_SESSION);
  assert.equal(await first.isLocked(),false);
  assert.equal(await first.reserve(approved),true);
  assert.equal(await second.reserve(approved),false);
  assert.equal(await second.isLocked(),true);
  const key=mock.calls.find(x=>x[0]==='SET'&&x[3]==='NX')[1];
  assert.match(key,/payjury:v2:payment:.*:once/);
  const stored=JSON.parse(mock.values.get(key));
  assert.equal(stored.state,'OUTCOME_UNKNOWN');
  assert.equal(stored.payer,approved.payer);
  assert.equal(stored.envelopeSha256,approved.envelopeSha256);
  assert.ok(!mock.calls.some(args=>args.some(x=>x==='EX'||x==='PX')));
  await first.record({state:'BASE_PAYMENT_VERIFIED',txHash:'0x'+'b'.repeat(64),
    signature:'secret-not-persisted'});
  assert.equal(await first.isLocked(),true);
  const outcome=JSON.parse(mock.values.get(key+':outcome'));
  assert.equal(outcome.state,'BASE_PAYMENT_VERIFIED');
  assert.equal(outcome.signature,undefined);
});

test('Marketplace KV credentials use the same durable one-shot Redis reservation',async()=>{
  const mock=mockRedis();
  const lock=createHostedOneShotLock({env:marketplaceCredentials,fetchImpl:mock.fetchImpl});
  assert.equal(await lock.isLocked(),false);
  assert.equal(await lock.reserve(approved),true);
  assert.equal(await lock.isLocked(),true);
  assert.equal(await lock.reserve(approved),false);
});

test('unknown or unavailable durable storage fails closed, no lock is treated as successful',async()=>{
  const broken=createHostedOneShotLock({env:credentials,fetchImpl:async()=>{throw Error('network down')}});
  await assert.rejects(broken.reserve(approved),/store unavailable/);
  const ambiguous=createHostedOneShotLock({env:credentials,fetchImpl:async()=>({ok:true,json:async()=>({result:'PENDING'})})});
  await assert.rejects(ambiguous.reserve(approved),/result unknown/);
  await assert.rejects(ambiguous.isLocked(),/status unknown/);
});

test('front-end one-take purchase session is pinned to backend session identifier',async()=>{
  const {readFile}=await import('node:fs/promises');
  const wallet=await readFile(new URL('../web/studio-wallet.mjs',import.meta.url),'utf8');
  const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  const gateway=await readFile(new URL('../api/index.mjs',import.meta.url),'utf8');
  assert.ok(wallet.includes("'"+LIVE_PAYMENT_SESSION+"'"));
  assert.ok(app.includes("'"+LIVE_PAYMENT_SESSION+"'"));
  assert.match(gateway,/SIGNED_PAYMENT_ROUTES/);
  assert.match(gateway,/activeCheckout/);
});
