import {assessV2FilingPreflight,KNOWN_RLP_READ_CODE} from './filing-policy.js';
import {claimFromOneTakePacket,ONE_TAKE_CASE} from './restore-packet.js';
const $=id=>document.getElementById(id);
const NEW_LIVE_SESSION='payjury-v2-web-one-take-20261111';
let freshHostedBlocked=false;
// Presentation, overview and workspace are LAYOUTS, never access-control roles.
// All actual permissions remain enforced by the user's wallet and GenLayer V2.
const VALID_VIEWS=new Set(['overview','workspace','demo']);
function openPayjuryView(requested,{focus=false}={}){
  const view=VALID_VIEWS.has(requested)?requested:'overview';
  document.body.dataset.view=view;
  for(const button of document.querySelectorAll('[data-open-view]')){
    const active=button.dataset.openView===view;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  const url=new URL(location.href);
  if(view==='overview')url.searchParams.delete('view');
  else url.searchParams.set('view',view);
  history.replaceState(null,'',url.pathname+url.search+url.hash);
  if(focus){
    const section=view==='workspace'?$('workflow'):$('case-tracker');
    section?.scrollIntoView({behavior:'smooth',block:'start'});
  }
}
for(const button of document.querySelectorAll('[data-open-view]')){
  button.addEventListener('click',()=>openPayjuryView(button.dataset.openView,{focus:true}));
}
openPayjuryView(new URL(location.href).searchParams.get('view')||'overview');

const form=$('case-form'), network=$('network'), asset=$('asset');
const status=$('case-status'),heading=$('case-heading'),detail=$('case-detail');
let packet=null;
function setWorkflowStage(next){
  const stage=Math.max(1,Math.min(4,Number(next)||1));
  for(const step of document.querySelectorAll('[data-workflow-step]')){
    const n=Number(step.dataset.workflowStep);
    step.classList.toggle('current',n===stage);
    step.classList.toggle('done',n<stage);
    if(n===stage)step.setAttribute('aria-current','step');
    else step.removeAttribute('aria-current');
  }
}
const USDC={
  'eip155:84532':'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  'eip155:8453':'0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913',
};
network.addEventListener('change',()=>{asset.value=USDC[network.value];});
function display(label,title,message,tone) {
  status.textContent=label;status.className='status '+tone;
  heading.textContent=title;detail.textContent=message;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();packet=null;updateV2PreparedPacket(null);
  setWorkflowStage(2);
  $('copy-case').disabled=true;$('read-verdict').disabled=true;
  const button=$('verify-btn');button.disabled=true;
  display('VERIFYING','Checking the Base chain','Reading a real transaction receipt. Nothing is paid or signed.','pending');
  const data=Object.fromEntries(new FormData(form));
  try{
    const res=await fetch('/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    const body=await res.json();
    if(!res.ok)throw Error(body.error||'Payment verification unavailable');
    if(body.status!=='PREPARED_NOT_FILED'||body.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED')
      throw Error('Base settlement evidence was not independently verified');
    packet=body;
    updateV2PreparedPacket(packet);
    setWorkflowStage(3);
    $('track-id').value=packet.caseId;
    $('case-id').textContent=packet.caseId;
    $('verdict').textContent='NOT FILED';
    $('copy-case').disabled=false;$('read-verdict').disabled=false;
    display('TRANSFER VERIFIED','Case prepared — not filed',
      'On-chain USDC Transfer verified with '+packet.settlement.confirmations+' confirmations. This packet still needs an actual GenLayer filing and adjudication.','success');
  } catch(error) {
    setWorkflowStage(2);
    $('case-id').textContent='—';$('verdict').textContent='UNVERIFIED';
    display('NOT VERIFIED','No verified case prepared',
      String(error?.message||'Verification failed').slice(0,200),'error');
  } finally{button.disabled=false;}
});
$('read-verdict').addEventListener('click',async()=>{
  if(!packet)return;
  display('READING GENLAYER','Checking original contract state','A pending or missing case is not a verdict.','pending');
  try{
    const res=await fetch('/api/verdict?caseId='+encodeURIComponent(packet.caseId));
    const body=await res.json();
    if(!res.ok)throw Error(body.error||'GenLayer read unavailable');
    if(body.caseId!==packet.caseId)throw Error('Case identity mismatch');
    $('verdict').textContent=body.verdict||'PENDING';
    display(body.status==='DECIDED'?'CONTRACT READBACK':'CASE FILED',
      body.status==='DECIDED'?'GenLayer verdict observed':'Adjudication pending',
      body.status==='DECIDED'?
        'On-chain readback: '+body.verdict+'. '+String(body.reason||'')+' Transaction finality still requires separate inspection.':
        'Contract has a filed case, but no final verdict is available.','success');
  } catch(error) {
    $('verdict').textContent='UNVERIFIED';
    display('READBACK UNVERIFIED','No final GenLayer proof',String(error?.message||'Unavailable'),'error');
  }
});
$('copy-case').addEventListener('click',async()=>{
  if(!packet)return;
  try{
    await navigator.clipboard.writeText(JSON.stringify(packet,null,2));
    const button=$('copy-case');button.textContent='Copied';setTimeout(()=>button.textContent='Copy packet',1500);
  }catch{display('COPY FAILED','Clipboard unavailable','Copy the case JSON using a supported browser clipboard permission.','error');}
});
// Recovery is read-only and restricted to the ONE already-paid testnet
// session. The saved JSON is untrusted; the backend independently verifies
// the Base receipt and recomputes the case ID before enabling any wallet UI.
$('v2-import-verify').addEventListener('click',async()=>{
  const button=$('v2-import-verify'),message=$('v2-import-status');
  button.disabled=true;
  message.textContent='Rechecking original Base USDC transfer and case identity. No payment or wallet signature.';
  try{
    const raw=$('v2-import-packet').value;
    if(raw.length>16000)throw Error('Saved packet too large');
    const saved=JSON.parse(raw);
    const claim=claimFromOneTakePacket(saved);
    const res=await fetch('/api/verify',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(claim)});
    const checked=await res.json();
    if(!res.ok||checked.caseId!==ONE_TAKE_CASE||
       checked.status!=='PREPARED_NOT_FILED'||
       checked.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED')
      throw Error('Original paid case could not be independently re-verified');
    for(const [key,value] of Object.entries(claim))
      form.elements.namedItem(key).value=value;
    form.elements.namedItem('paymentResponseHeader').value='';
    packet=checked;
    updateV2PreparedPacket(checked);
    setWorkflowStage(3);
    $('track-id').value=checked.caseId;
    $('track-version').value='v2';
    $('case-id').textContent=checked.caseId;
    $('verdict').textContent='NOT FILED';
    $('copy-case').disabled=false;
    $('read-verdict').disabled=true;
    display('TRANSFER VERIFIED','Original paid case restored — not filed',
      'Independent Base receipt and deterministic case identity verified again. No payment or GenLayer transaction was submitted.','success');
    message.textContent='RESTORED: '+checked.caseId+'. Connect the SAME payer wallet on Studionet 61999; review filing preflight before any write.';
  }catch(error){
    message.textContent='Recovery blocked: '+String(error?.message||'Invalid saved packet').slice(0,160)+
      '. Never repeat the x402 payment.';
  }finally{button.disabled=false;}
});
fetch('/api/status').then(res=>res.json()).then(data=>{
  const freshPanel=$('v2-fresh-purchase-panel');
  const historicRestore=$('v2-case-restore-panel');
  if(data.hostedReadOnly){
    if(freshPanel)freshPanel.hidden=true;
    if(historicRestore)historicRestore.hidden=true;
  }else if(data.newPaymentEnabled){
    if(freshPanel)freshPanel.hidden=false;
    if(historicRestore)historicRestore.hidden=true;
    // A separate read-only status check prevents even showing the
    // pay button once a globally reserved demo session is spent.
    freshHostedBlocked=true;
    refreshFreshButtons();
    fetch('/api/v2/x402/session',{cache:'no-store'})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok||data.readOnly!==true||data.session!==NEW_LIVE_SESSION)
          throw Error('Cannot verify global payment lock');
        return data;
      }).then(session=>{
        freshHostedBlocked=session.locked!==false;
        if(freshHostedBlocked)
          freshMessage('One-shot hosted session already reserved. Never pay again; inspect the original wallet/chain evidence.');
        else
          freshMessage('ONE LIVE TESTNET CHECKOUT AVAILABLE. Review the 0.01 USDC quote first. The wallet must authorize every payment.');
        refreshFreshButtons();
      }).catch(()=>{
        freshHostedBlocked=true;
        freshMessage('Cannot verify durable payment lock. Checkout blocked; no signature requested.');
        refreshFreshButtons();
      });
  }
  if(!data.paymentVerifierConfigured){
    display('CONFIGURATION REQUIRED','Base RPC not configured',
      'Set BASE_RPC_URL on the local server to verify real token transfers. No demo evidence is fabricated.','pending');
  }
}).catch(()=>{display('OFFLINE','Verification service unavailable','Check the PAYJURY local server before proceeding.','error');});


