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
function exactSourceMatch(deployed,local){
  if(typeof deployed!=='string'||!deployed.trim())return null;
  return deployed===local||deployed.replace(/\r\n/g,'\n')===local.replace(/\r\n/g,'\n');
}
export async function verifyV2ReadOnly({getTransaction,readContract,getContractCode,localSource}){
  if(typeof getTransaction!=='function'||typeof readContract!=='function')throw Error('Read-only GenLayer SDK methods required');
  const out={address:V2_ADDRESS,deployTx:V2_DEPLOY_TX,chainId:61999,
    sourceIdentity:'UNVERIFIED',sourceSha256:typeof localSource==='string'?sha256(localSource):null,
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
      const matched=exactSourceMatch(code,localSource);
      if(matched===true)out.sourceIdentity='SOURCE_TEXT_MATCHED';
      else if(matched===false)out.sourceIdentity='SOURCE_TEXT_MISMATCH';
      else out.warnings.push('SOURCE_CODE_NOT_RETURNED');
    }catch{
      out.warnings.push('SOURCE_RPC_READ_UNAVAILABLE: This is not evidence of a failed deployment.');
    }
  }
  const successfulTx=out.deployment?.result==='FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED';
  const correctMethods=out.version===V2_MARKER&&out.payerCanFile===true&&out.strangerCanFile===false;
  out.result=successfulTx&&correctMethods&&out.sourceIdentity!=='SOURCE_TEXT_MISMATCH'?
    'V2_DEPLOY_AND_AUTHORIZATION_READBACK_PASS':correctMethods&&
      out.sourceIdentity!=='SOURCE_TEXT_MISMATCH'?
      'V2_METHODS_PASS_DEPLOY_TX_READ_UNCONFIRMED':'V2_NOT_READY_FOR_SIGNING';
  if(out.sourceIdentity==='SOURCE_TEXT_MISMATCH')
    out.warnings.push('SOURCE_MISMATCH: do not enable signing. Confirm deployed source independently.');
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
