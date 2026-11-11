// Narrow READ-ONLY workaround for GenLayer Studio RPC issue #1745:
// https://github.com/genlayerlabs/genlayer-studio/issues/1745
// Stable RPC can incorrectly strip only two RLP header bytes for calldata >=253
// bytes in gen_call. The GenLayer Studio parser's legacy fallback accepts
// BARE GenVM calldata, without the outer RLP([calldata, leaderOnly]) wrapper.
// This workaround MUST NOT be used to sign/write/deploy, and requires
// two independent live method comparisons before trusting filing_status.
import {abi} from 'genlayer-js';
import {toHex,fromHex} from 'viem';

const V2_MARKER='PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
const HASH=/^0x[0-9a-f]{64}$/i;
const ADDR=/^0x[0-9a-f]{40}$/i;
const CID=/^pj_[0-9a-f]{32}$/;
const ALLOWED=new Set(['READY_REQUIRES_BASE_PROOF','NOT_AUTHORIZED','TRANSFER_ALREADY_FILED','CASE_EXISTS']);
const FN='filing_status';
const VARIANT='latest-final';

function allowedParams(params){
  if(!params||params.functionName!==FN||!Array.isArray(params.args)||params.args.length!==8)
    throw Error('Unsafe unwrapped calldata request blocked');
  const [caseId,network,tx,asset,payer,payee,atomic,submitter]=params.args;
  if(!CID.test(caseId)||!['eip155:84532','eip155:8453'].includes(network)||
     !HASH.test(tx)||![asset,payer,payee,submitter].every(v=>ADDR.test(v))||
     !/^[1-9][0-9]{0,5}$/.test(atomic)||Number(atomic)>100000)
    throw Error('Invalid filing_status arguments for raw read');
  if(!ADDR.test(params.address||''))throw Error('Invalid V2 address');
  return {caseId,network,tx,asset,payer,payee,atomic,submitter};
}
export function isGenLayerOverlongRlpError(error){
  let e=error;
  for(let i=0;i<6&&e&&typeof e==='object';i++,e=e.cause){
    const m=String(e.shortMessage||e.message||'');
    if(/RLP string ends with \d+ superfluous bytes/i.test(m))return true;
  }
  return false;
}
export function bareCalldata(functionName,args){
  if(typeof functionName!=='string'||!Array.isArray(args))throw Error('Invalid read encoding');
  return toHex(abi.calldata.encode(abi.calldata.makeCalldataObject(functionName,args,undefined)));
}
export async function rawGenLayerRead(client,{address,functionName,args}){
  if(!client||typeof client.request!=='function'||!ADDR.test(address||''))
    throw Error('Invalid read-only GenLayer client');
  if(!['version','can_file_for',FN].includes(functionName))
    throw Error('Raw GenLayer RPC method not allowlisted');
  const raw=bareCalldata(functionName,args);
  if(raw.length<5||raw.length>1600||raw.endsWith('00'))
    throw Error('Unsafe bare calldata would trigger legacy RPC parser');
  const rpc=await client.request({method:'gen_call',params:[{
    type:'read',from:'0x'+'11'.repeat(20),to:address,
    data:raw,transaction_hash_variant:VARIANT
  }]});
  const code=rpc&&typeof rpc==='object'&&rpc.status?.code;
  if(code!==undefined&&code!==0)throw Error('GenLayer VM rejected raw read');
  let hex=typeof rpc==='string'?rpc:rpc?.data;
  if(typeof hex!=='string'||hex.length>18000||! /^(0x)?[0-9a-f]*$/i.test(hex))
    throw Error('Unexpected raw gen_call response');
  hex=hex.replace(/^0x/i,'');
  const out=abi.calldata.decode(fromHex('0x'+hex,'bytes'));
  if(typeof out!=='boolean'&&typeof out!=='string')
    throw Error('Unexpected raw read return type');
  return out;
}
export async function safelyReadV2FilingStatusRaw(client,params,{authoritativeReader}={}){
  const x=allowedParams(params);
  if(typeof authoritativeReader!=='function')throw Error('Regular SDK comparison required');
  const mainVersion=await authoritativeReader({address:params.address,functionName:'version',args:[]});
  if(mainVersion!==V2_MARKER)throw Error('Regular SDK V2 version mismatch');
  const bareVersion=await rawGenLayerRead(client,{address:params.address,functionName:'version',args:[]});
  if(bareVersion!==V2_MARKER)throw Error('Bare RPC version mismatch');
  const authArgs=[x.payer,x.network,x.tx,x.submitter];
  const usualAuthorized=await authoritativeReader({
    address:params.address,functionName:'can_file_for',args:authArgs
  });
  const bareAuthorized=await rawGenLayerRead(client,{
    address:params.address,functionName:'can_file_for',args:authArgs
  });
  if(typeof usualAuthorized!=='boolean'||bareAuthorized!==usualAuthorized)
    throw Error('Bare RPC permission comparison mismatch');
  const result=await rawGenLayerRead(client,params);
  if(!ALLOWED.has(result))throw Error('Unrecognized V2 filing status');
  // The value is the original contract's readback, not a synthesized READY.
  if(result==='READY_REQUIRES_BASE_PROOF'&&!usualAuthorized)
    throw Error('V2 returned ready despite unauthorized payer');
  return result;
}