const CASE_ID=/^pj_[0-9a-f]{32}$/;
let lastVerifiedTrack=null;
function proofState({phase='reading',title='Reading on-chain decision…',subtitle='Rechecking original evidence'}={}){
  const cover=$('track-outcome');
  cover.textContent=title;
  $('track-outcome-subtitle').textContent=subtitle;
  const signal=$('track-signal');
  signal.dataset.phase=phase;
  signal.textContent=phase==='complete'?'VERIFIED READBACK':phase==='partial'?'PARTIAL READBACK':
    phase==='error'?'READ UNAVAILABLE':'LIVE QUERY';
}
$('track-copy-id').addEventListener('click',async()=>{
  if(!lastVerifiedTrack)return;
  const button=$('track-copy-id');
  try{
    await navigator.clipboard.writeText(lastVerifiedTrack.caseId);
    button.textContent='Copied ✓';
    setTimeout(()=>button.textContent='Copy Case ID',1400);
  }catch{
    $('track-message').textContent='Clipboard permission unavailable. Select the Case ID above to copy it.';
  }
});
$('track-export').addEventListener('click',()=>{
  if(!lastVerifiedTrack)return;
  const record=lastVerifiedTrack;
  const summary={
    product:'PAYJURY V2',source:'Live readback; NOT a signed attestation',
    caseId:record.caseId,contractVersion:record.contractVersion,
    contractAddress:record.contractAddress,caseStatus:record.caseStatus,
    verdict:record.caseStatus==='DECIDED'?record.verdict:null,
    reason:record.caseStatus==='DECIDED'?record.reason:null,
    payment:{network:record.network,txHash:record.txHash,payer:record.payer,
      payee:record.payee,amountAtomic:record.amountAtomic,asset:record.asset,
      settlement:record.settlement},
    identityBinding:record.identityBinding,
    disclaimer:'This readback does not independently prove GenLayer TX finality, HTTP payload correctness, or refund rights.'
  };
  const blob=new Blob([JSON.stringify(summary,null,2)],{type:'application/json'});
  const downloadUrl=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=downloadUrl;
  link.download='payjury-'+record.caseId+'.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(downloadUrl),1500);
});
$('track-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const id=$('track-id').value.trim();
  const message=$('track-message'),button=$('track-button');
  lastVerifiedTrack=null;
  $('track-copy-id').disabled=true;
  $('track-export').disabled=true;
  $('track-results').hidden=true;
  $('track-base-link').hidden=true;
  proofState({phase:'reading',title:'Verifying original evidence…',
    subtitle:'Fresh GenLayer read and independent Base settlement check'});
  $('proof-stage-payment').textContent='Checking Base receipt';
  $('proof-stage-case').textContent='Reading case V2';
  $('proof-stage-decision').textContent='Reading AI verdict';
  if(!CASE_ID.test(id)){message.textContent='Invalid case ID. Use pj_ followed by 32 lowercase hex characters.';return;}
  button.disabled=true;
  message.textContent='Reading GenLayer and independently checking the Base receipt. No signing or payment.';
  try{
    const version=$('track-version').value;
    const res=await fetch('/api/case?version='+encodeURIComponent(version)+'&caseId='+encodeURIComponent(id));
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'Case readback unavailable');
    if(data.caseId!==id||!['FILED','DECIDED'].includes(data.caseStatus))throw Error('Unexpected case readback');
    if(data.contractVersion!==version)throw Error('Contract version mismatch');
    lastVerifiedTrack=data;
    $('track-copy-id').disabled=false;
    const paymentVerified=data.settlement?.status==='BASE_USDC_TRANSFER_VERIFIED';
    const idMatched=data.identityBinding==='DETERMINISTIC_ID_MATCHED';
    const decided=data.caseStatus==='DECIDED';
    const consistent=paymentVerified&&idMatched;
    proofState({
      phase:consistent?'complete':'partial',
      title:decided?String(data.verdict||'DECIDED'):'FILED · awaiting decision',
      subtitle:decided?'Recorded AI verdict · '+version.toUpperCase()+' GenLayer readback':
        'Case found on GenLayer · no AI verdict recorded yet'
    });
    $('proof-stage-payment').textContent=paymentVerified?'USDC transfer verified':'Transfer not verified';
    $('proof-stage-case').textContent=idMatched?'Canonical ID matched':'Case identity mismatch';
    $('proof-stage-decision').textContent=decided?'Recorded: '+String(data.verdict):'Decision pending';
    $('track-export').disabled=false;
    $('track-status').textContent=data.caseStatus;
    $('track-verdict').textContent=data.caseStatus==='DECIDED'?data.verdict:'PENDING';
    $('track-payment').textContent=data.settlement?.status==='BASE_USDC_TRANSFER_VERIFIED'?
      'TRANSFER VERIFIED':'NOT VERIFIED';
    $('track-binding').textContent=data.identityBinding==='DETERMINISTIC_ID_MATCHED'?
      'ID MATCHED':'NOT MATCHED';
    $('track-reason').textContent=data.caseStatus==='DECIDED'?
      'GenLayer reason: '+String(data.reason||'Unavailable'):'This case is filed; no decision yet.';
    const domain=data.network==='eip155:84532'?'sepolia.basescan.org':
      data.network==='eip155:8453'?'basescan.org':null;
    if(domain&&/^0x[0-9a-f]{64}$/.test(data.txHash||'')){
      $('track-base-link').href='https://'+domain+'/tx/'+data.txHash;
      $('track-base-link').hidden=false;
    }
    if(WALLET_ADDR.test(data.contractAddress||'')){
      $('track-genlayer-link').href='https://explorer-studio.genlayer.com/address/'+data.contractAddress;
      $('track-genlayer-link').textContent='View GenLayer '+version.toUpperCase()+' contract ↗';
    }
    $('track-results').hidden=false;
    if(version==='v2')updateV2TrackedCase(data);
    const flags=[];
    if(data.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED')
      flags.push('Base receipt could not be independently verified at this time.');
    if(data.identityBinding!=='DETERMINISTIC_ID_MATCHED')
      flags.push('The filed ID does not match the deterministic hash of the submitted case fields.');
    message.textContent=flags.length?flags.join(' '):
      'On-chain case read and Base transfer independently checked. Review the AI decision scope below.';
  }catch(error){
    proofState({phase:'error',title:'Live proof unavailable',
      subtitle:'No result is assumed. Refresh when both networks are reachable.'});
    $('proof-stage-payment').textContent='Read unavailable';
    $('proof-stage-case').textContent='Read unavailable';
    $('proof-stage-decision').textContent='Read unavailable';
    message.textContent=String(error?.message||'Case lookup unavailable').slice(0,220);
  }finally{button.disabled=false;}
});
const VERIFIED_V2_CASE='pj_9f2276fd1904120b16d5f5b6ea5f7a2b';
$('track-example').addEventListener('click',()=>{
  $('track-version').value='v2';
  $('track-id').value=VERIFIED_V2_CASE;
  $('track-form').requestSubmit();
});
// The landing page is a proof-first demo. This is one read-only lookup,
// never a payment, a wallet signature or a GenLayer write.
queueMicrotask(()=>{
  if(!$('track-id').value)$('track-id').value=VERIFIED_V2_CASE;
  $('track-form').requestSubmit();
});


