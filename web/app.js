const $=id=>document.getElementById(id);
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
fetch('/api/status').then(res=>res.json()).then(data=>{
  if(!data.paymentVerifierConfigured){
    display('CONFIGURATION REQUIRED','Base RPC not configured',
      'Set BASE_RPC_URL on the local server to verify real token transfers. No demo evidence is fabricated.','pending');
  }
}).catch(()=>{display('OFFLINE','Verification service unavailable','Check the PAYJURY local server before proceeding.','error');});


const CASE_ID=/^pj_[0-9a-f]{32}$/;
$('track-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const id=$('track-id').value.trim();
  const message=$('track-message'),button=$('track-button');
  $('track-results').hidden=true;
  $('track-base-link').hidden=true;
  if(!CASE_ID.test(id)){message.textContent='Invalid case ID. Use pj_ followed by 32 lowercase hex characters.';return;}
  button.disabled=true;
  message.textContent='Reading GenLayer and independently checking the Base receipt. No signing or payment.';
  try{
    const version=$('track-version').value;
    const res=await fetch('/api/case?version='+encodeURIComponent(version)+'&caseId='+encodeURIComponent(id));
    const data=await res.json();
    if(!res.ok)throw Error(data.error||'Case readback unavailable');
    if(data.caseId!==id||!['FILED','DECIDED'].includes(data.caseStatus))throw Error('Unexpected case readback');
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
    if(data.contractVersion!==version)throw Error('Contract version mismatch');
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
    message.textContent=String(error?.message||'Case lookup unavailable').slice(0,220);
  }finally{button.disabled=false;}
});
$('track-example').addEventListener('click',()=>{
  $('track-version').value='v1';
  $('track-id').value='pj_3f6b4f29a744db71c63f9acf552d2a19';
  $('track-form').requestSubmit();
});


/* Signed GenLayer V2 filing is strictly opt-in; V1 history never signs. */
const V1_HISTORIC_TX='0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5';
const WALLET_ADDR=/^0x[0-9a-f]{40}$/i;
let v2Address=null,v2Wallet=null,v2Sdk=null,verifiedPacket=null,
  trackedCaseV2=null, v2Busy=false;
function v2Message(message){$('v2-status').textContent=message;}
function v2Controls(){
  const enabled=Boolean(v2Address);
  $('v2-connect').disabled=!enabled||v2Busy;
  const signed=enabled&&Boolean(v2Wallet)&&!v2Busy;
  const prepared=Boolean(verifiedPacket)&&verifiedPacket.txHash!==V1_HISTORIC_TX;
  $('v2-file').disabled=!signed||!prepared;
  $('v2-authorize').disabled=!signed||!prepared||v2Wallet.toLowerCase()!==verifiedPacket.payer.toLowerCase();
  $('v2-revoke').disabled=$('v2-authorize').disabled;
  const pending=trackedCaseV2&&trackedCaseV2.caseStatus==='FILED'&&
    trackedCaseV2.identityBinding==='DETERMINISTIC_ID_MATCHED'&&
    trackedCaseV2.settlement?.status==='BASE_USDC_TRANSFER_VERIFIED'&&
    [trackedCaseV2.claimant?.toLowerCase(),trackedCaseV2.payer?.toLowerCase()].includes(v2Wallet?.toLowerCase());
  $('v2-adjudicate').disabled=!signed||!pending;
  const currentCase=trackedCaseV2?.caseId||verifiedPacket?.caseId;
  const delegate=$('v2-delegate').value.trim().toLowerCase();
  const delegationKey=verifiedPacket&&WALLET_ADDR.test(delegate)?
    verifiedPacket.payer.toLowerCase()+':'+verifiedPacket.network+':'+verifiedPacket.txHash+':delegate:'+delegate:null;
  $('v2-resume').disabled=!signed||!(
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
    v2Message('GenLayer transaction finalized but execution was not successful: '+state.execution+
      '. Keep the TX hash and inspect Explorer. Do not resend.');
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
  await refreshV2Readback(caseId);
  return true;
}
async function refreshV2Readback(caseId){
  try{
    const response=await fetch('/api/case?version=v2&caseId='+encodeURIComponent(caseId));
    if(!response.ok)throw Error('GenLayer case readback not yet available');
    const result=await response.json();
    if(result.caseId!==caseId)throw Error('Case readback ID mismatch');
    updateV2TrackedCase(result);
    $('track-version').value='v2';
    $('track-id').value=caseId;
    $('track-form').requestSubmit();
    v2Message(result.caseStatus==='DECIDED'?
      'AI verdict confirmed from V2: '+result.verdict+'. No more signing required.':
      'V2 filing confirmed on-chain. Case status FILED; choose Request AI decision after reviewing evidence.');
  }catch{
    v2Message('TX is finalized, but contract readback is unavailable. Preserve the hash and use Refresh recorded TX. Never submit again.');
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
async function v2Write(method,caseId,args,metadata=null){
  if(!v2Address||!v2Wallet||v2Busy)throw Error('V2 contract and connected wallet required');
  const existing=signedLock(caseId,method);
  if(existing)throw Error(existing.hash?
    'This action already has a TX: '+existing.hash+'. Use Refresh recorded TX; do not sign again.':
    'An earlier write attempt has an unknown outcome. Review wallet activity before any resubmission.');
  const sdk=await getV2Sdk();
  v2Busy=true;v2Controls();
  try{
    // Lock BEFORE writeContract. If no hash comes back, never assume failure.
    writeLock(caseId,method,{state:'ATTEMPTED_UNKNOWN',delegation:metadata,when:new Date().toISOString()});
    const hash=await sdk.sendV2Write(v2Address,method,args);
    writeLock(caseId,method,{state:'SUBMITTED',hash,delegation:metadata,when:new Date().toISOString()});
    v2Message(method+' submitted: '+hash+'. Checking GenLayer finality without resending.');
    await monitorSubmitted(caseId,method,hash);
  }catch(error){
    const explicitlyRejected=error?.code===4001||
      error?.cause?.code===4001||
      /user rejected|user denied|user cancelled/i.test(String(error?.shortMessage||''));
    if(explicitlyRejected){
      // EIP-1193 explicit rejection means no wallet signature/broadcast occurred.
      globalThis.localStorage.removeItem(lockKey(caseId,method));
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
    const state=await sdk.readV2Contract(v2Address,'filing_status',[
      p.caseId,p.network,p.txHash,p.token,p.payer,p.payee,p.amountAtomic,v2Wallet
    ]);
    if(state!=='READY_REQUIRES_BASE_PROOF')
      throw Error('V2 filing blocked: '+String(state));
    if(!globalThis.confirm('Confirm ONE GenLayer V2 filing for '+p.caseId+
      '\nPayer: '+p.payer+'\nSigner: '+v2Wallet+
      '\nPayment '+p.amountAtomic+' atomic USDC · '+p.network+
      '\nThis does not refund the payment. Approve signing?'))return;
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
$('v2-resume').addEventListener('click',async()=>{
  const id=trackedCaseV2?.caseId||verifiedPacket?.caseId;
  if(!id||!v2Address||!v2Wallet)return;
  if(id){
    for(const action of ['file_case','adjudicate_case']){
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
