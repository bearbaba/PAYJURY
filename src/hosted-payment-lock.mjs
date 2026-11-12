// Durable, atomic, fail-closed lock for one additional PAYJURY V2 testnet
// checkout session on Vercel. This is NOT a public Redis client.
// All credentials remain in server-only Vercel environment variables.
import {createHash} from 'node:crypto';

export const LIVE_PAYMENT_SESSION='payjury-v2-web-one-take-20261111';
const HOST_SUFFIX='.upstash.io';
const TIMEOUT_MS=10_000;

// The Vercel Marketplace integration injects KV_REST_API_*; directly
// provisioned Upstash databases commonly use UPSTASH_REDIS_REST_*.
// Never mix URL/token across pairs, or fall back if an explicit pair is
// partially present but invalid. Unknown credentials must fail closed.
function endpointConfigOrNull(env){
  const explicit=Object.hasOwn(env,'UPSTASH_REDIS_REST_URL')||
    Object.hasOwn(env,'UPSTASH_REDIS_REST_TOKEN');
  const rawUrl=explicit?env.UPSTASH_REDIS_REST_URL:env.KV_REST_API_URL;
  const token=explicit?env.UPSTASH_REDIS_REST_TOKEN:env.KV_REST_API_TOKEN;
  try{
    const u=new URL(String(rawUrl||''));
    if(u.protocol!=='https:'||!u.hostname.endsWith(HOST_SUFFIX)||
       u.pathname!=='/'||u.username||u.password||u.search||u.hash||
       typeof token!=='string'||token.length<20)return null;
    return {url:u.origin,token};
  }catch{return null;}
}

export function validUpstashConfig(env=process.env){
  return endpointConfigOrNull(env)!==null;
}

function endpointConfig(env){
  const config=endpointConfigOrNull(env);
  if(!config)throw Error('Durable one-shot payment store not configured');
  return config;
}

export function createHostedOneShotLock({
  env=process.env,fetchImpl=fetch,
  session=LIVE_PAYMENT_SESSION
}={}){
  const {url,token}=endpointConfig(env);
  if(!/^[a-z0-9-]{8,80}$/.test(session))throw Error('Invalid payment session ID');
  const key='payjury:v2:payment:'+session+':once';
  const stateKey=key+':outcome';
  async function command(...args){
    let response,body;
    try{
      response=await fetchImpl(url,{method:'POST',redirect:'error',
        headers:{'authorization':'Bearer '+token,'content-type':'application/json'},
        body:JSON.stringify(args),signal:AbortSignal.timeout(TIMEOUT_MS)});
      if(!response.ok)throw Error('Durable store rejected request');
      body=await response.json();
    }catch{throw Error('Durable store unavailable; no payment may be forwarded');}
    if(!body||!Object.hasOwn(body,'result')||body.error)
      throw Error('Durable store returned invalid data; payment blocked');
    return body.result;
  }
  function safeRecord(data){
    const record={...data};
    // Never persist EIP-3009 signatures, keys or authorization envelopes.
    delete record.signature;delete record.paymentSignature;delete record.header;
    return JSON.stringify(record);
  }
  return Object.freeze({
    session,
    async reserve(validated){
      if(!validated||!/^[a-f0-9]{64}$/.test(validated.envelopeSha256||''))
        throw Error('Invalid approved payment envelope fingerprint');
      const payload=safeRecord({
        state:'OUTCOME_UNKNOWN',session,createdAt:new Date().toISOString(),
        envelopeSha256:validated.envelopeSha256,
        payer:validated.payer,merchant:validated.payee,
        network:validated.network,amountAtomic:validated.amountAtomic
      });
      // Redis SET NX is atomic. No TTL: UNKNOWN attempts stay locked.
      const result=await command('SET',key,payload,'NX');
      if(result==='OK')return true;
      if(result===null)return false;
      throw Error('Durable reservation result unknown; no payment forwarded');
    },
    async isLocked(){
      const result=await command('EXISTS',key);
      if(result===1)return true;
      if(result===0)return false;
      throw Error('Durable lock status unknown');
    },
    async record(outcome){
      if(!outcome||typeof outcome!=='object')return;
      // Separate outcome key: never modify or delete the immutable lock.
      await command('SET',stateKey,safeRecord(outcome));
    }
  });
}
