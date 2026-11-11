// Browser-only GenLayer Studionet 61999 wallet adapter.
// Uses the user's EIP-1193 extension. No secrets or server-held signer.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

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
  if(!response.ok)throw Error(String(body.error||'GenLayer read unavailable').slice(0,180));
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
export async function sendV2Write(address,fn,args){
  if(!writeClient||!writeAddress)throw Error('Connect GenLayer wallet before signing');
  if(!ADDRESS.test(address))throw Error('Invalid GenLayer V2 contract');
  const provider=globalThis.window?.ethereum;
  const active=await provider.request({method:'eth_accounts'});
  if(!Array.isArray(active)||String(active[0]||'').toLowerCase()!==writeAddress)
    throw Error('Wallet changed. Reconnect before signing');
  const write={address,functionName:fn,args};
  // No arbitrary fees or unstated transfers. Estimate actual network fees.
  const estimate=await writeClient.estimateTransactionFeesForWrite(write);
  const hash=await writeClient.writeContract({...write,
    fees:{distribution:estimate.distribution,feeValue:estimate.feeValue}});
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
