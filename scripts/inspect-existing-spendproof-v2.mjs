// READ ONLY. Inspect already-paid SpendProof x402 Base Mainnet transaction
// against independent Base USDC receipt AND current GenLayer V2 authorization.
// No Kite session, no Gmail auth, no payment, no wallet signature and no new case.
const PAYMENT_TX='0xe3e247e6cc7f3cd740ed7cc814f7d39f39e21f38e1633de6677cfe68175921cd';
const CLAIMANT='0x4C7cb73aC8F8999af21cfc9fF4cF2333a9508Dcb';
const BASE='http://127.0.0.1:'+String(process.env.PORT||4173);
const endpoint=new URL('/api/v2/candidate',BASE);
endpoint.searchParams.set('network','eip155:8453');
endpoint.searchParams.set('txHash',PAYMENT_TX);
endpoint.searchParams.set('claimant',CLAIMANT);
try{
  const res=await fetch(endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(25000)});
  const out=await res.json();
  const body={
    result:out.result||'READ_ONLY_CANDIDATE_UNVERIFIED',
    source:'SpendProof owner-recorded Kite x402 payment, 2026-11-04',
    paymentTx:PAYMENT_TX,
    network:'eip155:8453',
    independentBaseTransfer:out.transfer?.result||'NOT_VERIFIED',
    payer:out.transfer?.payer||null,
    payee:out.transfer?.payee||null,
    usdcAtomic:out.transfer?.amountAtomic||null,
    claimant:CLAIMANT,
    claimantAuthorized:out.claimantAuthorized===true,
    unusedInV2:out.unusedInV2===true,
    v2FilingStatus:out.v2FilingStatus||'UNVERIFIED',
    readOnly:true,paidAgain:false,genlayerWriteSent:false,
    next:res.ok?
      out.unusedInV2!==true?'Stop: GenLayer V2 already records this payment reference.':
      out.claimantAuthorized!==true?
        'Verified transfer may be eligible, but the connected GenLayer wallet is NOT authorized by the Base payer. Kite Gmail/passkey approval does not prove GenLayer authorization. Do not sign file_case; identify a payer-supported EVM signing path or a different verifiable payment owned by your connected wallet.':
        'Payment verified and V2 signer authorized. Review accurate API terms and delivery evidence; perform one explicit wallet-approved filing only after checking case identity.':
      String(out.error||'V2 candidate verification unavailable. Stop and keep both wallets and payments unchanged.')
  };
  console.log('PAYJURY_EXISTING_PAYMENT_V2_READ_ONLY',JSON.stringify(body,null,2));
  if(!res.ok||out.unusedInV2!==true||out.transfer?.result!=='BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED')
    process.exitCode=2;
}catch{
  console.error('PAYJURY_EXISTING_PAYMENT_V2_READ_ONLY',JSON.stringify({
    result:'UNAVAILABLE',readOnly:true,paidAgain:false,genlayerWriteSent:false,
    next:'Start local PAYJURY server, then retry read-only candidate verification. Never retry the paid Kite request.'
  }));
  process.exitCode=2;
}
