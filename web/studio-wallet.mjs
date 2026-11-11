// Browser-only GenLayer Studionet 61999 wallet adapter.
// Uses the user's EIP-1193 extension. No secrets or server-held signer.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {x402Client} from '@x402/core/client';
import {ExactEvmScheme} from '@x402/evm/exact/client';
import {wrapFetchWithPayment} from '@x402/fetch';
import {createWalletClient,custom} from 'viem';
import {baseSepolia} from 'viem/chains';

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const TX=/^0x[0-9a-f]{64}$/i;
const STUDIO_CHAIN_ID='0xf22f'; // 61999
let writeClient=null,writeAddress=null;

function explainWalletError(stage,error){
  const code=error?.code??error?.cause?.code??null;
  const original=String(error?.shortMessage||error?.message||'Wallet request failed');
  const detail=original.length>140?original.slice(0,140):original;
  if(code===4001||/user rejected|user denied/i.test(detail))
    return Error(stage+': connection or network change was rejected in the wallet.');
  if(code===-32002)return Error(stage+': a wallet permission request is already pending. Check your wallet popup.');
  if(code===4902)return Error(stage+': GenLayer Studionet is not installed. Add chain ID 61999 with RPC https://studio.genlayer.com/api in your wallet.');
  if(code===4900||code===4901)return Error(stage+': wallet provider is disconnected. Reopen or unlock the wallet.');
  return Error(stage+': '+detail+'. Check GenLayer Studionet (chain 61999) and wallet RPC configuration.');
}
async function sameOriginRead(url){
  let response;
  try{response=await fetch(url,{method:'GET',cache:'no-store'});}
  catch{throw Error('PAYJURY local read service unreachable. Reload page; no wallet signature was requested.');}
  let body;
  try{body=await response.json();}
  catch{throw Error('PAYJURY read service returned an invalid response. No wallet signature was requested.');}
  if(!response.ok){
    const error=Error(String(body.error||'GenLayer read unavailable').slice(0,180));
    // Only a recognized, server-confirmed read failure may trigger the
    // narrow operator-reviewed testnet acceptance route in web/app.js.
    if(body.code==='GENLAYER_RLP_255_READ_UNAVAILABLE'&&
       body.filingStatus==='UNVERIFIED'&&body.readOnly===true)
      error.code='GENLAYER_RLP_255_READ_UNAVAILABLE';
    throw error;
  }
  return body;
}
export async function connectGenLayerWallet(){
  const provider=globalThis.window?.ethereum;
  if(!provider?.request)
    throw Error('No EIP-1193 wallet provider detected in this browser. Unlock MetaMask or open PAYJURY in the browser with your wallet extension.');
  if(studionet.id!==61999)throw Error('Unexpected GenLayer network configuration');
  let accounts;
  try{accounts=await provider.request({method:'eth_requestAccounts'});}
  catch(error){throw explainWalletError('Wallet account permission',error);}
  const address=String(accounts?.[0]||'').toLowerCase();
  if(!ADDRESS.test(address))throw Error('Wallet did not return a valid account address');
  let chainId;
  try{chainId=String(await provider.request({method:'eth_chainId'})).toLowerCase();}
  catch(error){throw explainWalletError('Wallet chain identity check',error);}
  const client=createClient({chain:studionet,account:address,provider});
  if(chainId!==STUDIO_CHAIN_ID){
    // Do not ask to switch networks if wallet is already on Studionet.
    // SDK switches/adds the chain; it does not sign a transaction.
    try{await client.connect('studionet');}
    catch(error){throw explainWalletError('Switch to GenLayer Studionet',error);}
  }
  let connected,verifiedChain;
  try{
    [connected,verifiedChain]=await Promise.all([
      provider.request({method:'eth_accounts'}),
      provider.request({method:'eth_chainId'})
    ]);
  }catch(error){throw explainWalletError('Wallet account/network confirmation',error);}
  if(!Array.isArray(connected)||!connected.some(x=>String(x).toLowerCase()===address))
    throw Error('Wallet account changed. Connect the same account again; no transaction was sent.');
  if(String(verifiedChain).toLowerCase()!==STUDIO_CHAIN_ID)
    throw Error('Wallet still on a different network. Select GenLayer Studionet (chain 61999) in the wallet before signing.');
  writeAddress=address;
  writeClient=client;
  return address;
}
export function currentWallet(){return writeAddress;}
export async function readV2Contract(address,fn,args){
  if(!ADDRESS.test(address))throw Error('V2 GenLayer contract address is invalid');
  // Browser RPC to studio.genlayer.com may be blocked by CSP/CORS. Perform
  // ONLY allowlisted reads using the local PAYJURY backend, never signer APIs.
  const query='method='+encodeURIComponent(fn)+'&args='+encodeURIComponent(JSON.stringify(args));
  const body=await sameOriginRead('/api/v2/read?'+query);
  if(body.readOnly!==true||String(body.address||'').toLowerCase()!==address.toLowerCase()||body.method!==fn)
    throw Error('GenLayer V2 read identity mismatch; wallet action blocked');
  return body.result;
}
async function confirmV2WalletBeforeWrite(address,fn,args){
  if(!writeClient||!writeAddress)throw Error('Connect GenLayer wallet before signing');
  if(!ADDRESS.test(address))throw Error('Invalid GenLayer V2 contract');
  if(!['file_case','adjudicate_case','set_delegate'].includes(fn)||!Array.isArray(args))
    throw Error('Unsupported GenLayer V2 write method');
  const provider=globalThis.window?.ethereum;
  if(!provider?.request)throw Error('GenLayer wallet provider disconnected');
  const active=await provider.request({method:'eth_accounts'});
  if(!Array.isArray(active)||String(active[0]||'').toLowerCase()!==writeAddress)
    throw Error('Wallet changed. Reconnect before signing');
  const network=String(await provider.request({method:'eth_chainId'})).toLowerCase();
  if(network!==STUDIO_CHAIN_ID)
    throw Error('Wallet is not on GenLayer Studionet 61999. Reconnect GenLayer wallet; never sign on Base Sepolia.');
}
// This repository pins genlayer-js 1.1.8. That SDK HAS writeContract()
// but does NOT implement estimateTransactionFeesForWrite() or its fees option.
// Perform a real wallet/account/chain capability check BEFORE creating the
// persistent one-shot transaction lock. The wallet handles actual signing.
export async function preflightV2Write(address,fn,args){
  await confirmV2WalletBeforeWrite(address,fn,args);
  if(typeof writeClient.writeContract!=='function')
    throw Error('Installed GenLayer SDK has no supported writeContract method. No signature requested.');
  // SDK v1.1.8 expects {address,functionName,args,value}. No unsupported
  // fees field, no arbitrary user value, no automated signing or replay.
  return Object.freeze({address,functionName:fn,args,value:0n});
}
export async function sendV2Write(address,fn,args,preparedWrite){
  if(!preparedWrite||preparedWrite.address!==address||
     preparedWrite.functionName!==fn||preparedWrite.args!==args||
     preparedWrite.value!==0n)
    throw Error('GenLayer wallet write preflight did not match the approved action');
  // The caller already checked wallet, network, payer, exact case/payment
  // and created the permanent one-shot lock immediately BEFORE this call.
  // No automatic retry even if the provider returns an uncertain outcome.
  const hash=await writeClient.writeContract(preparedWrite);
  if(typeof hash!=='string'||!TX.test(hash))
    throw Error('GenLayer returned an invalid transaction ID; outcome is uncertain');
  return hash;
}
export async function checkV2Transaction(hash){
  if(!TX.test(hash))throw Error('Invalid GenLayer transaction hash');
  const body=await sameOriginRead('/api/v2/tx?hash='+encodeURIComponent(hash));
  if(String(body.hash||'').toLowerCase()!==hash.toLowerCase())
    throw Error('GenLayer transaction lookup hash mismatch; never retry the write.');
  return {hash,status:body.status,execution:body.execution,
    finalized:body.finalized===true,success:body.success===true};
}

