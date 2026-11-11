const $=id=>document.getElementById(id);
const form=$('case-form'), network=$('network'), asset=$('asset');
const status=$('case-status'),heading=$('case-heading'),detail=$('case-detail');
let packet=null;
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
  event.preventDefault();packet=null;
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
    $('track-id').value=packet.caseId;
    $('case-id').textContent=packet.caseId;
    $('verdict').textContent='NOT FILED';
    $('copy-case').disabled=false;$('read-verdict').disabled=false;
    display('TRANSFER VERIFIED','Case prepared — not filed',
      'On-chain USDC Transfer verified with '+packet.settlement.confirmations+' confirmations. This packet still needs an actual GenLayer filing and adjudication.','success');
  } catch(error) {
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
    const res=await fetch('/api/case?caseId='+encodeURIComponent(id));
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
    $('track-results').hidden=false;
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
  $('track-id').value='pj_3f6b4f29a744db71c63f9acf552d2a19';
  $('track-form').requestSubmit();
});