/* Signed GenLayer V2 filing is strictly opt-in; V1 history never signs. */
const SECOND_AI_CASE='pj_6575f7352b41602401caf317ce30f86b';
const SECOND_AI_PAYMENT='0x8f90716a44d142be61d042929b4f7fd588711deb805a3e25df7128254f5f24bd';
const FIRST_AI_ATTEMPT='0x1104d521fd6ad7e5bd38254034bb93ca303dd3ac9097150ea9792f21b1b30510';
const V1_HISTORIC_TX='0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5';
const WALLET_ADDR=/^0x[0-9a-f]{40}$/i;
let v2Address=null,v2Wallet=null,v2Sdk=null,verifiedPacket=null,
  trackedCaseV2=null, v2Busy=false;
function v2Message(message){$('v2-status').textContent=message;}
function v2Controls(){
  const enabled=Boolean(v2Address);
  $('v2-connect').disabled=!enabled||v2Busy;
  const signed=enabled&&Boolean(v2Wallet)&&!v2Busy;
  const decidedHistorical=verifiedPacket?.caseId===VERIFIED_V2_CASE;
  const alreadyFiled=Boolean(trackedCaseV2&&trackedCaseV2.caseId===verifiedPacket?.caseId&&
    ['FILED','DECIDED'].includes(trackedCaseV2.caseStatus));
  const prepared=Boolean(verifiedPacket)&&verifiedPacket.txHash!==V1_HISTORIC_TX&&!decidedHistorical;
  $('v2-file').disabled=!signed||!prepared||alreadyFiled;
  $('v2-authorize').disabled=!signed||!prepared||v2Wallet.toLowerCase()!==verifiedPacket.payer.toLowerCase();
  $('v2-revoke').disabled=$('v2-authorize').disabled;
  const pending=trackedCaseV2&&trackedCaseV2.caseStatus==='FILED'&&
    trackedCaseV2.identityBinding==='DETERMINISTIC_ID_MATCHED'&&
    trackedCaseV2.settlement?.status==='BASE_USDC_TRANSFER_VERIFIED'&&
    [trackedCaseV2.claimant?.toLowerCase(),trackedCaseV2.payer?.toLowerCase()].includes(v2Wallet?.toLowerCase());
  // A submitted decision stays one-shot even if chain readback still says FILED.
  // Only inspect its recorded TX; never offer a second signing.
  const attemptedDecision=Boolean(trackedCaseV2?.caseId&&
    signedLock(trackedCaseV2.caseId,'adjudicate_case'));
  $('v2-adjudicate').disabled=!signed||!pending||attemptedDecision;
  const p=verifiedPacket;
  const prior=p?.caseId===SECOND_AI_CASE&&signedLock(p.caseId,'adjudicate_case');
  const second=p?.caseId===SECOND_AI_CASE&&signedLock(p.caseId,'adjudicate_case_recovery');
  // Recovery is never offered without the original local signed history.
  const canRecover=signed&&p?.caseId===SECOND_AI_CASE&&
    p.txHash===SECOND_AI_PAYMENT&&
    p.settlement?.result==='BASE_USDC_TRANSFER_VERIFIED'&&
    v2Wallet.toLowerCase()===p.payer.toLowerCase()&&
    prior?.hash?.toLowerCase()===FIRST_AI_ATTEMPT&&!second;
  $('v2-adjudicate-recovery').disabled=!canRecover;
  const currentCase=trackedCaseV2?.caseId||verifiedPacket?.caseId;
  const delegate=$('v2-delegate').value.trim().toLowerCase();
  const delegationKey=verifiedPacket&&WALLET_ADDR.test(delegate)?
    verifiedPacket.payer.toLowerCase()+':'+verifiedPacket.network+':'+verifiedPacket.txHash+':delegate:'+delegate:null;
  $('v2-resume').disabled=!signed||!(
    (currentCase&&signedLock(currentCase,'adjudicate_case_recovery')?.hash)||
    (currentCase&&signedLock(currentCase,'file_case')?.hash)||
    (currentCase&&signedLock(currentCase,'adjudicate_case')?.hash)||
    (delegationKey&&signedLock(delegationKey,'set_delegate')?.hash)
  );
}
function updateV2PreparedPacket(next){
  verifiedPacket=next;
  trackedCaseV2=null;
  $('v2-overview').hidden=true;
  if(!next){
    v2Message(v2Address?'Payment or evidence changed. Verify again before any wallet action.':
      'V2 signing is not available. Prepare evidence read-only or track a completed V1 case.');
  }
  if(next?.settlement?.result==='BASE_USDC_TRANSFER_VERIFIED'){
    $('v2-overview').hidden=false;
    $('v2-case').textContent=next.caseId;
    $('v2-payment').textContent=next.amountAtomic+' atomic USDC · '+next.network;
    v2Message(next.txHash===V1_HISTORIC_TX?
      'This historic payment was already filed and decided in V1. Do not file it again.':
      next.caseId===VERIFIED_V2_CASE?
        'The completed V2 case must be tracked read-only. Filing and adjudication are disabled for this case.':
      v2Address?'Base payment independently verified. Connect a GenLayer wallet and review filing rights.':
      'Evidence is prepared, but V2 has not been deployed and verified. Signing stays disabled.');
  }
  v2Controls();
}
function updateV2TrackedCase(data){
  trackedCaseV2=data;
  setWorkflowStage(data.caseStatus==='FILED'||data.caseStatus==='DECIDED'?4:3);
  if(v2Address&&data.caseStatus==='FILED'){
    v2Message('V2 case is FILED. The claimant or payer can request a GenLayer AI decision.');
  } else if(data.caseStatus==='DECIDED'){
    v2Message('V2 verdict already persisted. No further adjudication transaction is necessary.');
  }
  v2Controls();
}
function lockKey(caseId,method){
  return 'payjury:v2:'+v2Address?.toLowerCase()+':'+caseId+':'+method;
}
function signedLock(caseId,method){
  try{
    const stored=globalThis.localStorage?.getItem(lockKey(caseId,method));
    return stored?JSON.parse(stored):null;
  }catch{return {state:'STORAGE_UNAVAILABLE'};}
}
function writeLock(caseId,method,value){
  globalThis.localStorage.setItem(lockKey(caseId,method),JSON.stringify(value));
}
async function getV2Sdk(){
  if(!v2Sdk)v2Sdk=await import('/studio-wallet.bundle.js');
  return v2Sdk;
}
async function requireGenuineV2Interface(sdk){
  if(!v2Address)throw Error('V2 contract not configured');
  const marker=await sdk.readV2Contract(v2Address,'version',[]);
  if(marker!=='PAYJURY_V2_PAYMENT_SCOPED_AUTH_V1')
    throw Error('Contract V2 identity mismatch. Signing blocked; verify deployment address and source.');
}

