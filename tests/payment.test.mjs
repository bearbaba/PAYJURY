import test from 'node:test';
import assert from 'node:assert/strict';
import {NETWORKS,validateClaim,caseIdForClaim,verifyBaseUSDCTransfer,inspectBaseUSDCTransfer,decodeX402PaymentResponse,makeCasePacket} from '../src/payment.mjs';
import {inspectX402Quote,fetchX402Quote} from '../src/x402.mjs';

const payer='0x'+'1'.repeat(40),payee='0x'+'2'.repeat(40),txHash='0x'+'a'.repeat(64);
const claim=Object.freeze({network:'eip155:84532',asset:NETWORKS['eip155:84532'].usdc,
  txHash,payer,payee,amountAtomic:'10000',
  endpoint:'https://api.example.com/report',
  terms:'Three invoice lines and correct total',delivery:'INV-B subtotal 90',evidence:'Source row B: 3 x 20 = 60'});
const transferTopic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const addressTopic=v=>'0x'+'0'.repeat(24)+v.slice(2);
function fakeRpc({
  chain='0x14a34',status='0x1',head='0x13',block='0x10',
  logs=[{address:claim.asset,topics:[transferTopic,addressTopic(payer),addressTopic(payee)],
    data:'0x'+BigInt(claim.amountAtomic).toString(16).padStart(64,'0'),logIndex:'0x0'}],
  receiptHash=txHash,
}={}) {
  return async(url, options)=>{
    assert.equal(url,'https://rpc.example.com/');
    assert.equal(options.method,'POST');
    const {method}=JSON.parse(options.body);
    let result;
    if(method==='eth_chainId')result=chain;
    else if(method==='eth_getTransactionReceipt')result={transactionHash:receiptHash,status,blockNumber:block,logs};
    else if(method==='eth_blockNumber')result=head;
    else throw Error('Unapproved RPC method');
    return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})};
  };
}
const verify=(fake= fakeRpc())=>verifyBaseUSDCTransfer(validateClaim(claim),
  {rpcUrl:'https://rpc.example.com',fetchImpl:fake,requiredConfirmations:2});

