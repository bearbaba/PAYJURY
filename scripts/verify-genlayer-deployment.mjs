// Read-only Studionet deployment proof: code at a finalized snapshot, not a
// deploy TX or GenVM receipt. This script cannot sign or mutate anything.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const STUDIO_RPC = 'https://studio.genlayer.com/api';
export const PROPOSED_ADDRESS = '0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8';
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const EXPECTED_METHODS = Object.freeze(['file_case','adjudicate_case','get_case']);

export function normalizedSource(source) {
  if(typeof source!=='string') throw Error('Invalid contract source');
  return source.replace(/\r\n/g,'\n').trimEnd()+'\n';
}
function fingerprint(value){
  return createHash('sha256').update(normalizedSource(value),'utf8').digest('hex');
}
export function analyzeContractSource(localSource,chainCodeBase64,{address=PROPOSED_ADDRESS}={}) {
  if(!ADDRESS.test(address))throw Error('Invalid GenLayer contract address');
  if(typeof chainCodeBase64!=='string' || !chainCodeBase64.length ||
    chainCodeBase64.length>3_000_000 || !BASE64.test(chainCodeBase64)) {
    return {status:'DEPLOYED_CODE_UNVERIFIED',address,reason:'No parseable finalized contract code'};
  }
  const bytes=Buffer.from(chainCodeBase64,'base64');
  const chainSource=bytes.toString('utf8');
  if(!chainSource.trim() || !chainSource.includes('class ') || chainSource.includes('\ufffd')) {
    return {status:'DEPLOYED_CODE_UNVERIFIED',address,reason:'Unsupported deployed code content'};
  }
  const localSha256=fingerprint(localSource);
  const deployedSha256=fingerprint(chainSource);
  const sourceMatches=localSha256===deployedSha256;
  return {
    status:sourceMatches?'SOURCE_MATCHED_FINALIZED_STATE':'DEPLOYED_SOURCE_DIFFERENT',
    address,chainId:61999,
    sourceMatches,
    localSha256,deployedSha256,
    expectedMethodsInDeployedSource:EXPECTED_METHODS.filter(method=>
      new RegExp('(?:async\\s+)?def\\s+'+method+'\\s*\\(').test(chainSource)),
    deploymentTxVerified:false,
    message:sourceMatches
      ? 'Deployed code equals repository PayJury.py at finalized snapshot. Deployment transaction hash and GenVM result still require separate explorer audit.'
      : 'Address returned deployed source, but it differs from the repository PayJury.py. Do not configure the web or sign case transactions before reviewing it.'
  };
}
export async function probePayJury({
  address=PROPOSED_ADDRESS,
  fetchImpl=fetch,
  localSource,
  rpcUrl=STUDIO_RPC
}={}) {
  if(!ADDRESS.test(address))throw Error('Invalid GenLayer contract address');
  if(rpcUrl!==STUDIO_RPC) throw Error('Only official Studionet RPC is permitted');
  if(typeof localSource!=='string')throw Error('Local contract source required');
  const response=await fetchImpl(rpcUrl,{
    method:'POST',redirect:'error',headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(12000),
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'gen_getContractCode',params:[{
      address,status:'finalized'
    }]})
  });
  if(!response.ok) throw Error('Studionet RPC HTTP unavailable');
  const payload=await response.json();
  if(payload?.error || typeof payload?.result!=='string') {
    throw Error('Studionet did not return verifiable finalized contract code');
  }
  return analyzeContractSource(localSource,payload.result,{address});
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const address=process.env.GENLAYER_CONTRACT_ADDRESS||PROPOSED_ADDRESS;
  const sourcePath=new URL('../contracts/PayJury.py',import.meta.url);
  try {
    const localSource=await readFile(sourcePath,'utf8');
    const result=await probePayJury({address,localSource});
    console.log('PAYJURY_STUDIONET_READ_ONLY',JSON.stringify(result));
    if(result.status!=='SOURCE_MATCHED_FINALIZED_STATE') process.exitCode=2;
  } catch {
    console.error('PAYJURY_DEPLOYMENT_UNVERIFIED: RPC or deployed code unavailable. No transactions signed; check Studio and Explorer.');
    process.exitCode=2;
  }
}
