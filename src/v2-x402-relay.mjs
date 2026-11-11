// One-time browser-signed x402 proxy for the already-connected PAYJURY V2 payer.
// Network-only read preflight, exact immutable 0.01 Base Sepolia USDC EIP-3009,
// and one paid GET. The Node server NEVER holds or generates a signing key.
// Attempts lock persist even when the upstream payment result is UNKNOWN.
import {createHash} from 'node:crypto';
import {open,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {inspectX402Quote,fetchX402Quote} from './x402.mjs';
import {checkV2FreshPaymentReadiness,V2_SIGNER,PROPOSED_PAID_ENDPOINT,
  KNOWN_PREVIOUS_PAYEE,NETWORK} from './v2-fresh-preflight.mjs';
import {NETWORKS,validateClaim,verifyBaseUSDCTransfer,
  decodeX402PaymentResponse,makeCasePacket} from './payment.mjs';

export const EXPECTED_TOKEN=NETWORKS[NETWORK].usdc;
export const EXPECTED_ATOMIC='10000';
const PAYER=V2_SIGNER, PAYEE=KNOWN_PREVIOUS_PAYEE;
const HASH=/^0x[0-9a-f]{64}$/i;
const SIG=/^0x[0-9a-f]{130}$/i;
const lockName='.payjury-v2-x402-payment-attempt-'+
  createHash('sha256').update('2026-11-11|'+PAYER+'|'+PROPOSED_PAID_ENDPOINT).digest('hex').slice(0,24)+'.lock';
function json(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
  res.end(JSON.stringify(body));
}
export function validateV2PaymentSignature(header){
  if(typeof header!=='string'||header.length<60||header.length>16000||
     !/^[a-zA-Z0-9+/]+={0,2}$/.test(header))throw Error('Invalid signed payment envelope');
  let data;
  try{data=JSON.parse(Buffer.from(header,'base64').toString('utf8'));}
  catch{throw Error('Invalid x402 payment JSON');}
  const accepted=data?.accepted,auth=data?.payload?.authorization;
  if(data?.x402Version!==2||data?.resource?.url!==PROPOSED_PAID_ENDPOINT||
     accepted?.scheme!=='exact'||accepted?.network!==NETWORK||
     String(accepted?.asset||'').toLowerCase()!==EXPECTED_TOKEN||
     String(accepted?.payTo||'').toLowerCase()!==PAYEE||
     accepted?.amount!==EXPECTED_ATOMIC||
     ![undefined,'eip3009'].includes(accepted?.extra?.assetTransferMethod)||
     String(auth?.from||'').toLowerCase()!==PAYER||
     String(auth?.to||'').toLowerCase()!==PAYEE||
     String(auth?.value)!==EXPECTED_ATOMIC||
     !HASH.test(auth?.nonce||'')||
     !SIG.test(data?.payload?.signature||'')||
     data?.extensions&&Object.keys(data.extensions).length>0){
    throw Error('Payment envelope payer, network, amount, receiver or EIP-3009 method does not match approved purchase');
  }
  // Validate expiry to reduce risk of accidentally forwarding a stale approval.
  const before=Number(auth.validBefore),after=Number(auth.validAfter),now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after)||
     before<=now||before>now+7200||after>now+120||
     after>=before)throw Error('EIP-3009 authorization has invalid validity window');
  return {payer:PAYER,network:NETWORK,amountAtomic:EXPECTED_ATOMIC,payee:PAYEE,
    envelopeSha256:createHash('sha256').update(header).digest('hex')};
}
function fieldsFromReceipt({txHash,responseCode,bytes,bodyHash,proof}){
  const date=new Date().toISOString();
  return validateClaim({
    network:NETWORK,asset:EXPECTED_TOKEN,txHash,payer:PAYER,payee:PAYEE,
    amountAtomic:EXPECTED_ATOMIC,endpoint:PROPOSED_PAID_ENDPOINT,
    terms:'The purchased Base Sepolia x402 paid-content endpoint must respond with HTTP 2xx and a nonempty body after the exact 0.01 test USDC settlement. This case does not adjudicate the semantic accuracy or quality of the response.',
    delivery:'The one-time HTTP GET returned status '+responseCode+
      ' with '+bytes+' response bytes. The client computed body SHA-256 '+bodyHash+
      '. Raw response contents were not retained in the PAYJURY evidence packet.',
    evidence:'Payer-authorized new x402 EIP-3009 request on '+date+
      '. PAYMENT-RESPONSE reported Base Sepolia TX '+txHash+
      '. PAYJURY independently verified official USDC Transfer to the exact merchant, 10000 atomic units, block '+
      proof.blockNumber+', confirmations '+proof.confirmations+
      '. Paid HTTP response status '+responseCode+', body length '+bytes+
      ', SHA-256 '+bodyHash+'. Hash and observations are client-side/server relay evidence, not a signed merchant attestation of response correctness.'
  });
}
async function verifiedQuotedHeader(fetchImpl){
  const response=await fetchImpl(PROPOSED_PAID_ENDPOINT,{method:'GET',redirect:'error',
    signal:AbortSignal.timeout(10000),headers:{accept:'application/json'}});
  if(response.status!==402)throw Error('Merchant no longer returns HTTP 402; no payment made');
  const header=response.headers.get('payment-required');
  const quote=inspectX402Quote(header,PROPOSED_PAID_ENDPOINT);
  const matches=quote.options.filter(x=>x.network===NETWORK&&x.asset===EXPECTED_TOKEN&&
    x.payee===PAYEE&&x.amountAtomic===EXPECTED_ATOMIC&&x.scheme==='exact');
  if(matches.length!==1)throw Error('Merchant quote changed; no payment made');
  return header;
}
export async function serveV2X402({
  req,res,rpcUrl,fetchImpl=fetch,
  ready=checkV2FreshPaymentReadiness,verify=verifyBaseUSDCTransfer,
  lockDir=process.cwd(),lockStore=null
}){
  if(req.method!=='GET')return json(res,405,{error:'Only GET is supported'});
  if(!rpcUrl)return json(res,503,{error:'Base Sepolia RPC missing; no payment made'});
  const signature=req.headers['payment-signature'];
  if(!signature){
    try{
      if(req.url==='/api/v2/x402/quote'){
        const preview=await ready({rpcUrl,fetchImpl});
        return json(res,200,{...preview,
          oneShot:true,baseNetworkOnly:true,operatorMustApproveWalletSignature:true});
      }
      const header=await verifiedQuotedHeader(fetchImpl);
      res.writeHead(402,{'content-type':'application/json; charset=utf-8',
        'payment-required':header,'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(JSON.stringify({error:'Wallet-approved 0.01 test USDC x402 EIP-3009 signature required'}));
    }catch(error){
      json(res,503,{error:String(error?.message||'Quote unavailable').slice(0,160),
        signed:false,paymentExecuted:false});
    }
    return;
  }
  if(req.url!=='/api/v2/x402/execute')
    return json(res,422,{error:'Signed payments permitted only at the one-shot execute route'});
  let validated;
  try{validated=validateV2PaymentSignature(signature);}
  catch{return json(res,422,{error:'Invalid or mismatched x402 signature envelope; no payment forwarded'});}
  try{
    const preview=await ready({rpcUrl,fetchImpl});
    if(preview.result!=='V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY'||
       preview.wallet!==PAYER)throw Error('Insufficient balance or quote changed');
  }catch{
    return json(res,503,{error:'Fresh quote, sender or test USDC balance not verified; no signed request forwarded'});
  }
  const lockPath=join(lockDir,lockName);
  if(lockStore){
    // Never forward the signed authorization unless a global atomic lock
    // has been confirmed by durable storage. An ambiguous lock error
    // permanently stops this request; no upstream payment is attempted.
    let reserved;
    try{reserved=await lockStore.reserve(validated);}
    catch{
      return json(res,503,{result:'DURABLE_LOCK_UNVERIFIED',paymentExecuted:false,
        error:'Durable one-shot lock unavailable. Payment NOT forwarded. Do not retry a prior signed request.'});
    }
    if(!reserved)return json(res,409,{result:'EXISTING_PAYMENT_ATTEMPT_LOCKED',
      error:'This demo session already attempted its one permitted purchase. Never retry or reset it.'});
  }else{
    let lock;
    try{
      lock=await open(lockPath,'wx',0o600);
      await lock.writeFile(JSON.stringify({
        state:'OUTCOME_UNKNOWN',timestamp:new Date().toISOString(),
        signer:PAYER,endpoint:PROPOSED_PAID_ENDPOINT,
        amountAtomic:EXPECTED_ATOMIC,envelopeSha256:validated.envelopeSha256
      })+'\n');
      await lock.close();
    }catch{
      if(lock)try{await lock.close();}catch{}
      return json(res,409,{result:'EXISTING_PAYMENT_ATTEMPT_LOCKED',
        error:'One-shot payment attempt already exists. Inspect its original TX; never retry or remove the lock automatically.'});
    }
  }
  let upstream;
  try{
    upstream=await fetchImpl(PROPOSED_PAID_ENDPOINT,{method:'GET',redirect:'error',
      signal:AbortSignal.timeout(30000),headers:{
        'payment-signature':signature,accept:'application/json'
      }});
  }catch{
    return json(res,202,{result:'PAYMENT_OUTCOME_UNKNOWN',paymentAttempted:true,
      warning:'Upstream connection failed AFTER signed authorization was forwarded. Never resubmit payment; inspect provider/Base activity.'});
  }
  const header=upstream.headers.get('payment-response');
  let reportedTx=null;
  try{
    const payload=JSON.parse(Buffer.from(String(header||''),'base64').toString('utf8'));
    const txHash=String(payload?.transaction||'').toLowerCase();
    if(!HASH.test(txHash))throw Error('Missing settlement hash');
    const claim=validateClaim({
      network:NETWORK,asset:EXPECTED_TOKEN,txHash,payer:PAYER,payee:PAYEE,
      amountAtomic:EXPECTED_ATOMIC,endpoint:PROPOSED_PAID_ENDPOINT,
      terms:'Receipt scope only',delivery:'Receipt scope only',evidence:'Receipt scope only'
    });
    decodeX402PaymentResponse(header,claim);
    if(payload?.payer&&String(payload.payer).toLowerCase()!==PAYER)
      throw Error('Provider payer mismatch');
    reportedTx=txHash;
    const intermediate={
      state:'REPORTED_SETTLEMENT_NOT_YET_INDEPENDENTLY_VERIFIED',
      timestamp:new Date().toISOString(),payer:PAYER,txHash,
      httpStatus:upstream.status,envelopeSha256:validated.envelopeSha256
    };
    if(lockStore)await lockStore.record(intermediate);
    else await writeFile(lockPath,JSON.stringify(intermediate)+'\n',{mode:0o600});
  }catch{
    return json(res,202,{result:'PAYMENT_OUTCOME_UNKNOWN',
      httpStatus:upstream.status,paymentAttempted:true,
      warning:'Payment signature sent but provider settlement header absent or invalid. Lock retained; never resubmit.'});
  }
  let proof;
  try{
    proof=await verify(validateClaim({
      network:NETWORK,asset:EXPECTED_TOKEN,txHash:reportedTx,payer:PAYER,payee:PAYEE,
      amountAtomic:EXPECTED_ATOMIC,endpoint:PROPOSED_PAID_ENDPOINT,
      terms:'Receipt scope only',delivery:'Receipt scope only',evidence:'Receipt scope only'
    }),{rpcUrl,requiredConfirmations:2});
  }catch{
    return json(res,202,{result:'SETTLEMENT_REPORTED_NOT_CONFIRMED',txHash:reportedTx,
      paymentAttempted:true,warning:'Only read original Base TX for confirmation; payment must not be retried.'});
  }
  if(proof?.result!=='BASE_USDC_TRANSFER_VERIFIED'||
     proof.txHash!==reportedTx||proof.payer!==PAYER||proof.payee!==PAYEE||
     proof.amountAtomic!==EXPECTED_ATOMIC){
    return json(res,202,{result:'SETTLEMENT_RECEIPT_MISMATCH',txHash:reportedTx,
      paymentAttempted:true,warning:'Do not retry; inspect this TX and mismatched receipt.'});
  }
  if(!upstream.ok){
    return json(res,202,{result:'TRANSFER_VERIFIED_DELIVERY_NOT_SUCCESSFUL',
      txHash:reportedTx,paymentAttempted:true,
      warning:'USDC Transfer verified but paid API failed. Do not pay again.'});
  }
  let bodyBuffer;
  try{bodyBuffer=Buffer.from(await upstream.arrayBuffer());}
  catch{
    return json(res,202,{result:'TRANSFER_VERIFIED_BODY_NOT_READ',
      txHash:reportedTx,paymentAttempted:true,
      warning:'Payment confirmed but response body unavailable. Do not resend.'});
  }
  if(bodyBuffer.length>1_000_000){
    return json(res,202,{result:'TRANSFER_VERIFIED_BODY_OVERSIZED',
      txHash:reportedTx,paymentAttempted:true,warning:'Payment confirmed; body too large to preserve metadata.'});
  }
  const bodyHash=createHash('sha256').update(bodyBuffer).digest('hex');
  const claim=fieldsFromReceipt({
    txHash:reportedTx,responseCode:upstream.status,
    bytes:bodyBuffer.length,bodyHash,proof
  });
  const packet=makeCasePacket(claim,proof);
  // Save only public evidence metadata and a hash. Never save a private key,
  // PAYMENT-SIGNATURE, authenticated session, or the raw API body.
  const record={
    result:'PAYMENT_AND_BASE_USDC_VERIFIED_V2_CASE_PREPARED',
    paymentTx:reportedTx,caseId:packet.caseId,createdAt:new Date().toISOString(),
    payer:PAYER,merchant:PAYEE,network:NETWORK,amountAtomic:EXPECTED_ATOMIC,
    httpStatus:upstream.status,responseBytes:bodyBuffer.length,
    responseSha256:bodyHash,
    confirmations:proof.confirmations,block:proof.blockNumber,
    genlayerFileCaseSubmitted:false,genlayerDecisionSubmitted:false
  };
  if(lockStore){
    // This writes public receipt metadata only. The immutable SET NX lock
    // remains present regardless of outcome-write availability.
    try{await lockStore.record({...record,state:'BASE_PAYMENT_VERIFIED'});}
    catch{/* Payment already happened; never retry it due to record failure. */}
  }else{
    await mkdir(join(lockDir,'out'),{recursive:true});
    try{
      const file=await open(join(lockDir,'out','v2-new-'+reportedTx.slice(2)+'.json'),'wx',0o600);
      try{await file.writeFile(JSON.stringify(record,null,2)+'\n');}finally{await file.close();}
    }catch{/* A preexisting local record must never cause a second payment. */}
    try{await writeFile(lockPath,JSON.stringify({...record,state:'BASE_PAYMENT_VERIFIED'})+'\n',{mode:0o600});}
    catch{/* Payment is already confirmed; keep original lock. */}
  }
  return json(res,200,{...record,packet,
    note:'REAL new Base Sepolia USDC transfer verified. V2 case is prepared NOT FILED. Connect same EOA on GenLayer Studionet and separately approve one file_case. No verdict exists yet.'});
}