test('valid official Base Sepolia USDC claim binds deterministic case ID',()=>{
  const c=validateClaim(claim);
  assert.equal(caseIdForClaim(c),caseIdForClaim({...c}));
  assert.match(caseIdForClaim(c),/^pj_[a-f0-9]{32}$/);
  assert.notEqual(caseIdForClaim(c),caseIdForClaim({...c,evidence:c.evidence+' changed'}));
});
test('only supported networks and official USDC contracts permitted',()=>{
  assert.throws(()=>validateClaim({...claim,network:'eip155:1'}),/Unsupported/);
  assert.throws(()=>validateClaim({...claim,asset:'0x'+'f'.repeat(40)}),/official USDC/);
  assert.throws(()=>validateClaim({...claim,amountAtomic:'100001'}),/cap/);
  assert.throws(()=>validateClaim({...claim,amountAtomic:'0'}),/cap/);
  assert.throws(()=>validateClaim({...claim,payer:'fake'}),/payer/);
  assert.throws(()=>validateClaim({...claim,txHash:'fake'}),/txHash/);
});
test('rejects private, non-HTTPS, credential-bearing or local host endpoints',()=>{
  for(const endpoint of ['http://api.example.com','https://localhost/path','https://127.0.0.1/',
    'https://me:secret@api.example.com','https://api.example.com:4444/path','https://site.local/']) {
    assert.throws(()=>validateClaim({...claim,endpoint}),/HTTPS public endpoint/);
  }
});
test('source terms, evidence and delivery cannot be missing',()=>{
  for(const key of ['terms','delivery','evidence']){
    assert.throws(()=>validateClaim({...claim,[key]:' '}),/Invalid/);
  }
});
test('real RPC receipt verifies exactly one USDC Transfer plus confirmations',async()=>{
  const result=await verify();
  assert.equal(result.result,'BASE_USDC_TRANSFER_VERIFIED');
  assert.equal(result.confirmations,4);
  assert.equal(result.amountAtomic,'10000');
  assert.match(result.caveat,/not that an API delivered/);
});
test('wrong network, reverted transaction and mismatched receipt hash refuse settlement',async()=>{
  await assert.rejects(verify(fakeRpc({chain:'0x1'})),/network mismatch/);
  await assert.rejects(verify(fakeRpc({status:'0x0'})),/reverted/);
  await assert.rejects(verify(fakeRpc({receiptHash:'0x'+'b'.repeat(64)})),/mismatched/);
});
test('insufficient confirmations or absent transfer is not payment proof',async()=>{
  await assert.rejects(verify(fakeRpc({head:'0x10'})),/sufficiently confirmed/);
  await assert.rejects(verify(fakeRpc({logs:[]})),/Matching USDC Transfer/);
});
test('wrong transfer beneficiary, wrong token, wrong value and duplicate logs fail closed',async()=>{
  const good={address:claim.asset,topics:[transferTopic,addressTopic(payer),addressTopic(payee)],
    data:'0x'+BigInt('10000').toString(16).padStart(64,'0')};
  for(const log of [
    {...good,address:'0x'+'f'.repeat(40)},
    {...good,topics:[transferTopic,addressTopic(payer),addressTopic('0x'+'3'.repeat(40))]},
    {...good,data:'0x'+BigInt('9000').toString(16).padStart(64,'0')},
  ]) await assert.rejects(verify(fakeRpc({logs:[log]})),/Matching USDC Transfer/);
  await assert.rejects(verify(fakeRpc({logs:[good,good]})),/ambiguous/);
});
test('x402 settlement header must bind success, original TX and network',()=>{
  const data={success:true,transaction:claim.txHash,network:claim.network};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64');
  assert.equal(decodeX402PaymentResponse(encode(data),claim).result,'X402_RESPONSE_MATCHED');
  for(const altered of [{...data,transaction:'0x'+'b'.repeat(64)},{...data,success:false},{...data,network:'eip155:8453'}]){
    assert.throws(()=>decodeX402PaymentResponse(encode(altered),claim),/does not match/);
  }
  assert.throws(()=>decodeX402PaymentResponse('bad!',claim),/Invalid/);
});
test('case packet cannot claim a filed case or a GenLayer verdict',async()=>{
  const checked=validateClaim(claim),settlement=await verify();
  assert.throws(()=>makeCasePacket(checked,{result:'CLAIMED'}),/Independent/);
  const packet=makeCasePacket(checked,settlement);
  assert.equal(packet.status,'PREPARED_NOT_FILED');
  assert.equal(packet.verdict,'UNVERIFIED');
  assert.equal(packet.x402ReceiptMatched,false);
});
const quote={x402Version:2,resource:{url:claim.endpoint},accepts:[
  {scheme:'exact',network:claim.network,asset:claim.asset,payTo:payee,amount:'10000'},
  {scheme:'exact',network:claim.network,asset:claim.asset,payTo:payee,amount:'999999999'},
]};
const quoteHeader=Buffer.from(JSON.stringify(quote)).toString('base64');
test('x402 v2 quote inspection filters unsafe options and never charges',()=>{
  const inspected=inspectX402Quote(quoteHeader,claim.endpoint);
  assert.equal(inspected.choiceCount,1);
  assert.equal(inspected.status,'X402_QUOTE_INSPECTED_NOT_PAID');
  assert.throws(()=>inspectX402Quote(quoteHeader,'https://api.example.com/other'),/resource URL/);
});
test('quote fetch requires exact allowed HTTPS hostname and HTTP 402',async()=>{
  let calls=0;
  const fake=async()=>{calls++;return {status:402,headers:{get:key=>key==='payment-required'?quoteHeader:null}};};
  await assert.rejects(fetchX402Quote(claim.endpoint,{allowedHost:'other.example.com',fetchImpl:fake}),/allowlist/);
  assert.equal(calls,0);
  const result=await fetchX402Quote(claim.endpoint,{allowedHost:'api.example.com',fetchImpl:fake});
  assert.equal(calls,1);assert.equal(result.choiceCount,1);
  await assert.rejects(fetchX402Quote(claim.endpoint,{allowedHost:'api.example.com',
    fetchImpl:async()=>({status:200,headers:{get:()=>null}})}),/Expected HTTP 402/);
});

test('one-click receipt inspection auto-fills EXACT official Base USDC transfer, not an x402 verdict',async()=>{
  const payment=await inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc()
  });
  assert.equal(payment.result,'BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED');
  assert.equal(payment.amountAtomic,'10000');
  assert.equal(payment.payer,payer);
  assert.equal(payment.payee,payee);
  assert.equal(payment.asset,claim.asset);
  assert.equal(payment.confirmations,4);
  assert.match(payment.warning,/not x402 causation/);
});
test('ambiguous or nonexistent official USDC transfer cannot auto-fill a different payer',async()=>{
  const good={address:claim.asset,topics:[transferTopic,addressTopic(payer),addressTopic(payee)],
    data:'0x'+BigInt('10000').toString(16).padStart(64,'0'),logIndex:'0x0'};
  await assert.rejects(inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc({logs:[]})
  }),/Ambiguous or absent/);
  await assert.rejects(inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc({logs:[good,good]})
  }),/Ambiguous or absent/);
  await assert.rejects(inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc({chain:'0x1'})
  }),/network mismatch/);
});
test('inspection rejects reverted and over-cap token receipts without populating a case',async()=>{
  await assert.rejects(inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc({status:'0x0'})
  }),/reverted/);
  const overpriced={address:claim.asset,topics:[transferTopic,addressTopic(payer),addressTopic(payee)],
    data:'0x'+BigInt('100001').toString(16).padStart(64,'0'),logIndex:'0x0'};
  await assert.rejects(inspectBaseUSDCTransfer({network:claim.network,txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc({logs:[overpriced]})
  }),/safety cap/);
  await assert.rejects(inspectBaseUSDCTransfer({network:'eip155:1',txHash:claim.txHash},{
    rpcUrl:'https://rpc.example.com',fetchImpl:fakeRpc()
  }),/Unsupported/);
});
