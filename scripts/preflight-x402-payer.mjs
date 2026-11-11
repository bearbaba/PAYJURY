// Operator-controlled read-only PAYJURY payer readiness check.
// Never prints private keys, authorizations or raw API response content.
import {fileURLToPath} from 'node:url';
import {checkTestnetPayerReady} from '../src/testnet-payer-preflight.mjs';
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const result=await checkTestnetPayerReady();
    console.log('PAYJURY_X402_PREFLIGHT',JSON.stringify(result));
  }catch(error){
    const message=String(error?.message||'').slice(0,150);
    const known=[
      'Quote host not explicitly allowed','Approved merchant address required',
      'Dedicated testnet wallet secret missing','Payer and merchant must differ',
      'Exact 0.01 USDC testnet quote is unavailable or ambiguous',
      'Configured RPC is not Base Sepolia','Cannot verify official USDC balance',
      'Insufficient Base Sepolia test USDC','Testnet RPC read unavailable',
      'Testnet RPC read invalid JSON','Testnet RPC read rejected'
    ];
    console.error('PAYJURY_X402_PREFLIGHT_BLOCKED',JSON.stringify({
      status:'NOT_READY',reason:known.includes(message)?message:'Quote/configuration not verified',
      signingAttempted:false,paymentExecuted:false
    }));
    process.exitCode=2;
  }
}
