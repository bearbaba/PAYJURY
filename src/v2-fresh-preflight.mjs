// Read-only new x402 Base Sepolia PAYJURY V2 payer preflight.
// Same EOA as connected GenLayer wallet = no delegate needed.
// Never signs EIP-712, calls a paid endpoint with payment header, or spends USDC.
import {NETWORKS,requireHttpsEndpoint} from './payment.mjs';
import {fetchX402Quote} from './x402.mjs';

export const V2_SIGNER='0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb';
export const PROPOSED_PAID_ENDPOINT='https://x402.payai.network/api/base-sepolia/paid-content';
export const KNOWN_PREVIOUS_PAYEE='0xe3837fe309618ae075dbef0a20735c0615a308e6';
export const NETWORK='eip155:84532';
const ADDRESS=/^0x[0-9a-f]{40}$/i;
const EXPECTED_ATOMIC='10000';
const TOKEN=NETWORKS[NETWORK].usdc;
const CALL_BALANCE_OF='0x70a08231';
const CALL_CHAIN_ID=84532n;
export async function checkV2FreshPaymentReadiness({
  payer=V2_SIGNER,endpoint=PROPOSED_PAID_ENDPOINT,payee=KNOWN_PREVIOUS_PAYEE,
  rpcUrl=process.env.BASE_RPC_URL,fetchImpl=fetch,
  quoteReader=fetchX402Quote
}={}){
  if(!ADDRESS.test(payer)||!ADDRESS.test(payee)||payer.toLowerCase()===payee.toLowerCase())
    throw Error('Invalid payer/merchant pair');
  const buyer=payer.toLowerCase(),seller=payee.toLowerCase();
  const target=requireHttpsEndpoint(endpoint);
  const allowedHost=new URL(PROPOSED_PAID_ENDPOINT).hostname;
  if(new URL(target).hostname!==allowedHost||target!==PROPOSED_PAID_ENDPOINT)
    throw Error('Paid resource not explicitly approved');
  const provider=requireHttpsEndpoint(rpcUrl);
  const quote=await quoteReader(target,{allowedHost,fetchImpl});
  const matches=quote?.options?.filter(option=>
    option.network===NETWORK&&option.scheme==='exact'&&
    option.asset===TOKEN&&option.amountAtomic===EXPECTED_ATOMIC&&option.payee===seller);
  if(quote?.status!=='X402_QUOTE_INSPECTED_NOT_PAID'||matches?.length!==1)
    throw Error('Fresh exact Base Sepolia x402 quote not verified: no payment permitted');

  let id=0;
  const rpc=async (method,params=[])=>{
    const response=await fetchImpl(provider,{method:'POST',redirect:'error',
      headers:{'content-type':'application/json'},signal:AbortSignal.timeout(8500),
      body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
    if(!response.ok)throw Error('Testnet RPC unavailable');
    const parsed=await response.json();
    if(parsed?.error||typeof parsed?.result!=='string')throw Error('Testnet RPC response invalid');
    return parsed.result;
  };
  const chain=await rpc('eth_chainId');
  if(!/^0x[0-9a-f]+$/i.test(chain)||BigInt(chain)!==CALL_CHAIN_ID)
    throw Error('Base RPC points to wrong chain');
  const result=await rpc('eth_call',[{
    to:TOKEN,data:CALL_BALANCE_OF+buyer.slice(2).padStart(64,'0')
  },'latest']);
  if(!/^0x[0-9a-f]{1,64}$/i.test(result))
    throw Error('Official test USDC balance unreadable');
  const available=BigInt(result);
  return {
    result:available>=BigInt(EXPECTED_ATOMIC)?
      'V2_FRESH_PAYER_QUOTE_AND_BALANCE_READY_READ_ONLY':
      'V2_FRESH_PAYER_NEEDS_TEST_USDC',
    wallet:buyer,network:NETWORK,token:TOKEN,endpoint:target,merchant:seller,
    requiredAtomic:EXPECTED_ATOMIC,availableAtomic:available.toString(),
    genlayerSignerMustBeSameAddress:buyer,
    quoteVerified:true,paymentExecuted:false,signaturesRequested:0,
    note:available>=BigInt(EXPECTED_ATOMIC)?
      'Eligible for a separate one-shot wallet-approved x402 payment. DO NOT use legacy Codespaces private-key client for a different payer.' :
      'Fund this SAME address with official Base Sepolia test USDC via a legitimate faucet before approving any new payment.'
  };
}
