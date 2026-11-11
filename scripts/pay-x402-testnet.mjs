// Explicit opt-in, at-most-once REAL x402 Base Sepolia payer.
// This script NEVER auto-runs in CI and never replays uncertain payments.
// Only official USDC, eip155:84532, exact merchant, <=0.01 USDC, EIP-3009.
import {createHash} from 'node:crypto';
import {open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {privateKeyToAccount} from 'viem/accounts';
import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {wrapFetchWithPayment} from '@x402/fetch';
import {fetchX402Quote} from '../src/x402.mjs';
import {NETWORKS,decodeX402PaymentResponse,verifyBaseUSDCTransfer,validateClaim} from '../src/payment.mjs';

export const PAYMENT_CAP_ATOMIC='10000'; // 0.01 USDC — immutable acceptance cap.
const NETWORK='eip155:84532';

export function allowedPaymentRequirements(version,requirements,{payee,amount,asset}){
  if(version!==2||!Array.isArray(requirements))return [];
  return requirements.filter(r=>
    r?.scheme==='exact'&&r?.network===NETWORK&&
    String(r?.asset||'').toLowerCase()===asset &&
    String(r?.payTo||'').toLowerCase()===payee &&
    r?.amount===amount &&
    // No Permit2 approvals or nonstandard transfer methods.
    [undefined,'eip3009'].includes(r?.extra?.assetTransferMethod)
  );
}
export function assertPaymentAuthorization({args,endpoint,host,payee,privateKey,rpcUrl}){
  if(!args.includes('--execute')||args.length!==1)throw Error('One explicit --execute flag required');
  if(process.env.PAYJURY_CONFIRM_ONE_PAYMENT!=='I_APPROVE_ONE_TESTNET_X402_PAYMENT')
    throw Error('Explicit PAYJURY_CONFIRM_ONE_PAYMENT authorization missing');
  if(typeof privateKey!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(privateKey))
    throw Error('A dedicated Base Sepolia test wallet key must be supplied as a private Codespaces secret');
  if(!/^0x[0-9a-f]{40}$/i.test(payee||''))throw Error('Exact approved merchant address required');
  if(typeof endpoint!=='string'||!endpoint.startsWith('https://')||!host||!rpcUrl)
    throw Error('Trusted endpoint, exact allowlisted host and trusted Base Sepolia RPC required');
}
export async function runOnePayment({args=process.argv.slice(2),env=process.env}={}){
  const endpoint=env.X402_QUOTE_URL,host=env.X402_ALLOWED_HOST;
  const payee=String(env.X402_APPROVED_PAYEE||'').toLowerCase();
  const privateKey=env.X402_TESTNET_PRIVATE_KEY,rpcUrl=env.BASE_RPC_URL;
  assertPaymentAuthorization({args,endpoint,host,payee,privateKey,rpcUrl});
  const asset=NETWORKS[NETWORK].usdc;
  // Must match an actual live HTTP 402 quote BEFORE creating any signature.
  const quote=await fetchX402Quote(endpoint,{allowedHost:host});
  const offer=quote.options.find(x=>x.network===NETWORK&&x.asset===asset&&x.payee===payee&&x.amountAtomic===PAYMENT_CAP_ATOMIC);
  if(!offer)throw Error('Approved exact payment was not offered; no wallet signing');
  const signer=privateKeyToAccount(privateKey);
  const marker='.payjury-payment-attempt-'+createHash('sha256').update(endpoint+'|'+signer.address).digest('hex').slice(0,20)+'.lock';
  // Network failures can occur after remote settlement. Keep the marker permanently.
  const lock=await open(marker,'wx',0o600);
  try{await lock.writeFile(JSON.stringify({endpoint,network:NETWORK,payer:signer.address,
    payee,amountAtomic:PAYMENT_CAP_ATOMIC,intent:'ONE_PAYMENT_ATTEMPT'})+'\n');}
  finally{await lock.close();}
  const client=new x402Client();
  client.register('eip155:*',new ExactEvmScheme(signer));
  client.registerPolicy((version,requirements)=>
    allowedPaymentRequirements(version,requirements,{payee,amount:PAYMENT_CAP_ATOMIC,asset}));
  const paidFetch=wrapFetchWithPayment(fetch,client);
  console.log('PAYJURY_X402_ONE_SHOT_STARTED',JSON.stringify({network:NETWORK,amountAtomic:PAYMENT_CAP_ATOMIC,merchant:payee,payer:signer.address}));
  // x402 handles a single 402 challenge. Never invoke this client a second time.
  let response;
  try {response=await paidFetch(endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)});}
  catch {throw Error('PAYMENT_OUTCOME_UNCERTAIN: inspect original wallet/provider activity; NEVER remove one-shot marker or retry');}
  if(!response.ok)throw Error('PAYMENT_OUTCOME_UNCONFIRMED: HTTP status not successful; inspect existing payment without replay');
  const header=response.headers.get('payment-response');
  if(!header)throw Error('PAYMENT_OUTCOME_UNCONFIRMED: PAYMENT-RESPONSE header absent; do not replay');
  const payload=JSON.parse(Buffer.from(header,'base64').toString('utf8'));
  const txHash=String(payload?.transaction||'').toLowerCase();
  const claim=validateClaim({network:NETWORK,asset,txHash,payer:signer.address,payee,amountAtomic:PAYMENT_CAP_ATOMIC,
    endpoint,terms:'Receipt verification only',delivery:'Receipt verification only',evidence:'Receipt verification only'});
  decodeX402PaymentResponse(header,claim);
  // Read-only independent Base RPC receipt; no additional payment is authorized.
  const chainProof=await verifyBaseUSDCTransfer(claim,{rpcUrl,requiredConfirmations:2});
  const body=await response.text();
  console.log('PAYJURY_X402_PAYMENT_AND_TRANSFER_VERIFIED',JSON.stringify({
    network:NETWORK,txHash,amountAtomic:PAYMENT_CAP_ATOMIC,confirmedBlock:chainProof.blockNumber,
    confirmations:chainProof.confirmations,responseSha256:createHash('sha256').update(body).digest('hex'),
    note:'Real payment and HTTP response observed; quality of delivery remains subject to separate GenLayer judgment.',
  }));
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  runOnePayment().catch(()=>{
    console.error('PAYJURY_X402_NOT_VERIFIED_OR_NOT_AUTHORIZED. Do not retry a possible payment.');
    process.exitCode=1;
  });
}
