// PAYJURY V2 on-chain read diagnostic for the already-paid, prepared NEW V2 case.
// READ ONLY. Does not create account keys used for signing, issue GenLayer writes,
// authorize any payment, file a case, or adjudicate it.
import {createClient,createAccount} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

export const REFERENCE=Object.freeze({
  contract:'0x0a6171C6a580c58d999a251436CE7c63FFc3dc31',
  caseId:'pj_9f2276fd1904120b16d5f5b6ea5f7a2b',
  network:'eip155:84532',
  txHash:'0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2',
  asset:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  payer:'0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb',
  payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  amount:'10000'
});
const methods=r=>[
  {method:'version',args:[]},
  {method:'can_file_for',args:[r.payer,r.network,r.txHash,r.payer]},
  {method:'filing_status',args:[
    r.caseId,r.network,r.txHash,r.asset,r.payer,r.payee,r.amount,r.payer]},
  {method:'get_case',args:[r.caseId]}
];
const safeString=v=>String(v??'').replace(/[\r\n\t\x00-\x1f]/g,' ').replace(/0x[0-9a-fA-F]{130,}/g,'[REDACTED_HEX]').slice(0,270);
export function classifyReadError(error){
  let p=error;
  const levels=[];
  for(let i=0;i<4&&p&&typeof p==='object';i++,p=p.cause){
    levels.push({
      name:safeString(p.name).slice(0,80),
      code:typeof p.code==='number'||typeof p.code==='string'?safeString(p.code).slice(0,40):null,
      message:safeString(p.shortMessage||p.message||p.details||'No detail')
    });
  }
  return {levels,category:'READ_FAILED_NOT_A_TX'};
}
export async function runReadDiagnosis({reader,reference=REFERENCE}={}){
  if(typeof reader!=='function')throw Error('Reader required');
  const results=[];
  for(const x of methods(reference)){
    try{
      const result=await reader({...x,variant:'latest-final'});
      if(x.method==='version'&&result!=='PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1')
        throw Error('V2 version mismatch');
      if(x.method==='can_file_for'&&typeof result!=='boolean')
        throw Error('Authorization did not return a boolean');
      if(x.method==='filing_status'&&!['NOT_AUTHORIZED','CASE_EXISTS',
        'TRANSFER_ALREADY_FILED','READY_REQUIRES_BASE_PROOF'].includes(result))
        throw Error('Filing status not recognized');
      results.push({method:x.method,variant:'latest-final',status:'READ_OK',result:x.method==='get_case'&&
        typeof result==='string'&&result.length>750?
        result.slice(0,750)+' [TRUNCATED]':result});
    }catch(err){
      results.push({method:x.method,variant:'latest-final',status:'READ_ERROR',
        error:classifyReadError(err)});
    }
  }
  const status=results.find(x=>x.method==='filing_status');
  // A second READ-ONLY variant is diagnostic only; never use a non-final
  // result to authorize a financial or immutable on-chain filing.
  let nonFinalProbe=null;
  if(status?.status==='READ_ERROR'){
    const probe=methods(reference).find(x=>x.method==='filing_status');
    try{
      const result=await reader({...probe,variant:'latest-nonfinal'});
      nonFinalProbe={method:'filing_status',variant:'latest-nonfinal',
        status:'READ_OK_DIAGNOSTIC_ONLY',result};
    }catch(error){
      nonFinalProbe={method:'filing_status',variant:'latest-nonfinal',
        status:'READ_ERROR',error:classifyReadError(error)};
    }
  }
  const authorization=results.find(x=>x.method==='can_file_for');
  return {
    contract:reference.contract,caseId:reference.caseId,network:reference.network,
    paymentTx:reference.txHash,
    noSignature:true,noWrite:true,noNewPayment:true,
    status:status?.status==='READ_OK'?status.result:'FILING_STATUS_UNVERIFIED',
    payerAuthorized:authorization?.status==='READ_OK'?authorization.result:'UNKNOWN',
    readSnapshot:'LATEST_FINAL',nonFinalProbe,results,
    next:status?.status==='READ_OK'&&status.result==='READY_REQUIRES_BASE_PROOF'?
      'Preflight readable. Confirm payment again before any single wallet-approved file_case.':
      'Do not sign or repay; inspect method-specific read errors, especially filing_status and get_case.'
  };
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
  const address=process.env.GENLAYER_V2_CONTRACT_ADDRESS||REFERENCE.contract;
  if(address.toLowerCase()!==REFERENCE.contract.toLowerCase()){
    console.error('PAYJURY_V2_READ_DIAGNOSTIC',JSON.stringify({
      error:'Expected deployed V2 contract address does not match .env; stopped',
      noSignature:true,noWrite:true,noNewPayment:true
    }));
    process.exitCode=2;
  }else{
    if(studionet.id!==61999)throw Error('Incorrect GenLayer chain');
    const client=createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
    const result=await runReadDiagnosis({
      reader:({method,args,variant})=>client.readContract({
        address, functionName:method,args,
        transactionHashVariant:variant
      })
    });
    console.log('PAYJURY_V2_READ_DIAGNOSTIC',JSON.stringify(result,null,2));
    if(result.status!=='READY_REQUIRES_BASE_PROOF')process.exitCode=2;
  }
}
