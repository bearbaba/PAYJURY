// PAYJURY paid x402 delivery-receipt case (READ ONLY, never signs or pays).
// Built strictly from operator-observed 11 Nov 2026 one-shot payment output.
// Rechecks official USDC Transfer on Base Sepolia before exporting Studio args.
// NO original HTTP response bytes were saved, so this is NOT a content-quality proof.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {NETWORKS,validateClaim,verifyBaseUSDCTransfer,makeCasePacket} from '../src/payment.mjs';

export const FIRST_PAYMENT=Object.freeze({
  network:'eip155:84532',
  asset:NETWORKS['eip155:84532'].usdc,
  txHash:'0x2f5380bad9c06f4d9884f95774b75d8bbc0b6e37a0e2c80c3b4516ef0bbef4d5',
  amountAtomic:'10000',
  payer:'0xd6b8a3a5eb329410d9504784812b8569afa8c2af',
  payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  endpoint:'https://x402.payai.network/api/base-sepolia/paid-content',
  responseSha256:'714c6f1a9a7ae5699b5736867920fad329b2dfa09f7f1f296e2045ee0e07ab73',
});
const EMPTY_SHA256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function firstPaymentClaim() {
  const p=FIRST_PAYMENT;
  return validateClaim({
    network:p.network, asset:p.asset,txHash:p.txHash,
    amountAtomic:p.amountAtomic,payer:p.payer,payee:p.payee,endpoint:p.endpoint,
    terms:'A Base Sepolia x402 Echo paid-content request quoted exact 0.01 USDC for the identified merchant. After settlement, the API should return an HTTP success response containing a nonempty payload. This case evaluates only whether the payment-and-delivery-receipt evidence supports that narrow claim, NOT whether the response contents are correct, comprehensive or suitable for production.',
    delivery:'The one-shot PAYJURY x402 client reported an HTTP 2xx response following the payment. A response body was consumed and its SHA-256 recorded as '+p.responseSha256+'. The raw body bytes were not retained, so their semantic contents and format cannot be independently reviewed.',
    evidence:'Operator-observed run on 2026-11-11: original HTTP 402 quote on '+p.endpoint+' selected exact Base Sepolia USDC 10000 atomic units to '+p.payee+'. PAYMENT-RESPONSE reported TX '+p.txHash+'. The client independently read a successful matching Base USDC Transfer with 10 confirmations in block 57288759. The response body SHA-256 was '+p.responseSha256+'. The original HTTP response body and a cryptographic provider signature over its content were NOT saved. Evidence supports receipt existence, not payload correctness.'
  });
}
export function prepareStudioCalls(claim,settlement) {
  const packet=makeCasePacket(claim,settlement);
  const fields=[
    ['case_id',packet.caseId],
    ['network',claim.network],
    ['tx_hash',claim.txHash],
    ['asset',claim.asset],
    ['payer',claim.payer],
    ['payee',claim.payee],
    ['amount_atomic',claim.amountAtomic],
    ['endpoint',claim.endpoint],
    ['terms',claim.terms],
    ['delivery',claim.delivery],
    ['evidence',claim.evidence]
  ];
  return {
    status:'PAYJURY_CASE_PREPARED_NOT_FILED',
    chain:'GenLayer Studionet',chainId:61999,
    contractAddress:'0xd57a04c3Cc304ab30C9435a9AE34A840802f11C8',
    evidenceSource:'OPERATOR_LOG_PLUS_FRESH_BASE_RPC_RECEIPT',
    paymentEvidence:packet.settlement,
    disputeScope:'PAID_ECHO_DELIVERY_RECEIPT_ONLY_NOT_CONTENT_QUALITY',
    bodyAvailable:false,
    caseId:packet.caseId,
    fileCase:{method:'file_case',fields:Object.fromEntries(fields),args:fields.map(x=>x[1])},
    adjudicateCase:{method:'adjudicate_case',args:[packet.caseId]},
    getCase:{method:'get_case',args:[packet.caseId]},
    statusOnGenLayer:'NOT_FILED',
    signerActionsPerformed:0,
    warning:'Read-only packet. DO NOT file a second case with this same case ID. File and adjudicate separately in Studio, once each, and verify actual FINALIZED/SUCCESS and get_case.'
  };
}
export async function prepareFirstPaidCase({
  rpcUrl=process.env.BASE_RPC_URL,
  verify=verifyBaseUSDCTransfer,
}={}) {
  if(!rpcUrl)throw Error('Base Sepolia RPC required for independent payment re-verification');
  if(FIRST_PAYMENT.responseSha256===EMPTY_SHA256)throw Error('Original response body was empty');
  const claim=firstPaymentClaim();
  const settlement=await verify(claim,{rpcUrl,requiredConfirmations:2});
  return prepareStudioCalls(claim,settlement);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  try{
    const data=await prepareFirstPaidCase();
    const outputPath=new URL('../out/'+data.caseId+'.json',import.meta.url);
    await mkdir(new URL('../out/',import.meta.url),{recursive:true});
    try{
      await writeFile(outputPath,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
    }catch(error){
      if(error?.code!=='EEXIST')throw error; // deterministic file already prepared; do not overwrite.
    }
    console.log('PAYJURY_CASE_PREPARED_READ_ONLY',JSON.stringify({
      caseId:data.caseId,baseTx:data.paymentEvidence.txHash,
      transferVerified:data.paymentEvidence.result,
      amountAtomic:data.paymentEvidence.amountAtomic,
      contractAddress:data.contractAddress,
      output:'out/'+data.caseId+'.json',
      bodyAvailable:false,studioWritePerformed:false,
      next:'Inspect exact file_case fields in the JSON file. No payment or GenLayer write was sent.'
    }));
  }catch(error){
    const reason=String(error?.message||'');
    const safe=reason==='Base Sepolia RPC required for independent payment re-verification'
      ?'RPC_NOT_CONFIGURED'
      :reason==='Original response body was empty'?'EMPTY_BODY':'PAYMENT_EVIDENCE_RECHECK_FAILED';
    console.error('PAYJURY_CASE_NOT_PREPARED',JSON.stringify({reason:safe,signedTransactions:0,noAdditionalPayment:true}));
    process.exitCode=2;
  }
}
