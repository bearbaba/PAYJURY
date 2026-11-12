// Vercel Node Function adapter for the existing validated PAYJURY API.
// The production deployment stays proof-first. Optional new x402 checkout
// is gated by an atomic, permanent external Redis SET NX one-shot lock.
// Missing store credentials = fail closed. No key custody or auto-signing.
import {createServer} from '../src/server.mjs';
import {validUpstashConfig} from '../src/hosted-payment-lock.mjs';

const upstream=createServer();
const handle=upstream.listeners('request')[0];
const ALLOWED=new Set([
  'status','case','verdict','inspect','verify',
  'v2/read','v2/tx','v2/tx-consensus','v2/candidate','v2/resume-known'
]);
const SIGNED_PAYMENT_ROUTES=new Set(['v2/x402/quote','v2/x402/execute','v2/x402/session']);
const activeCheckout=()=>process.env.PAYJURY_NEW_CHECKOUT_ENABLED==='1'&&validUpstashConfig();

export default async function handler(req,res){
  const url=new URL(req.url||'/','https://payjury.invalid');
  const raw=url.searchParams.get('__route')||
    (url.pathname.startsWith('/api/')?url.pathname.slice(5):'');
  const route=String(raw).replace(/^\/+|\/+$/g,'');
  if(!ALLOWED.has(route)&&!(SIGNED_PAYMENT_ROUTES.has(route)&&activeCheckout())){
    res.writeHead(403,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    res.end(JSON.stringify({error:'This hosted demo cannot initiate payments or unsupported actions. Existing evidence is available read-only.'}));
    return;
  }
  url.searchParams.delete('__route');
  req.url='/api/'+route+(url.searchParams.size?'?'+url.searchParams.toString():'');
  await new Promise(resolve=>{
    res.once('finish',resolve);
    res.once('close',resolve);
    try{handle(req,res);}catch{
      if(!res.headersSent){
        res.writeHead(503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
        res.end(JSON.stringify({error:'Read service unavailable. No payment or signing occurred.'}));
      }else res.end();
    }
  });
}
