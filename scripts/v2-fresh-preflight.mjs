// PAYJURY V2 fresh-payment readiness — NEVER signs or pays.
import {checkV2FreshPaymentReadiness} from '../src/v2-fresh-preflight.mjs';
try{
  const out=await checkV2FreshPaymentReadiness();
  console.log('PAYJURY_V2_FRESH_PAYMENT_PREFLIGHT_READ_ONLY',JSON.stringify(out,null,2));
  if(out.result!=='V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY')process.exitCode=2;
}catch(error){
  console.error('PAYJURY_V2_FRESH_PAYMENT_PREFLIGHT_READ_ONLY',JSON.stringify({
    result:'BLOCKED',reason:String(error?.message||'Preflight unavailable').slice(0,170),
    paymentExecuted:false,signaturesRequested:0,
    next:'Do not sign. Check exact x402 quote, payer wallet, merchant and Base Sepolia RPC before a new payment.'
  }));
  process.exitCode=2;
}
