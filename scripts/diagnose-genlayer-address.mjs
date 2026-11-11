// Read-only, bounded diagnostics for a candidate PayJury deployment.
// Do not interpret a JSON-RPC internal error as proof of an absent contract.
// Compare a known previously deployed reference contract under BOTH
// decided and finalized snapshots. Never print raw RPC bodies or code.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PROPOSED_ADDRESS,STUDIO_RPC,analyzeContractSource} from './verify-genlayer-deployment.mjs';

export const REFERENCE_ADDRESS='0x7040Db57D130C9c121Ad7152143b5076abB3c2B5';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;

async function readOne({address,status,fetchImpl=fetch}){
  const request={jsonrpc:'2.0',id:1,method:'gen_getContractCode',
    params:[{address,status}]};
  let response;
  try{
    response=await fetchImpl(STUDIO_RPC,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/json'},body:JSON.stringify(request)
    });
  }catch(error){
    return {state:'UNAVAILABLE',reason:['TimeoutError','AbortError'].includes(String(error?.name))?'TIMEOUT':'TRANSPORT_ERROR'};
  }
  if(!response?.ok) return {state:'UNAVAILABLE',reason:'HTTP_ERROR',
    httpStatus:Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:null};
  let payload;
  try{payload=await response.json();}
  catch{return {state:'UNAVAILABLE',reason:'INVALID_JSON'};}
  if(payload?.error){
    const value=payload.error.code;
    return {state:'UNAVAILABLE',reason:'RPC_ERROR',rpcCode:Number.isSafeInteger(value)?value:null};
  }
  if(typeof payload?.result!=='string'||!payload.result.length){
    return {state:'UNAVAILABLE',reason:'EMPTY_CODE_RESPONSE'};
  }
  return {state:'CODE_RETURNED',code:payload.result};
}
function publicReadResult(result,localSource,address,snapshot){
  if(result.state!=='CODE_RETURNED')return result;
  const analyzed=analyzeContractSource(localSource,result.code,{address});
  return {state:analyzed.sourceMatches===true ?
      (snapshot==='finalized'?'SOURCE_MATCHED_FINALIZED':'SOURCE_MATCHED_DECIDED'):
      analyzed.status==='DEPLOYED_SOURCE_DIFFERENT'?'DEPLOYED_SOURCE_DIFFERENT':'DEPLOYED_CODE_UNVERIFIED',
    sourceMatches:analyzed.sourceMatches===true,
    declaredMethods:analyzed.expectedMethodsInDeployedSource||[]};
}
function publicReferenceResult(result){
  if(result.state!=='CODE_RETURNED')return result;
  // Positive control only checks that the node returned plausible contract
  // source, not that the reference contract has an identical version/ABI.
  const data=Buffer.from(result.code,'base64').toString('utf8');
  return {state:data.includes('class ') && data.includes('gl.Contract')?
    'REFERENCE_CODE_READABLE':'REFERENCE_CODE_UNEXPECTED_FORMAT'};
}
export async function diagnoseGenLayerAddress({
  address=PROPOSED_ADDRESS,
  referenceAddress=REFERENCE_ADDRESS,
  localSource,
  fetchImpl=fetch,
}={}){
  if(!ADDRESS.test(address)||!ADDRESS.test(referenceAddress))throw Error('Invalid address');
  if(typeof localSource!=='string')throw Error('Local source required');
  // Each call is pure read-only and bounded. No signing, payments or task writes.
  const targetDecided=await readOne({address,status:'decided',fetchImpl});
  const targetFinalized=await readOne({address,status:'finalized',fetchImpl});
  const referenceDecided=await readOne({address:referenceAddress,status:'decided',fetchImpl});
  const referenceFinalized=await readOne({address:referenceAddress,status:'finalized',fetchImpl});
  const target={decided:publicReadResult(targetDecided,localSource,address,'decided'),
    finalized:publicReadResult(targetFinalized,localSource,address,'finalized')};
  const reference={decided:publicReferenceResult(referenceDecided),
    finalized:publicReferenceResult(referenceFinalized)};
  let status='UNVERIFIED';
  if(target.finalized.state==='SOURCE_MATCHED_FINALIZED'){
    status='TARGET_SOURCE_MATCHED_FINALIZED';
  }else if(target.finalized.state==='DEPLOYED_SOURCE_DIFFERENT'||
           target.decided.state==='DEPLOYED_SOURCE_DIFFERENT'){
    status='TARGET_SOURCE_DIFFERENT';
  }else if(target.decided.state==='SOURCE_MATCHED_DECIDED'){
    // Helper labels a source match against supplied data, not finality; this
    // decided-only case MUST NOT be accepted as a finalized deployment.
    status='TARGET_READABLE_DECIDED_ONLY';
  }else if(reference.decided.state==='REFERENCE_CODE_READABLE'||
           reference.finalized.state==='REFERENCE_CODE_READABLE'){
    status='TARGET_UNREADABLE_WITH_WORKING_REFERENCE';
  }else{
    status='REFERENCE_AND_TARGET_UNVERIFIED';
  }
  return {
    status, chainIdExpected:61999,
    rpc:STUDIO_RPC, address,referenceAddress,
    target,reference,requestsMade:4,signedTransactions:0,
    deploymentTxVerified:false,
    note:'Even a finalized source match is not the original deployment transaction / GenVM execution proof. -32603 is not proof a contract is absent.',
  };
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const localSource=await readFile(new URL('../contracts/PayJury.py',import.meta.url),'utf8');
    const result=await diagnoseGenLayerAddress({
      address:process.env.GENLAYER_CONTRACT_ADDRESS||PROPOSED_ADDRESS,localSource
    });
    console.log('PAYJURY_STUDIONET_COMPARATIVE_READ',JSON.stringify(result));
    if(result.status!=='TARGET_SOURCE_MATCHED_FINALIZED')process.exitCode=2;
  }catch{
    console.error('PAYJURY_STUDIONET_COMPARATIVE_UNAVAILABLE: local setup invalid or read refused; no signing.');
    process.exitCode=2;
  }
}