/**
 * Single testnet x402 purchase from EXACTLY the EOA that is authorized to
 * file directly in PAYJURY V2. EIP-712 signing happens in the user's wallet.
 * Payment is relayed by the same-origin server under a permanent one-shot lock.
 * No private key, account secret or general payment allowance is requested.
 */
const V2_TEST_PAYER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const BASE_TEST_CHAIN='0x14a34'; // 84532
const TEST_USDC='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const EXACT_MERCHANT='0xe3837fe309618ae075dbef0a20735c0615a308e6';
const PURCHASE_LOCK='payjury:v2:one-paid-x402:'+V2_TEST_PAYER;

async function enforceBaseSepolia(provider){
  let chain=String(await provider.request({method:'eth_chainId'})).toLowerCase();
  if(chain===BASE_TEST_CHAIN)return;
  try{
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE_TEST_CHAIN}]});
  }catch(error){
    if(error?.code!==4902&&error?.cause?.code!==4902)throw explainWalletError('Switch to Base Sepolia testnet',error);
    await provider.request({method:'wallet_addEthereumChain',params:[{
      chainId:BASE_TEST_CHAIN,chainName:'Base Sepolia',
      nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},
      rpcUrls:['https://sepolia.base.org'],
      blockExplorerUrls:['https://sepolia.basescan.org']
    }]});
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:BASE_TEST_CHAIN}]});
  }
  chain=String(await provider.request({method:'eth_chainId'})).toLowerCase();
  if(chain!==BASE_TEST_CHAIN)throw Error('Wallet did not switch to Base Sepolia; no payment authorized');
}
export async function payV2X402Once(){
  const provider=globalThis.window?.ethereum;
  if(!provider?.request)throw Error('Wallet extension unavailable; cannot initiate a testnet purchase');
  const connected=await provider.request({method:'eth_requestAccounts'});
  const account=String(connected?.[0]||'').toLowerCase();
  if(account!==V2_TEST_PAYER)
    throw Error('Selected Base payer differs from GenLayer V2 claimant. Select 0x4C7c...8Dcb before signing.');
  const locked=globalThis.localStorage?.getItem(PURCHASE_LOCK);
  if(locked)throw Error('A one-shot x402 payment attempt is already recorded locally. Do not repeat or clear it; check the original transaction.');
  await enforceBaseSepolia(provider);
  const wallet=createWalletClient({
    account:V2_TEST_PAYER,chain:baseSepolia,transport:custom(provider)
  });
  const signer={
    address:V2_TEST_PAYER,
    signTypedData:params=>wallet.signTypedData({...params,account:V2_TEST_PAYER})
  };
  const client=new x402Client();
  client.register('eip155:*',new ExactEvmScheme(signer));
  client.registerPolicy((version,requirements)=>{
    if(version!==2||!Array.isArray(requirements))return [];
    return requirements.filter(r=>r?.scheme==='exact'&&r?.network==='eip155:84532'&&
      String(r?.asset||'').toLowerCase()===TEST_USDC&&
      String(r?.payTo||'').toLowerCase()===EXACT_MERCHANT&&
      r?.amount==='10000'&&[undefined,'eip3009'].includes(r?.extra?.assetTransferMethod));
  });
  const paidFetch=wrapFetchWithPayment(fetch,client);
  if(!globalThis.localStorage)throw Error('One-shot local payment lock storage unavailable; payment blocked');
  // Persist a lock BEFORE any wallet signature. An unknown outcome must stay locked.
  globalThis.localStorage.setItem(PURCHASE_LOCK,JSON.stringify({
    state:'ATTEMPTED_UNKNOWN',at:new Date().toISOString(),
    network:'eip155:84532',amountAtomic:'10000',
    payer:V2_TEST_PAYER,merchant:EXACT_MERCHANT
  }));
  try{
    const response=await paidFetch('/api/v2/x402/execute',{method:'GET',
      headers:{accept:'application/json'},redirect:'error'});
    const result=await response.json();
    if(response.ok&&result.result==='PAYMENT_AND_BASE_USDC_VERIFIED_V2_CASE_PREPARED'&&
       result.packet?.payer===V2_TEST_PAYER&&result.packet?.settlement?.result==='BASE_USDC_TRANSFER_VERIFIED'){
      globalThis.localStorage.setItem(PURCHASE_LOCK,JSON.stringify({
        state:'PAID_AND_VERIFIED',txHash:result.paymentTx,caseId:result.caseId,
        at:new Date().toISOString()
      }));
    }else if(typeof result.txHash==='string'&&TX.test(result.txHash)){
      globalThis.localStorage.setItem(PURCHASE_LOCK,JSON.stringify({
        state:'PAYMENT_OUTCOME_REQUIRES_REVIEW',txHash:result.txHash,at:new Date().toISOString()
      }));
    }
    return result;
  }catch(error){
    const rejected=error?.code===4001||error?.cause?.code===4001||
      /user rejected|user denied|user cancelled/i.test(String(error?.shortMessage||error?.message||''));
    if(rejected)globalThis.localStorage.removeItem(PURCHASE_LOCK);
    throw Error(rejected?
      'Wallet declined EIP-3009 signing. No payment authorized; you can review the quote again.':
      'Outcome uncertain after payment attempt: '+String(error?.shortMessage||error?.message||'unknown').slice(0,125)+
        '. Keep the one-shot lock; do not retry. Check provider and Base transaction first.');
  }
}
