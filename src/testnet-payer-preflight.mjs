// PAYJURY Base Sepolia x402 payer preflight: NO signing, NO transfers.
// Only a dedicated testnet wallet key from a private runtime secret is accepted.
// The key is NEVER logged or sent to the RPC provider.
import {createHash} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {NETWORKS,requireHttpsEndpoint} from './payment.mjs';
import {fetchX402Quote} from './x402.mjs';

const NETWORK='eip155:84532';
const CAP='10000'; // 0.01 USDC atomic
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
export const EXPECTED_RPC_CHAIN_ID=84532;
const BALANCE_OF='0x70a08231';
export function validatePreflightConfig(env){
  const endpoint=requireHttpsEndpoint(env.X402_QUOTE_URL);
  const allowedHost=env.X402_ALLOWED_HOST;
  if(!allowedHost||new URL(endpoint).hostname!==allowedHost)throw Error('Quote host not explicitly allowed');
  const payee=String(env.X402_APPROVED_PAYEE||'').toLowerCase();
  if(!ADDRESS.test(payee))throw Error('Approved merchant address required');
  const rpcUrl=requireHttpsEndpoint(env.BASE_RPC_URL);
  const privateKey=env.X402_TESTNET_PRIVATE_KEY;
  if(typeof privateKey!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(privateKey))
    throw Error('Dedicated testnet wallet secret missing');
  const payer=privateKeyToAccount(privateKey).address.toLowerCase();
  if(payer===payee)throw Error('Payer and merchant must differ');
  return {endpoint,allowedHost,payee,rpcUrl,payer,asset:NETWORKS[NETWORK].usdc,amountAtomic:CAP,network:NETWORK};
}
async function rpcRead(fetchImpl,rpcUrl,method,params,id){
  let response;
  try {
    response=await fetchImpl(rpcUrl,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})
    });
  }catch{throw Error('Testnet RPC read unavailable');}
  if(!response?.ok)throw Error('Testnet RPC read unavailable');
  let data;
  try{data=await response.json();}
  catch{throw Error('Testnet RPC read invalid JSON');}
  if(data?.error||typeof data?.result!=='string')throw Error('Testnet RPC read rejected');
  return data.result;
}
export async function checkTestnetPayerReady({env=process.env,fetchImpl=fetch,quoteFetchImpl=fetch}={}){
  const config=validatePreflightConfig(env);
  const quote=await fetchX402Quote(config.endpoint,{allowedHost:config.allowedHost,fetchImpl:quoteFetchImpl});
  const exact=quote.options.filter(x=>x.network===config.network&&x.scheme==='exact'&&
    x.asset===config.asset&&x.amountAtomic===config.amountAtomic&&x.payee===config.payee);
  if(exact.length!==1)throw Error('Exact 0.01 USDC testnet quote is unavailable or ambiguous');
  const chainHex=await rpcRead(fetchImpl,config.rpcUrl,'eth_chainId',[],1);
  if(!/^0x[0-9a-f]+$/i.test(chainHex)||BigInt(chainHex)!==BigInt(EXPECTED_RPC_CHAIN_ID))
    throw Error('Configured RPC is not Base Sepolia');
  const balanceHex=await rpcRead(fetchImpl,config.rpcUrl,'eth_call',
    [{to:config.asset,data:BALANCE_OF+config.payer.slice(2).padStart(64,'0')},'latest'],2);
  if(!/^0x[0-9a-f]{1,64}$/i.test(balanceHex))throw Error('Cannot verify official USDC balance');
  const balance=BigInt(balanceHex);
  if(balance<BigInt(config.amountAtomic))throw Error('Insufficient Base Sepolia test USDC');
  return {
    status:'X402_TESTNET_PAYER_READY_NO_SIGNATURE',payer:config.payer,
    network:config.network,merchant:config.payee,asset:config.asset,
    amountAtomic:config.amountAtomic,availableUsdcAtomic:balance.toString(),
    endpoint:config.endpoint,
    intentFingerprint:createHash('sha256').update([
      config.network,config.asset,config.amountAtomic,config.payer,config.payee,config.endpoint
    ].join('|')).digest('hex').slice(0,24),
    signedTransactions:0,paymentExecuted:false,
    note:'Quote and wallet balance observed. This is not transaction authorization or merchant identity verification.'
  };
}
