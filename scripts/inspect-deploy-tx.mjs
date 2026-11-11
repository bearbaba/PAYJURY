// PAYJURY deployed-contract transaction readback — READ ONLY.
// The address and explorer status below were supplied by the operator.
// Public Explorer evidence and SDK transaction lookup are separate sources;
// neither is a deployed-source equivalence proof. No signing or retries.
import {fileURLToPath} from 'node:url';
import {createClient,createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

export const PAYJURY_ADDRESS='0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8';
export const PAYJURY_DEPLOY_TX='0x2703920edd2a717344dddd1617c4ae7cddc6e5ed30aadb077c4ddb5c70bd399e';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const HASH=/^0x[0-9a-fA-F]{64}$/;
function normalizedExecution(tx){
  const named=String(tx?.txExecutionResultName||'').toUpperCase().replace(/[^A-Z]/g,'');
  if(named==='FINISHEDWITHRETURN')return 'SUCCESS';
  if(named==='FINISHEDWITHERROR')return 'ERROR';
  const code=typeof tx?.txExecutionResult==='bigint'?Number(tx.txExecutionResult):tx?.txExecutionResult;
  if(code===1)return 'SUCCESS';
  if(code===2)return 'ERROR';
  const receipt=tx?.consensus_data?.leader_receipt;
  if(!Array.isArray(receipt)||!receipt.length)return 'UNCONFIRMED';
  const results=receipt.map(r=>String(r?.execution_result||'UNKNOWN').toUpperCase());
  if(results.every(x=>x==='SUCCESS'))return 'SUCCESS';
  if(results.some(x=>x==='ERROR'))return 'ERROR';
  return 'UNCONFIRMED';
}
export function summarizeDeployTransaction(tx,{address=PAYJURY_ADDRESS,hash=PAYJURY_DEPLOY_TX}={}){
  if(!ADDRESS.test(address)||!HASH.test(hash))throw Error('Invalid deploy evidence identifiers');
  if(!tx||typeof tx!=='object')throw Error('No transaction response');
  const observedHash=String(tx.hash||tx.transaction_hash||tx.tx_hash||'');
  if(observedHash && observedHash.toLowerCase()!==hash.toLowerCase()){
    return {result:'WRONG_TRANSACTION_HASH',requestedHash:hash};
  }
  const status=String(tx.statusName||tx.status||'UNKNOWN').toUpperCase();
  const execution=normalizedExecution(tx);
  const candidates=[tx.recipient,tx.to,tx.contractAddress,tx.contract_address,tx.created_contract_address,tx.createdContractAddress]
    .filter(value=>typeof value==='string'&&ADDRESS.test(value))
    .map(value=>value.toLowerCase());
  const contractAddressStatus=candidates.includes(address.toLowerCase())?'MATCHED':
    candidates.length?'NOT_MATCHED':'NOT_EXPOSED';
  const result=status==='FINALIZED'&&execution==='SUCCESS'
    ?contractAddressStatus==='MATCHED'?'FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED':
      contractAddressStatus==='NOT_MATCHED'?'FINALIZED_SUCCESS_ADDRESS_CONFLICT':
      'FINALIZED_GENVM_SUCCESS_ADDRESS_UNVERIFIED'
    :status==='FINALIZED'&&execution==='ERROR'?'FINALIZED_EXECUTION_ERROR':
      status==='FINALIZED'?'FINALIZED_EXECUTION_UNCONFIRMED':
      'TRANSACTION_NOT_FINALIZED_OR_UNAVAILABLE';
  return {result,requestedHash:hash,expectedAddress:address,chainId:61999,
    status,execution,contractAddressStatus,
    consensusAcceptedUnverified:true,
    sourceMatchesUnverified:true,
    note:'Read-only SDK status is not a source-code match, immutable contract ABI check, or adjudication evidence.'};
}
export async function inspectDeployTransaction({getTransaction,hash=PAYJURY_DEPLOY_TX,address=PAYJURY_ADDRESS}={}){
  if(!HASH.test(hash)||!ADDRESS.test(address))throw Error('Invalid deploy identifiers');
  if(typeof getTransaction!=='function')throw Error('A read-only transaction getter is required');
  const tx=await getTransaction({hash});
  return summarizeDeployTransaction(tx,{hash,address});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const hash=process.env.PAYJURY_DEPLOY_TX_HASH||PAYJURY_DEPLOY_TX;
  const address=process.env.GENLAYER_CONTRACT_ADDRESS||PAYJURY_ADDRESS;
  if(studionet.id!==61999){
    console.error('PAYJURY_DEPLOY_INSPECT_UNVERIFIED: wrong chain');
    process.exit(2);
  }
  try{
    // Never pass in a funded user account or use wallet transaction methods.
    const client=createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
    const result=await inspectDeployTransaction({hash,address,
      getTransaction:params=>client.getTransaction(params)});
    console.log('PAYJURY_DEPLOY_TX_READ_ONLY',JSON.stringify(result));
    if(result.result!=='FINALIZED_GENVM_SUCCESS_ADDRESS_MATCHED')process.exitCode=2;
  }catch(error){
    const code=Number(error?.code??error?.cause?.code);
    const httpStatus=Number(error?.response?.status);
    console.error('PAYJURY_DEPLOY_INSPECT_UNVERIFIED',JSON.stringify({
      reason:'RPC_LOOKUP_UNCONFIRMED',rpcCode:Number.isSafeInteger(code)&&code!==0?code:null,
      httpStatus:Number.isInteger(httpStatus)&&httpStatus>=100&&httpStatus<=599?httpStatus:null,
      signedTransactions:0,
      note:'Inspect original finalized deploy transaction directly in official GenLayer Explorer. Do not redeploy based on this read failure.'
    }));
    process.exitCode=2;
  }
}
