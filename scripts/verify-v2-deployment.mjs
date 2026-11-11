// PAYJURY V2 post-deployment verifier — READ ONLY.
// A real Explorer deployment and an RPC contract read are different evidence.
// Never signs, pays, sends a transaction or assumes that version() proves source integrity.
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createClient,createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {inspectDeployTransaction} from './inspect-deploy-tx.mjs';

export const V2_ADDRESS='0x0a6171C6a580c58d999a251436CE7c63FFc3dc31';
export const V2_DEPLOY_TX='0x1fd845e9574e6c0956d5fd03afac8c7c70e75ea6532d4095fae3aa1276045f98';
export const V2_MARKER='PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1';
const NETWORK='eip155:84532';
const TEST_PAYER='0x'+'1'.repeat(40);
const TEST_STRANGER='0x'+'2'.repeat(40);
const TEST_TX='0x'+'a'.repeat(64);
const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');
function sourceEncoding(deployed){
  // SDK usually returns Python source. If it returns a Base64 transport value,
  // decode ONLY an unambiguous Base64 envelope (and keep the raw SHA-256).
  if(typeof deployed!=='string'||!deployed.trim())
    return {code:null,encoding:'UNAVAILABLE'};
  const text=deployed.trim();
  if(text.length>=32&&text.length%4===0&&
     /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)){
    try{
      const decoded=Buffer.from(text,'base64').toString('utf8');
      // A GenLayer Python source starts with its depends header, an import or a class.
      if(/^(?:\\ufeff)?(?:#|from |import |class |@)/.test(decoded))
        return {code:decoded,encoding:'BASE64_TRANSPORT'};
    }catch{}
  }
  return {code:deployed,encoding:'SOURCE_TEXT'};
}
function normalizedSource(source){
  // Only used to classify obvious formatting differences, never to
  // silently certify byte-for-byte source identity.
  return source.replace(/^\\ufeff/,'').replace(/\\r\\n?/g,'\\n').replace(/\\n+$/,'\\n');
}
const byteLength=source=>Buffer.byteLength(source,'utf8');
const limitedLine=value=>{
  // Public source diagnostics: short snippets only; never dump entire code.
  const line=String(value||'').slice(0,130);
  return line.replace(/[\\r\\n\\t]/g,' ');
};
export function compareV2Source(deployed,local){
  if(typeof local!=='string'||!local.length)throw Error('Local V2 source required');
  const parsed=sourceEncoding(deployed);
  if(!parsed.code)return {
    result:'UNVERIFIED',encoding:parsed.encoding,localBytes:byteLength(local),
    localSha256:sha256(local),deployedSha256:null,firstDifferentLine:null
  };
  const actual=parsed.code;
  const localLines=local.replace(/\\r\\n?/g,'\\n').split('\\n');
  const deployedLines=actual.replace(/\\r\\n?/g,'\\n').split('\\n');
  const firstIdx=Array.from({length:Math.max(localLines.length,deployedLines.length)})
    .findIndex((_,idx)=>localLines[idx]!==deployedLines[idx]);
  const exact=actual===local;
  const formattingOnly=!exact&&normalizedSource(actual)===normalizedSource(local);
  const safePreview=firstIdx>=0?{
    number:firstIdx+1,
    local:limitedLine(localLines[firstIdx]),
    deployed:limitedLine(deployedLines[firstIdx]),
  }:null;
  return {
    result:exact?'SOURCE_TEXT_MATCHED':
      formattingOnly?'SOURCE_FORMAT_ONLY_DIFFERENCE':'SOURCE_TEXT_MISMATCH',
    encoding:parsed.encoding,localBytes:byteLength(local),
    deployedBytes:byteLength(actual),
    localSha256:sha256(local),deployedSha256:sha256(actual),
    localLineCount:localLines.length,deployedLineCount:deployedLines.length,
    firstDifferentLine:safePreview,
    note:exact?'Exact source text matches after any explicit Base64 transport decoding.':
      formattingOnly?'Only BOM, newline conventions or terminal blank lines differ. Exact deployed-source bytes still not matched.':
      'Deployed code differs from repository source. Compare the first differing line and audit the Studio source before signing.'
  };
}
export async function verifyV2ReadOnly({getTransaction,readContract,getContractCode,localSource}){
  if(typeof getTransaction!=='function'||typeof readContract!=='function')throw Error('Read-only GenLayer SDK methods required');
  const out={address:V2_ADDRESS,deployTx:V2_DEPLOY_TX,chainId:61999,
    sourceIdentity:'UNVERIFIED',sourceSha256:typeof localSource==='string'?sha256(localSource):null,
    sourceDiagnosis:null,
    version:null,payerCanFile:null,strangerCanFile:null,
    deployment:null,warnings:[],signedTransactions:0};
  try{
    out.deployment=await inspectDeployTransaction({getTransaction,address:V2_ADDRESS,hash:V2_DEPLOY_TX});
  }catch{
    out.warnings.push('DEPLOY_RPC_READ_UNAVAILABLE: Explorer evidence must be checked separately; never redeploy based on this read failure.');
  }
  try{
    const [version,payerCanFile,strangerCanFile]=await Promise.all([
      readContract({address:V2_ADDRESS,functionName:'version',args:[]}),
      readContract({address:V2_ADDRESS,functionName:'can_file_for',args:[TEST_PAYER,NETWORK,TEST_TX,TEST_PAYER]}),
      readContract({address:V2_ADDRESS,functionName:'can_file_for',args:[TEST_PAYER,NETWORK,TEST_TX,TEST_STRANGER]})
    ]);
    out.version=typeof version==='string'?version:null;
    out.payerCanFile=payerCanFile;
    out.strangerCanFile=strangerCanFile;
  }catch{
    out.warnings.push('V2_METHOD_READ_UNAVAILABLE: Could not confirm version and payer/delegate rights. Do not enable signing yet.');
  }
  if(typeof getContractCode==='function'&&typeof localSource==='string'){
    try{
      // genlayer-js getContractCode expects the Address STRING, not {address}.
      // Passing an object makes the RPC backend receive a dict as its ID.
      const code=await getContractCode(V2_ADDRESS);
      out.sourceDiagnosis=compareV2Source(code,localSource);
      out.sourceIdentity=out.sourceDiagnosis.result;
      if(out.sourceIdentity==='UNVERIFIED')out.warnings.push('SOURCE_CODE_NOT_RETURNED');
      if(out.sourceIdentity==='SOURCE_FORMAT_ONLY_DIFFERENCE')
        out.warnings.push('SOURCE_FORMAT_ONLY_DIFFERENCE: review and approve the exact differing bytes before enabling V2 signing.');
    }catch{
      out.warnings.push('SOURCE_RPC_READ_UNAVAILABLE: This is not evidence of a failed deployment.');
    }
  }
  const successfulTx=out.deployment?.result==='FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED';
  const correctMethods=out.version===V2_MARKER&&out.payerCanFile===true&&out.strangerCanFile===false;
  out.result=successfulTx&&correctMethods&&out.sourceIdentity!=='SOURCE_TEXT_MISMATCH'&&out.sourceIdentity!=='SOURCE_FORMAT_ONLY_DIFFERENCE'?
    'V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS':correctMethods&&
      out.sourceIdentity!=='SOURCE_TEXT_MISMATCH'&&out.sourceIdentity!=='SOURCE_FORMAT_ONLY_DIFFERENCE'?
      'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED':'V2_NOT_READY_FOR_SIGNING';
  if(out.sourceIdentity==='SOURCE_TEXT_MISMATCH')
    out.warnings.push('SOURCE_MISMATCH: do not enable signing. Confirm deployed source independently.');
  if(out.sourceIdentity==='SOURCE_FORMAT_ONLY_DIFFERENCE')
    out.warnings.push('BYTE_EXACT_IDENTITY_NOT_PROVEN: do not enable signing based only on normalized text.');
  if(out.sourceIdentity==='UNVERIFIED')
    out.warnings.push('SOURCE_IDENTITY_NOT_PROVEN: version marker and authorization methods are not byte-for-byte proof of deployed source.');
  out.next=out.result==='V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS'?
    'Read-only checks passed. Manually review the contract/source evidence before setting GENLAYER_V2_CONTRACT_ADDRESS; no case has been filed in V2.':
    'Keep V2 signing disabled; inspect TX and read failures without retrying deployment.';
  return out;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(studionet.id!==61999){
    console.error('PAYJURY_V2_NOT_READY',JSON.stringify({reason:'WRONG_NETWORK',signedTransactions:0}));
    process.exitCode=2;
  }else{
    try{
      const client=createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
      const localSource=await readFile(new URL('../contracts/PayJuryV2.py',import.meta.url),'utf8');
      const out=await verifyV2ReadOnly({
        getTransaction:arg=>client.getTransaction(arg),
        readContract:arg=>client.readContract(arg),
        getContractCode:typeof client.getContractCode==='function'?
          address=>client.getContractCode(address):undefined,
        localSource
      });
      console.log('PAYJURY_V2_DEPLOYMENT_INSPECTION_READ_ONLY',JSON.stringify(out));
      if(out.result!=='V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS')process.exitCode=2;
    }catch{
      console.error('PAYJURY_V2_NOT_READY',JSON.stringify({
        reason:'READ_ONLY_INSPECTION_UNAVAILABLE',signedTransactions:0,
        note:'Inspect the original deployment in Explorer and call version() in Studio. Never redeploy based on a read error.'
      }));
      process.exitCode=2;
    }
  }
}
