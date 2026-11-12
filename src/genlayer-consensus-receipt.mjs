// Strict read-only check of the original GenLayer AI transaction's consensus
// receipt. The genlayer-js Studio adapter omits consensus result from
// getTransaction, so we query the public canonical node RPC directly.
// This never signs, appeals, resubmits or computes a verdict.
export const ORIGINAL_AI_TX='0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510';
const PAYER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
const CONTRACT='0x0a6171c6a580c58d999a251436ce7c63ffC3dc31'.toLowerCase();
const RPC='https://studio.genlayer.com/api';
function code(value){
  if(typeof value==='number'&&Number.isSafeInteger(value))return value;
  if(typeof value==='string'&&/^(0x[0-9a-f]+|[0-9]+)$/i.test(value))return Number(BigInt(value));
  return -1;
}
export async function verifyOriginalAiConsensus({hash=ORIGINAL_AI_TX,fetchImpl=fetch}={}){
  if(hash!==ORIGINAL_AI_TX)throw Error('Only approved original AI transaction can be inspected');
  const response=await fetchImpl(RPC,{
    method:'POST',redirect:'error',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'gen_getTransactionReceipt',params:[{txId:hash}]}),
    signal:AbortSignal.timeout(8500)
  });
  if(!response.ok)throw Error('GenLayer receipt RPC unavailable');
  const body=await response.json();
  if(body?.error||!body?.result||typeof body.result!=='object')
    throw Error('GenLayer receipt RPC did not return a consensus record');
  const tx=body.result;
  if(String(tx.id||'').toLowerCase()!==hash||
     String(tx.txOrigin||'').toLowerCase()!==PAYER||
     String(tx.recipient||'').toLowerCase()!==CONTRACT)
    throw Error('GenLayer receipt identity mismatch');
  const status=code(tx.status),consensus=code(tx.result);
  return {
    hash,finalized:status===7,consensusResult:consensus===5?'NO_MAJORITY':
      consensus===1?'MAJORITY_AGREE':consensus===2?'MAJORITY_DISAGREE':'UNKNOWN',
    statusCode:status,consensusCode:consensus,
    originalPayer:PAYER,contract:CONTRACT,
    readOnly:true,source:'gen_getTransactionReceipt'
  };
}
