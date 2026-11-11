import {NETWORKS,requireHttpsEndpoint} from './payment.mjs';

function b64json(header) {
  if(!header||typeof header!=='string'||header.length>12000||!/^[a-zA-Z0-9+/=]+$/.test(header))throw Error('Invalid x402 PAYMENT-REQUIRED header');
  try{return JSON.parse(Buffer.from(header,'base64').toString('utf8'));}
  catch {throw Error('Unparseable x402 payment requirement');}
}
export function inspectX402Quote(header, endpoint) {
  const url=requireHttpsEndpoint(endpoint);
  const quote=b64json(header);
  if(quote?.x402Version!==2 || !Array.isArray(quote.accepts)) throw Error('Expected x402 v2 accepts[]');
  if(quote.resource?.url !== url)throw Error('x402 resource URL does not match requested endpoint');
  const choices=quote.accepts.filter(x=>
    x?.scheme==='exact' && NETWORKS[x?.network] &&
    typeof x.asset==='string' && x.asset.toLowerCase()===NETWORKS[x.network].usdc &&
    /^0x[0-9a-f]{40}$/i.test(x.payTo||'') &&
    typeof x.amount==='string' && /^[1-9][0-9]*$/.test(x.amount) &&
    BigInt(x.amount)<=100000n // hard limit: 0.10 USDC
  );
  return {status:'X402_QUOTE_INSPECTED_NOT_PAID', endpoint:url,
    options:choices.map(x=>({network:x.network,scheme:x.scheme,asset:x.asset.toLowerCase(),
      amountAtomic:x.amount,payee:x.payTo.toLowerCase()})),
    choiceCount:choices.length, warning:'No payment was authorized or executed. A quote is not settlement proof.'};
}
export async function fetchX402Quote(endpoint,{allowedHost,fetchImpl=fetch}={}) {
  const url=requireHttpsEndpoint(endpoint);
  if(!allowedHost || new URL(url).hostname!==allowedHost)throw Error('Host not on explicit allowlist');
  const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(9000),headers:{accept:'application/json'}});
  if(response.status!==402)throw Error('Expected HTTP 402 Payment Required, not proof of payment');
  const header=response.headers.get('payment-required');
  return inspectX402Quote(header,url);
}
