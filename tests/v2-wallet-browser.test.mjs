import test from 'node:test';
import assert from 'node:assert/strict';
import {connectGenLayerWallet,currentWallet,readV2Contract,checkV2Transaction} from '../web/studio-wallet.mjs';

const PAYER='0x'+'1'.repeat(40);
const V2='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
const TX='0x'+'a'.repeat(64);
function mockProvider(request){
  return {ethereum:{request}};
}
test('wallet connection on already-correct Studionet performs NO transaction and NO unnecessary switch',async()=>{
  const saved=globalThis.window;
  const methods=[];
  globalThis.window=mockProvider(async({method})=>{
    methods.push(method);
    if(method==='eth_requestAccounts'||method==='eth_accounts')return [PAYER];
    if(method==='eth_chainId')return '0xf22f';
    throw Error('Unapproved wallet operation: '+method);
  });
  try{
    const address=await connectGenLayerWallet();
    assert.equal(address,PAYER);
    assert.equal(currentWallet(),PAYER);
    assert.deepEqual(methods,['eth_requestAccounts','eth_chainId','eth_accounts','eth_chainId']);
  }finally{globalThis.window=saved;}
});
test('wallet connection explicitly identifies permission error instead of generic RPC mystery',async()=>{
  const saved=globalThis.window;
  globalThis.window=mockProvider(async({method})=>{
    if(method==='eth_requestAccounts')throw Object.assign(Error('User rejected'),{code:4001});
    throw Error('Unexpected provider call');
  });
  try{
    await assert.rejects(connectGenLayerWallet(),/Wallet account permission: connection or network change was rejected/);
  }finally{globalThis.window=saved;}
});
test('version reads go through same-origin PAYJURY endpoint, not direct browser GenLayer RPC',async()=>{
  const prior=globalThis.fetch;
  let seen=null;
  globalThis.fetch=async (url,opts)=>{
    seen={url,opts};
    return {ok:true,json:async()=>({
      address:V2,method:'version',result:'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1',readOnly:true
    })};
  };
  try{
    assert.equal(await readV2Contract(V2,'version',[]),'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1');
    assert.match(seen.url,/^\/api\/v2\/read\?method=version&args=/);
    assert.equal(seen.opts.method,'GET');
    assert.equal(seen.opts.cache,'no-store');
  }finally{globalThis.fetch=prior;}
});
test('V2 read fails closed when proxy contract address does not match',async()=>{
  const prior=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>({
    address:'0x'+'3'.repeat(40),method:'version',
    result:'PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1',readOnly:true
  })});
  try{await assert.rejects(readV2Contract(V2,'version',[]),/identity mismatch/);}
  finally{globalThis.fetch=prior;}
});
test('transaction check uses read-only same-origin route, not RPC in browser and does not retry writes',async()=>{
  const prior=globalThis.fetch;
  let count=0,visited=null;
  globalThis.fetch=async url=>{
    count++;visited=url;
    return {ok:true,json:async()=>({
      hash:TX,status:'FINALIZED',execution:'FINISHED_WITH_RETURN',finalized:true,success:true
    })};
  };
  try{
    const data=await checkV2Transaction(TX);
    assert.equal(data.success,true);
    assert.equal(data.finalized,true);
    assert.equal(count,1);
    assert.equal(visited,'/api/v2/tx?hash='+TX);
  }finally{globalThis.fetch=prior;}
});