async function refreshRecordedTransaction(caseId,method,hash){
  const sdk=await getV2Sdk();
  const state=await sdk.checkV2Transaction(hash);
  if(!state.finalized){
    v2Message(method+' submitted · '+hash+'. Current GenLayer state: '+
      state.status+'. No second signing is allowed. Refresh recorded TX for updates.');
    return false;
  }
  if(!state.success){
    if(state.consensusResult==='NO_MAJORITY'){
      v2Message('Original GenLayer decision reached NO_MAJORITY: no verdict was stored. Review the existing case and the guarded recovery option; do not repeat the old TX.');
      return false;
    }
    // SDK v1.1.8 Studio getTransaction can omit top-level execution metadata.
    // FINALIZED / UNKNOWN does NOT mean the contract reverted.
    if(state.execution==='UNKNOWN'||state.executionConflict===true){
      v2Message('TX FINALIZED, but GenVM result is '+state.execution+
        '. Checking existing V2 contract state READ ONLY; no signing or retry.');
      if(method==='file_case'||method==='adjudicate_case')
        return refreshV2Readback(caseId,method,{executionUnverified:true});
      v2Message('TX FINALIZED, but delegate execution is unverified. Preserve '+hash+
        ' and inspect Explorer; never sign again.');
      return false;
    }
    v2Message('GenLayer TX FINALIZED with execution '+state.execution+
      ': '+hash+'. Inspect Explorer and preserve the one-shot lock. Do not resend.');
    return false;
  }
  if(method==='set_delegate'){
    const details=signedLock(caseId,method);
    const {payer,network,txHash,delegate,enabled}=details?.delegation||{};
    if(!WALLET_ADDR.test(payer||'')||!WALLET_ADDR.test(delegate||'')){
      v2Message('Delegation transaction FINALIZED / SUCCESS, but permission metadata missing. Preserve hash.');
      return false;
    }
    const authorized=await sdk.readV2Contract(v2Address,'can_file_for',[payer,network,txHash,delegate]);
    if(authorized!==enabled){
      v2Message('Delegation TX finalized; permission readback not yet consistent. Preserve hash.');
      return false;
    }
    v2Message('Delegation '+(enabled?'authorized':'revoked')+' and independently read from V2. TX '+hash);
    return true;
  }
  v2Message('GenLayer TX FINALIZED / SUCCESS: '+hash+'. Checking contract readback…');
  return refreshV2Readback(caseId,method,{executionUnverified:false});
}
async function refreshV2Readback(caseId,method,{executionUnverified=false}={}){
  try{
    const response=await fetch('/api/case?version=v2&caseId='+encodeURIComponent(caseId),{
      method:'GET',cache:'no-store'
    });
    if(!response.ok)throw Error('GenLayer case readback not yet available');
    const result=await response.json();
    const p=verifiedPacket;
    if(result.caseId!==caseId||result.contractVersion!=='v2'||
       result.contractAddress?.toLowerCase()!==v2Address?.toLowerCase()||
       result.identityBinding!=='DETERMINISTIC_ID_MATCHED'||
       result.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED'||
       !p||p.caseId!==caseId||
       result.txHash!==p.txHash||result.network!==p.network||
       result.payer!==p.payer||result.payee!==p.payee||
       result.amountAtomic!==p.amountAtomic)
      throw Error('On-chain case identity or Base receipt binding mismatch');
    if(method==='adjudicate_case'&&result.caseStatus!=='DECIDED')
      throw Error('V2 decision not persisted');
    if(method==='file_case'&&!['FILED','DECIDED'].includes(result.caseStatus))
      throw Error('V2 filing not persisted');
    updateV2TrackedCase(result);
    $('track-version').value='v2';
    $('track-id').value=caseId;
    if(executionUnverified){
      v2Message(result.caseStatus==='DECIDED'?
        'V2 DECIDED confirmed by independent contract readback. Original TX execution metadata remains unavailable. Verdict '+result.verdict+'.':
        'V2 FILED confirmed by independent GenLayer contract readback and Base USDC receipt. Original TX execution metadata remains unavailable; preserve its hash.');
    }else{
      v2Message(result.caseStatus==='DECIDED'?
        'AI verdict confirmed from V2: '+result.verdict+'. No more signing required.':
        'V2 filing confirmed on-chain. Case status FILED; choose Request AI decision after reviewing evidence.');
    }
    return true;
  }catch{
    v2Message('GenLayer TX is finalized, but the V2 case is not yet independently readable as '+
      (method==='adjudicate_case'?'DECIDED':'FILED')+
      '. Preserve original hash; use Refresh recorded TX. Never sign or pay again.');
    return false;
  }
}
async function monitorSubmitted(caseId,method,hash){
  for(let step=0;step<12;step++){
    let success=false;
    try{success=await refreshRecordedTransaction(caseId,method,hash);}
    catch{
      v2Message('GenLayer read unavailable; submitted TX '+hash+' remains locked. Never sign the same action again.');
    }
    if(success)return;
    if(step<11)await new Promise(resolve=>setTimeout(resolve,2500));
  }
}
async function v2Write(method,caseId,args,metadata=null,lockMethod=method){
  if(!v2Address||!v2Wallet||v2Busy)throw Error('V2 contract and connected wallet required');
  const existing=signedLock(caseId,method);
  const targetLock=lockMethod===method?existing:signedLock(caseId,lockMethod);
  if(targetLock)throw Error(targetLock.hash?
    'This action already has a TX: '+existing.hash+'. Use Refresh recorded TX; do not sign again.':
    'An earlier write attempt has an unknown outcome. Review wallet activity before any resubmission.');
  const sdk=await getV2Sdk();
  v2Busy=true;v2Controls();
  let writeAttempted=false;
  try{
    // GenLayerJS 1.1.8 has no fee estimator. Check the exact wallet,
    // Studionet chain and write capability before locking or signing.
    v2Message('Checking '+method+' wallet, network and SDK compatibility. No transaction signed yet.');
    const prepared=await sdk.preflightV2Write(v2Address,method,args);
    // Lock only AFTER the unsigned preflight and BEFORE writeContract.
    // A missing/invalid hash must never result in an automatic retry.
    writeLock(caseId,lockMethod,{state:'ATTEMPTED_UNKNOWN',delegation:metadata,when:new Date().toISOString()});
    writeAttempted=true;
    const hash=await sdk.sendV2Write(v2Address,method,args,prepared);
    writeLock(caseId,lockMethod,{state:'SUBMITTED',hash,delegation:metadata,when:new Date().toISOString()});
    v2Message(method+' submitted: '+hash+'. Checking GenLayer finality without resending.');
    await monitorSubmitted(caseId,method,hash);
  }catch(error){
    if(!writeAttempted){
      v2Message('Wallet / SDK preflight failed BEFORE any signature. No transaction or one-shot write lock was created. '+
        String(error?.shortMessage||error?.message||'GenLayer preflight unavailable').slice(0,160));
      return;
    }
    const explicitlyRejected=error?.code===4001||
      error?.cause?.code===4001||
      /user rejected|user denied|user cancelled/i.test(String(error?.shortMessage||error?.message||''));
    if(explicitlyRejected){
      // Explicit user rejection means the wallet did not authorize broadcast.
      globalThis.localStorage.removeItem(lockKey(caseId,lockMethod));
      v2Message('Wallet rejected the signing request. No new GenLayer transaction was authorized.');
    }else{
      v2Message('Signing/confirmation outcome uncertain: '+
        String(error?.shortMessage||error?.message||'unknown').slice(0,120)+
        '. Write remains locked. Check wallet activity and recorded transaction first.');
    }
  }finally{v2Busy=false;v2Controls();}
}
fetch('/api/status').then(r=>r.json()).then(data=>{
  const a=String(data.genlayerV2ContractAddress||'');
  if(data.v2FilingEnabled&&WALLET_ADDR.test(a)&&
    a.toLowerCase()!=='0xd57a04c3cc304ab30c9435a9ae34a840802f11c8'){
    v2Address=a;
    $('deployment-message').textContent='V2 address configured. Contract identity must be verified before wallet signing. V1 cases remain read-only.';
    $('v2-mode').textContent='V2 · Wallet approvals';
    $('v2-explanation').textContent='Verified Base transfer first, then connect your own GenLayer Studionet wallet. Direct payer filing or payer-approved delegation only; each write requires your confirmation.';
    v2Message('V2 contract is configured. This is NOT proof of deployment or security audit; verify the actual contract source and address before signing.');
  }else{
    $('deployment-message').textContent='V2 not deployed — prepare evidence safely; filing and wallet approvals remain locked. V1 cases are available below.';
    $('v2-mode').textContent='V2 · Not deployed';
    $('v2-explanation').textContent='PAYJURY V2 adds payer/delegate authorization. Until its new address is separately deployed and verified, signing stays disabled; the completed V1 case remains readable above.';
  }
  v2Controls();
}).catch(()=>{
  $('deployment-message').textContent='Cannot check V2 availability. Signing remains disabled; retry when the server is reachable.';
  v2Message('Cannot verify V2 configuration. All GenLayer signing controls stay disabled.');
});
$('v2-connect').addEventListener('click',async()=>{
  $('v2-connect').disabled=true;
  v2Wallet=null;
  try{
    v2Message('Step 1/2 · Checking V2 contract identity through PAYJURY read-only service. No wallet signature.');
    const sdk=await getV2Sdk();
    await requireGenuineV2Interface(sdk);
    v2Message('Step 2/2 · Contract confirmed. Requesting wallet account and checking Studionet 61999 (no transaction).');
    const address=await sdk.connectGenLayerWallet();
    v2Wallet=address;
    $('v2-signer').textContent=address;
    v2Message('Connected '+address+' on GenLayer Studionet 61999. No transaction was sent. Filing still requires exact payer authorization and separate confirmation.');
  }catch(error){
    v2Wallet=null;
    v2Message('Connection not completed: '+String(error?.shortMessage||error?.message||'Wallet unavailable').slice(0,230)+
      ' No transaction was submitted.');
  }finally{v2Controls();}
});
$('v2-file').addEventListener('click',async()=>{
  if(!verifiedPacket||!v2Address||!v2Wallet)return;
  const p=verifiedPacket;
  if(p.txHash===V1_HISTORIC_TX){
    v2Message('Historic V1 paid case is already decided. No repeat filing.');return;
  }
  if(p.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED'){
    v2Message('Independent Base payment verification required.');return;
  }
  try{
    const body=Object.fromEntries(new FormData(form));
    const fresh=await fetch('/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    if(!fresh.ok)throw Error('Fresh Base verification unavailable. Signing blocked.');
    const again=await fresh.json();
    if(again.caseId!==p.caseId||again.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED')
      throw Error('Case evidence changed since verification. Verify again.');
    const sdk=await getV2Sdk();
    await requireGenuineV2Interface(sdk);
    let state=null,readErrorCode=null,payerRights=null;
    try{
      state=await sdk.readV2Contract(v2Address,'filing_status',[
        p.caseId,p.network,p.txHash,p.token,p.payer,p.payee,p.amountAtomic,v2Wallet
      ]);
    }catch(error){
      if(error?.code!==KNOWN_RLP_READ_CODE)throw error;
      readErrorCode=error.code;
      // An 8-arg read fails in upstream Studio's RLP decoder, but the
      // shorter independent payer rights read still works.
      payerRights=await sdk.readV2Contract(v2Address,'can_file_for',[
        p.payer,p.network,p.txHash,v2Wallet
      ]);
    }
    const policy=assessV2FilingPreflight({
      packet:p,signer:v2Wallet,contract:v2Address,versionConfirmed:true,
      filingStatus:state,readErrorCode,payerRights
    });
    if(!policy.allow)
      throw Error('V2 filing blocked: '+String(state||policy.mode));
    if(policy.warning)v2Message(policy.warning);
    const consent=policy.mode==='KNOWN_UPSTREAM_RLP_RECOVERY'?
      'GENLAYER STUDIO RPC LIMITATION: filing_status could not be read.\n'+
      'The confirmed deployed V2 contract enforces payer authority, canonical case ID and duplicate-transfer rejection ON-CHAIN.\n'+
      'This is not a verified READY state. A rejected TX may incur fees.\n'+
      'You are authorizing ONE file_case transaction only; do not retry if outcome is uncertain.\n'+
      'Case '+p.caseId+'\nPayment '+p.txHash+'\nSigner '+v2Wallet+
      '\nContinue with one signed transaction?':
      'Confirm ONE GenLayer V2 filing for '+p.caseId+
      '\nPayer: '+p.payer+'\nSigner: '+v2Wallet+
      '\nPayment '+p.amountAtomic+' atomic USDC · '+p.network+
      '\nThis does not refund the payment. Approve signing?';
    if(!globalThis.confirm(consent))return;
    await v2Write('file_case',p.caseId,[
      p.caseId,p.network,p.txHash,p.token,p.payer,p.payee,p.amountAtomic,
      p.endpoint,p.terms,p.delivery,p.evidence
    ]);
  }catch(error){v2Message(String(error?.message||'Preflight failed').slice(0,200));}
});
async function authorizeDelegate(enabled){
  if(!v2Wallet||!verifiedPacket||v2Wallet!==verifiedPacket.payer.toLowerCase()){
    v2Message('Only the payer wallet can authorize/revoke a delegate.');return;
  }
  const payer=verifiedPacket.payer.toLowerCase();
  const delegate=$('v2-delegate').value.trim().toLowerCase();
  if(!WALLET_ADDR.test(delegate)||delegate===v2Wallet){
    v2Message('Enter a different valid 0x delegate wallet address.');return;
  }
  const network=verifiedPacket.network,txHash=verifiedPacket.txHash;
  const key=payer+':'+network+':'+txHash+':delegate:'+delegate;
  try{
    const sdk=await getV2Sdk();
    await requireGenuineV2Interface(sdk);
    const permission=await sdk.readV2Contract(v2Address,'can_file_for',[payer,network,txHash,delegate]);
    if(typeof permission!=='boolean')throw Error('Delegation status was not a verified boolean.');
    if(permission===enabled){
      v2Message('Delegation is already '+(enabled?'authorized':'revoked')+'. No transaction needed.');
      return;
    }
    const previous=signedLock(key,'set_delegate');
    if(previous){
      if(!previous.hash)throw Error('Previous permission update has an unknown outcome. Inspect wallet activity.');
      const oldTx=await sdk.checkV2Transaction(previous.hash);
      if(!oldTx.finalized||!oldTx.success)
        throw Error('Previous delegation TX is not confirmed successful. Do not resubmit.');
      // A new opposite transition is valid only after the previous write is
      // FINALIZED / SUCCESS and the current onchain permission proves it is needed.
      globalThis.localStorage.removeItem(lockKey(key,'set_delegate'));
    }
    if(!globalThis.confirm((enabled?'Authorize ':'Revoke ')+delegate+
      ' for V2 filing? This sends a real GenLayer transaction.'))return;
    await v2Write('set_delegate',key,[network,txHash,delegate,enabled],{payer,network,txHash,delegate,enabled});
  }catch(error){v2Message(String(error?.message||'Delegation preflight failed').slice(0,220));}
}
$('v2-authorize').addEventListener('click',()=>authorizeDelegate(true));
$('v2-revoke').addEventListener('click',()=>authorizeDelegate(false));
$('v2-adjudicate').addEventListener('click',async()=>{
  const data=trackedCaseV2;
  if(!data||!v2Wallet||!v2Address||data.caseStatus!=='FILED')return;
  if(![data.claimant?.toLowerCase(),data.payer?.toLowerCase()].includes(v2Wallet))return;
  if(data.identityBinding!=='DETERMINISTIC_ID_MATCHED'||
    data.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED')return;
  try{
    const sdk=await getV2Sdk();
    await requireGenuineV2Interface(sdk);
    let record=await sdk.readV2Contract(v2Address,'get_case',[data.caseId]);
    if(typeof record==='string')record=JSON.parse(record);
    if(record?.status!=='FILED'||record.case_id!==data.caseId)
      throw Error('Case is not FILED. Cannot request another AI decision.');
    if(!globalThis.confirm('Request ONE AI adjudication for '+data.caseId+
      '? This GenLayer write is not a refund.'))return;
    await v2Write('adjudicate_case',data.caseId,[data.caseId]);
  }catch(error){v2Message(String(error?.message||'AI request unavailable').slice(0,200));}
});
// One extra wallet-approved GenLayer attempt. The prior adjudicate_case lock
// and the x402 payment lock remain intact. No automatic retry or fee estimate.
$('v2-adjudicate-recovery').addEventListener('click',async()=>{
  const p=verifiedPacket;
  if(!p||p.caseId!==SECOND_AI_CASE||p.txHash!==SECOND_AI_PAYMENT||
     !v2Wallet||!v2Address||v2Busy||v2Wallet.toLowerCase()!==p.payer.toLowerCase())return;
  const original=signedLock(p.caseId,'adjudicate_case');
  if(original?.hash?.toLowerCase()!==FIRST_AI_ATTEMPT||
     signedLock(p.caseId,'adjudicate_case_recovery')){
    v2Message('Original decision record missing or a recovery already attempted. No signing.');return;
  }
  $('v2-adjudicate-recovery').disabled=true;
  v2Message('Checking original consensus and current contract state READ ONLY. No signature.');
  try{
    const sdk=await getV2Sdk();
    await requireGenuineV2Interface(sdk);
    const [txResponse,caseResponse]=await Promise.all([
      fetch('/api/v2/tx-consensus?hash='+FIRST_AI_ATTEMPT,{cache:'no-store'}),
      fetch('/api/case?version=v2&caseId='+encodeURIComponent(p.caseId),{cache:'no-store'})
    ]);
    if(!txResponse.ok||!caseResponse.ok)throw Error('Read-only consensus or case lookup unavailable');
    const [tx,caseData]=await Promise.all([txResponse.json(),caseResponse.json()]);
    if(tx.hash!==FIRST_AI_ATTEMPT||tx.finalized!==true||tx.readOnly!==true||
       tx.originalPayer!==p.payer||tx.contract!==v2Address.toLowerCase()||
       tx.consensusResult!=='NO_MAJORITY')
      throw Error('Original AI attempt not independently confirmed as FINALIZED / NO_MAJORITY');
    if(caseData.caseId!==p.caseId||caseData.caseStatus!=='FILED'||
       caseData.verdict!=='PENDING'||caseData.contractVersion!=='v2'||
       caseData.contractAddress?.toLowerCase()!==v2Address.toLowerCase()||
       caseData.identityBinding!=='DETERMINISTIC_ID_MATCHED'||
       caseData.settlement?.status!=='BASE_USDC_TRANSFER_VERIFIED'||
       caseData.txHash!==p.txHash||caseData.payer!==p.payer||
       caseData.payee!==p.payee||caseData.amountAtomic!==p.amountAtomic)
      throw Error('Current GenLayer case is no longer safely pending');
    let record=await sdk.readV2Contract(v2Address,'get_case',[p.caseId]);
    if(typeof record==='string')record=JSON.parse(record);
    if(record?.case_id!==p.caseId||record.status!=='FILED'||record.verdict!=='PENDING')
      throw Error('Finalized GenLayer contract no longer allows adjudication');
    // Recheck local one-shot state after all network reads.
    if(signedLock(p.caseId,'adjudicate_case_recovery')||
       signedLock(p.caseId,'adjudicate_case')?.hash?.toLowerCase()!==FIRST_AI_ATTEMPT)
      throw Error('Signed attempt history changed; no recovery permitted');
    const approved=globalThis.confirm(
      'Submit ONE MORE GenLayer adjudicate_case for existing case '+p.caseId+'?\\n'+
      'Original AI TX: '+FIRST_AI_ATTEMPT+' (FINALIZED / NO_MAJORITY).\\n'+
      'Case remains FILED / PENDING. This will NOT charge USDC or re-file the case.\\n'+
      'A NEW signed GenLayer transaction MAY CONSUME GEN fees and MAY AGAIN FAIL consensus.\\n'+
      'Only one additional attempt is permitted; do not retry unknown outcomes. Sign once?'
    );
    if(!approved){v2Message('Additional GenLayer signature declined; nothing sent.');return;}
    await v2Write('adjudicate_case',p.caseId,[p.caseId],null,'adjudicate_case_recovery');
  }catch(error){
    v2Message('Recovery blocked before signature: '+String(error?.message||'verification unavailable').slice(0,200));
  }finally{v2Controls();}
});
$('v2-resume').addEventListener('click',async()=>{
  const id=trackedCaseV2?.caseId||verifiedPacket?.caseId;
  if(!id||!v2Address||!v2Wallet)return;
  if(id){
    const recovery=signedLock(id,'adjudicate_case_recovery');
    if(recovery?.hash){await refreshRecordedTransaction(id,'adjudicate_case',recovery.hash);return;}
    if(recovery&&!recovery.hash){
      v2Message('Additional AI attempt outcome unknown. Preserve lock and inspect wallet; do not resend.');
      return;
    }
    // The latest signed decision takes priority over a previously finalized filing.
    // Refreshing an old file_case first can mask a pending adjudication.
    for(const action of ['adjudicate_case','file_case']){
      const existing=signedLock(id,action);
      if(existing?.hash){await refreshRecordedTransaction(id,action,existing.hash);return;}
    }
  }
  const delegate=$('v2-delegate').value.trim().toLowerCase();
  if(WALLET_ADDR.test(delegate)&&verifiedPacket){
    const dkey=verifiedPacket.payer.toLowerCase()+':'+verifiedPacket.network+':'+verifiedPacket.txHash+':delegate:'+delegate;
    const history=signedLock(dkey,'set_delegate');
    if(history?.hash){await refreshRecordedTransaction(dkey,'set_delegate',history.hash);return;}
  }
  v2Message('No recorded TX hash for this operation. Check wallet activity before another signature.');
});

$('v2-delegate').addEventListener('input',v2Controls);

/* Zero-signature USDC discovery — reduces manual payment fields to the TX hash. */
$('autofill-transfer').addEventListener('click',async()=>{
  const button=$('autofill-transfer'), message=$('autofill-status');
  const networkValue=network.value;
  const tx=String(form.elements.namedItem('txHash')?.value||'').trim().toLowerCase();
  if(!/^0x[0-9a-f]{64}$/.test(tx)){
    message.textContent='Enter a complete 0x-prefixed 66-character Base transaction hash.';
    return;
  }
  button.disabled=true;
  message.textContent='Reading on-chain USDC Transfer. No payment or wallet signing.';
  packet=null;
  updateV2PreparedPacket(null);
  $('read-verdict').disabled=true;
  $('copy-case').disabled=true;
  $('case-id').textContent='—';
  $('verdict').textContent='UNVERIFIED';
  try{
    const r=await fetch('/api/inspect?network='+encodeURIComponent(networkValue)+
      '&txHash='+encodeURIComponent(tx));
    const data=await r.json();
    if(!r.ok)throw Error(data.error||'Base USDC Transfer inspection unavailable');
    if(data.result!=='BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED'||
      data.network!==networkValue||data.txHash!==tx)
      throw Error('Payment receipt inspection did not match selected network or transaction');
    for(const [name,value] of [
      ['payer',data.payer],['payee',data.payee],
      ['amountAtomic',data.amountAtomic],['asset',data.asset]
    ])form.elements.namedItem(name).value=value;
    setWorkflowStage(2);
    message.textContent='USDC Transfer verified with '+data.confirmations+
      ' confirmations. Payer, payee, amount and token filled automatically. Enter the paid API endpoint and delivery evidence next.';
    display('TRANSFER VERIFIED','Payment details detected — not filed',
      'The Base USDC Transfer was checked independently. A transfer alone is not proof of correct x402 API delivery. Complete case evidence before review.','success');
  }catch(error){
    setWorkflowStage(1);
    message.textContent=String(error?.message||'Transfer lookup unavailable').slice(0,220)+
      '. No values were assumed, and no transaction was sent.';
    display('NOT VERIFIED','Cannot auto-fill this transaction',
      'Review the network and TX hash. Ambiguous token transfers are not auto-selected.','error');
  }finally{button.disabled=false;}
});

/* Invalidate prepared evidence immediately if the source form changes.
   Prevent stale case IDs/approvals when a user edits payment or delivery data. */
form.addEventListener('input',event=>{
  if(event.target.closest('.filing-v2'))return;
  const field=event.target.name;
  if(['network','txHash','amountAtomic','endpoint','payer','payee',
      'terms','delivery','evidence','paymentResponseHeader'].includes(field)){
    if(packet){
      packet=null;
      updateV2PreparedPacket(null);
      $('copy-case').disabled=true;
      $('read-verdict').disabled=true;
      $('case-id').textContent='—';
      $('verdict').textContent='UNVERIFIED';
      display('REVIEW NEEDED','Case details changed',
        'Verify the payment and prepare the revised case before any GenLayer action.','pending');
    }
    setWorkflowStage(['terms','delivery','evidence'].includes(field)?2:1);
  }
});

/* Fresh x402 V2 acceptance: one explicit wallet-authorized 0.01 TEST USDC
   purchase. No auto-pay, no key export, no retry on ambiguous results. */
const freshQuoteButton=$('v2-pay-quote'),freshPayButton=$('v2-pay-once');
const freshStatus=$('v2-pay-status');
let freshReady=false,freshBusy=false;
function freshMessage(value){freshStatus.textContent=value;}
function refreshFreshButtons(){
  const sessionLock=(()=>{
    try{return Boolean(globalThis.localStorage?.getItem(
      'payjury:v2:one-paid-x402:0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb:'+NEW_LIVE_SESSION));}
    catch{return true;}
  })();
  freshQuoteButton.disabled=freshBusy||freshHostedBlocked||sessionLock;
  freshPayButton.disabled=freshBusy||!freshReady||freshHostedBlocked||sessionLock;
  if(sessionLock&&freshStatus.textContent.includes('No new payment has been signed'))
    freshMessage('This new testnet session has already attempted payment. Review the original TX; never retry an unknown outcome.');
}
freshQuoteButton.addEventListener('click',async()=>{
  if(freshBusy)return;
  freshBusy=true;refreshFreshButtons();
  freshMessage('Checking live HTTP 402, exact testnet merchant, Base Sepolia RPC and official test USDC balance. No signature.');
  try{
    const response=await fetch('/api/v2/x402/quote',{method:'GET',cache:'no-store'});
    const out=await response.json();
    if(!response.ok)throw Error(out.error||'Read-only quote unavailable');
    freshReady=out.result==='V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY'&&
      out.wallet==='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb'&&
      out.network==='eip155:84532'&&out.amountAtomic===undefined&&
      out.requiredAtomic==='10000'&&out.quoteVerified===true;
    if(freshReady){
      freshMessage('READY: '+Number(out.availableAtomic)/1e6+
        ' test USDC available on 0x4C7c...8Dcb. Live x402 price 0.01 test USDC, merchant 0xe383...e6. You must separately confirm once and sign EIP-712 in your wallet.');
    }else{
      freshMessage('NOT READY: '+(out.result==='V2_FRESH_PAYER_NEEDS_TEST_USDC'?
        'Fund 0x4C7c...8Dcb with official Base Sepolia test USDC using the Circle faucet.':
        'Exact price, merchant or chain did not pass. Do not pay.'));
    }
  }catch(error){
    freshReady=false;freshMessage('Read-only check failed: '+String(error?.message||error).slice(0,180));
  }finally{freshBusy=false;refreshFreshButtons();}
});
freshPayButton.addEventListener('click',async()=>{
  if(freshBusy||!freshReady||freshHostedBlocked)return;
  // Check shared lock BEFORE wallet confirmation; the backend also enforces
  // an atomic SET NX immediately before forwarding the signed request.
  if(!($('v2-fresh-purchase-panel')?.hidden)){
    try{
      const r=await fetch('/api/v2/x402/session',{cache:'no-store'});
      if(r.ok){
        const state=await r.json();
        if(state.session===NEW_LIVE_SESSION&&state.locked===true){
          freshHostedBlocked=true;freshReady=false;refreshFreshButtons();
          freshMessage('This payment session is already locked on the server. Never send again.');
          return;
        }
        if(state.session!==NEW_LIVE_SESSION||state.readOnly!==true||state.locked!==false)
          throw Error('Unknown lock state');
      }else if(location.hostname.endsWith('.vercel.app')){
        throw Error('Server-side lock cannot be checked');
      }
    }catch{
      freshHostedBlocked=true;freshReady=false;refreshFreshButtons();
      freshMessage('Cannot verify the payment lock. No signature requested.');
      return;
    }
  }
  const approved=globalThis.confirm(
    'Authorize EXACTLY ONE NEW testnet x402 purchase?\n'+
    'Payer: 0x4C7cb73ac8f8999af21cfc9fF4cF2333a9508Dcb\n'+
    'Network: Base Sepolia (84532)\nAmount: 0.01 TEST USDC\n'+
    'Merchant: 0xe3837fe309618ae075dbef0a20735c0615a308e6\n'+
    'This is a REAL signed payment authorization. No automatic retry. Continue?'
  );
  if(!approved)return;
  freshBusy=true;freshReady=false;refreshFreshButtons();
  freshMessage('Requesting wallet switch to Base Sepolia and ONE EIP-3009 signature. Any ambiguous payment remains permanently locked; do not retry.');
  try{
    const sdk=await getV2Sdk();
    const out=await sdk.payV2X402Once();
    if(out.result!=='PAYMENT_AND_BASE_USDC_VERIFIED_V2_CASE_PREPARED'||
       out.packet?.status!=='PREPARED_NOT_FILED'||
       out.packet?.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED'){
      freshMessage('PAYMENT OUTCOME REQUIRES REVIEW: '+String(out.result||'UNKNOWN')+
        (out.txHash?' · original Base TX '+out.txHash:'')+
        '. Do not retry. Inspect the original payment and one-shot lock.');
      return;
    }
    const p=out.packet;
    for(const [name,value] of [
      ['txHash',p.txHash],['asset',p.token],['network',p.network],
      ['payer',p.payer],['payee',p.payee],['amountAtomic',p.amountAtomic],
      ['endpoint',p.endpoint],['terms',p.terms],['delivery',p.delivery],['evidence',p.evidence]
    ])form.elements.namedItem(name).value=value;
    packet=p;updateV2PreparedPacket(p);setWorkflowStage(3);
    $('case-id').textContent=p.caseId;
    $('verdict').textContent='NOT FILED';
    $('track-id').value=p.caseId;
    $('track-version').value='v2';
    $('copy-case').disabled=false;
    $('read-verdict').disabled=true; // This is a V2 case, not historical V1.
    display('TRANSFER VERIFIED','New x402 purchase verified — V2 case not filed',
      'Base Sepolia TX '+out.paymentTx+' confirmed. Original API response metadata recorded. Switch back to GenLayer Studionet 61999, reconnect the SAME wallet and separately approve one File Case.','success');
    // We just switched to Base Sepolia. Never leave a prior GenLayer SDK
    // connection marked as sign-ready on a different chain.
    v2Wallet=null;
    $('v2-signer').textContent='Reconnect on Studionet 61999';
    v2Controls();
    freshMessage('NEW PAID TX: '+out.paymentTx+' · V2 case '+p.caseId+
      ' · Base USDC verified. No GenLayer filing yet. Reconnect 0x4C7c...8Dcb on Studionet before filing.');
  }catch(error){
    v2Wallet=null;v2Controls();
    freshMessage(String(error?.message||'Payment outcome uncertain').slice(0,255));
  }finally{freshBusy=false;refreshFreshButtons();}
});
refreshFreshButtons();

/* Continue the owner's already-paid V2 acceptance case with NO new payment.
   The server independently rechecks Base USDC before restoring immutable data. */
$('v2-restore-paid').addEventListener('click',async()=>{
  const button=$('v2-restore-paid'),message=$('v2-restore-status');
  if(button.disabled)return;
  button.disabled=true;
  message.textContent='Rechecking original Base Sepolia USDC receipt. No API purchase, wallet signature or GenLayer write.';
  try{
    const res=await fetch('/api/v2/resume-known',{method:'GET',cache:'no-store'});
    const p=await res.json();
    if(!res.ok)throw Error(p.error||'Original payment could not be verified');
    if(p.restoredReadOnly!==true||p.status!=='PREPARED_NOT_FILED'||
       p.settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED'||
       p.caseId!=='pj_9f2276fd1904120b16d5f5b6ea5f7a2b'||
       p.txHash!=='0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2')
      throw Error('Recovered case identity, payment or receipt did not match the original V2 acceptance');
    for(const [name,value] of [
      ['network',p.network],['txHash',p.txHash],['asset',p.token],
      ['payer',p.payer],['payee',p.payee],['amountAtomic',p.amountAtomic],
      ['endpoint',p.endpoint],['terms',p.terms],
      ['delivery',p.delivery],['evidence',p.evidence]
    ]){
      const input=form.elements.namedItem(name);
      if(!input)throw Error('Case form missing '+name);
      input.value=value;
    }
    packet=p;
    updateV2PreparedPacket(p);
    setWorkflowStage(3);
    $('case-id').textContent=p.caseId;
    $('verdict').textContent='NOT FILED';
    $('track-id').value=p.caseId;
    $('track-version').value='v2';
    $('copy-case').disabled=false;
    $('read-verdict').disabled=true;
    display('BASE USDC VERIFIED','Already-paid V2 case restored',
      'Original Base Sepolia USDC receipt independently reverified. No new payment, GenLayer filing or AI verdict occurred. Connect the same wallet on Studionet and review File Case.','success');
    message.textContent='Original payment reverified · '+p.settlement.confirmations+
      ' Base confirmations · case '+p.caseId+'. Continue with GenLayer wallet. Do NOT pay x402 again.';
  }catch(error){
    message.textContent='Restore stopped: '+String(error?.message||error).slice(0,220)+
      '. Original x402 payment must NOT be repeated.';
  }finally{button.disabled=false;}
});
