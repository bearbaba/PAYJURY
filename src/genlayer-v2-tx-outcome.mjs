// Canonical GenLayer Studio transaction status/GenVM result summary.
// genlayer-js@1.1.8 returns the Studio leader receipt nested under
// consensus_data.leader_receipt, not always as txExecutionResultName.
// This is strictly a READ-ONLY decoder: no signing, retries or inferred verdict.
const toKey=v=>typeof v==='string'?v.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_'):'';
function executionName(name){
  const x=toKey(name);
  if(x==='SUCCESS'||x==='FINISHED_WITH_RETURN'||x==='FINISHEDWITHRETURN')return 'FINISHED_WITH_RETURN';
  if(x==='ERROR'||x==='FAILURE'||x==='FINISHED_WITH_ERROR'||x==='FINISHEDWITHERROR')return 'FINISHED_WITH_ERROR';
  return null;
}
function executionCode(value){
  if(typeof value==='bigint')value=Number(value);
  if(value===1||value==='1')return 'FINISHED_WITH_RETURN';
  if(value===2||value==='2')return 'FINISHED_WITH_ERROR';
  return null;
}
export function summarizeV2ReadOnlyTx(tx,hash){
  const status=toKey(tx?.statusName)||toKey(tx?.status)||'UNKNOWN';
  const leader=tx?.consensus_data?.leader_receipt;
  const receipt=Array.isArray(leader)?leader[0]:(leader&&typeof leader==='object'?leader:null);
  const entries=[
    {source:'txExecutionResultName',value:executionName(tx?.txExecutionResultName)},
    {source:'txExecutionResult',value:executionCode(tx?.txExecutionResult)},
    {source:'leader_receipt.execution_result',value:executionName(receipt?.execution_result)}
  ].filter(entry=>entry.value!==null);
  const unique=[...new Set(entries.map(entry=>entry.value))];
  // Missing AND contradictory outputs both fail closed. Do not equate
  // FINALIZED (consensus) with GenVM SUCCESS (execution).
  const conflict=unique.length>1;
  const execution=unique.length===1?unique[0]:'UNKNOWN';
  const finalized=status==='FINALIZED';
  return {
    hash,status,execution,finalized,
    executionKnown:execution!=='UNKNOWN',
    executionConflict:conflict,
    executionSource:conflict?'CONFLICTING_RECEIPTS':entries.map(e=>e.source).join(',')||'NOT_REPORTED',
    success:finalized&&execution==='FINISHED_WITH_RETURN',
    note:conflict?
      'GenLayer execution receipt sources contradict. No success may be inferred. Preserve original TX and inspect Explorer.':
      execution==='UNKNOWN'?
        'GenLayer execution result not exposed by current SDK/RPC. FINALIZED is not evidence of successful execution. Preserve original TX and verify on-chain case state.':
        'Execution derived from GenLayer tx receipt; confirm persistent V2 case readback separately. No replay or signing performed.'
  };
}
