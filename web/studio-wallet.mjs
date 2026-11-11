// Browser-only GenLayer Studionet 61999 wallet adapter.
// Uses the user's EIP-1193 extension. No secrets or server-held signer.
import {createClient,isSuccessful} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const ADDRESS=/^0x[0-9a-f]{40}$/i;
const TX=/^0x[0-9a-f]{64}$/i;
let writeClient=null,writeAddress=null;
const readClient=createClient({chain:studionet});

export async function connectGenLayerWallet(){
  const provider=globalThis.window?.ethereum;
  if(!provider?.request)throw Error('No EIP-1193 wallet found. Open in a browser with MetaMask or compatible wallet.');
  if(studionet.id!==61999)throw Error('Unsupported GenLayer network');
  const accounts=await provider.request({method:'eth_requestAccounts'});
  const address=String(accounts?.[0]||'').toLowerCase();
  if(!ADDRESS.test(address))throw Error('Wallet returned an invalid address');
  const client=createClient({chain:studionet,account:address,provider});
  await client.connect('studionet');
  const connected=await provider.request({method:'eth_accounts'});
  if(!Array.isArray(connected)||!connected.some(x=>String(x).toLowerCase()===address))
    throw Error('Wallet account changed while connecting');
  writeAddress=address;
  writeClient=client;
  return address;
}
export function currentWallet(){return writeAddress;}
export async function readV2Contract(address,fn,args){
  if(!ADDRESS.test(address))throw Error('V2 GenLayer contract is not configured');
  return readClient.readContract({address,functionName:fn,args});
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
  const tx=await readClient.getTransaction({hash});
  const finished=tx?.statusName==='FINALIZED'||tx?.lifecycle==='finalized';
  return {hash,status:tx?.statusName||'UNKNOWN',
    execution:tx?.txExecutionResultName||'UNKNOWN',
    finalized:finished,success:finished&&isSuccessful(tx)};
}
