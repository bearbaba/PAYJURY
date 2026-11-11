import { createHash } from 'node:crypto';

export const NETWORKS = Object.freeze({
  'eip155:84532': Object.freeze({ chainId: 84532, name: 'Base Sepolia', usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e' }),
  'eip155:8453': Object.freeze({ chainId: 8453, name: 'Base Mainnet', usdc: '0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase() }),
});

const ADDRESS = /^0x[0-9a-f]{40}$/i;
const HASH = /^0x[0-9a-f]{64}$/i;
const MAX_ATOMIC = 100000n; // 0.10 USDC, fixed in code; no silent browser override.

function bounded(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0e-\x1f]/.test(value)) {
    throw new Error('Invalid ' + label);
  }
  return value.trim();
}
function address(value, label) {
  if (typeof value !== 'string' || !ADDRESS.test(value)) throw new Error('Invalid '+label);
  return value.toLowerCase();
}
export function requireHttpsEndpoint(value) {
  const text=bounded(value,'endpoint',400);
  let url;
  try {url=new URL(text);} catch {throw Error('Invalid endpoint URL');}
  if(url.protocol!=='https:' || url.username || url.password || url.port ||
      url.hash || !url.hostname.includes('.') || url.hostname==='localhost' ||
      url.hostname.endsWith('.local') || url.hostname.endsWith('.internal') ||
      /^(?:\d+\.){3}\d+$/.test(url.hostname)) {
    throw Error('HTTPS public endpoint required');
  }
  return url.toString();
}
export function validateClaim(raw) {
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) throw Error('Invalid case payload');
  const network=bounded(raw.network,'network',32);
  const config=NETWORKS[network];
  if(!config)throw Error('Unsupported payment network');
  const amount=bounded(raw.amountAtomic,'amountAtomic',20);
  if(!/^[1-9][0-9]*$/.test(amount) || BigInt(amount)>MAX_ATOMIC) throw Error('Payment amount exceeds fixed 0.10 USDC safety cap');
  const asset=address(raw.asset,'asset');
  if(asset!==config.usdc)throw Error('Only official USDC contract is supported on this network');
  const txHash=bounded(raw.txHash,'txHash',66).toLowerCase();
  if(!HASH.test(txHash))throw Error('Invalid txHash');
  return Object.freeze({
    network, asset, txHash, amountAtomic:amount,
    payer:address(raw.payer,'payer'), payee:address(raw.payee,'payee'),
    endpoint:requireHttpsEndpoint(raw.endpoint),
    terms:bounded(raw.terms,'terms',1400),
    delivery:bounded(raw.delivery,'delivery',2500),
    evidence:bounded(raw.evidence,'evidence',2500),
  });
}
export function caseIdForClaim(claim) {
  const keys=['network','asset','txHash','amountAtomic','payer','payee','endpoint','terms','delivery','evidence'];
  const canonical=JSON.stringify(keys.map(key=>claim[key]));
  return 'pj_'+createHash('sha256').update(canonical).digest('hex').slice(0,32);
}
function parseHexQuantity(v,name) {
  if(typeof v!=='string'||!/^0x[0-9a-f]+$/i.test(v))throw Error('Malformed RPC '+name);
  return BigInt(v);
}
function topicAddress(v) {
  return typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v) ? '0x'+v.slice(-40).toLowerCase():null;
}
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function verifyBaseUSDCTransfer(claim, {rpcUrl,fetchImpl=fetch,requiredConfirmations=2}={}) {
  if(!NETWORKS[claim.network])throw Error('Unsupported payment chain');
  if(!Number.isSafeInteger(requiredConfirmations)||requiredConfirmations<1||requiredConfirmations>100)throw Error('Invalid confirmations');
  const rpcEndpoint=requireHttpsEndpoint(rpcUrl);
  let count=0;
  async function rpc(method, params=[]) {
    const response=await fetchImpl(rpcEndpoint,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:++count,method,params})
    });
    if(!response.ok)throw Error('RPC HTTP unavailable');
    const body=await response.json();
    if(body?.error || body?.result===undefined)throw Error('RPC response unavailable');
    return body.result;
  }
  const chainId=parseHexQuantity(await rpc('eth_chainId'),'chainId');
  if(chainId!==BigInt(NETWORKS[claim.network].chainId))throw Error('RPC network mismatch');
  const receipt=await rpc('eth_getTransactionReceipt',[claim.txHash]);
  if(!receipt || String(receipt.transactionHash||'').toLowerCase()!==claim.txHash)throw Error('Transaction receipt unavailable or mismatched');
  if(parseHexQuantity(receipt.status,'status')!==1n)throw Error('Transaction reverted');
  const receiptBlock=parseHexQuantity(receipt.blockNumber,'blockNumber');
  const head=parseHexQuantity(await rpc('eth_blockNumber'),'blockNumber');
  if(head<receiptBlock)throw Error('RPC block height inconsistency');
  const confirmations=head-receiptBlock+1n;
  if(confirmations<BigInt(requiredConfirmations))throw Error('Transaction not sufficiently confirmed');
  const matching=(Array.isArray(receipt.logs)?receipt.logs:[]).filter(log=>
    typeof log?.address==='string'&&log.address.toLowerCase()===claim.asset &&
    Array.isArray(log.topics)&&log.topics.length===3 &&
    String(log.topics[0]).toLowerCase()===TRANSFER_TOPIC &&
    topicAddress(log.topics[1])===claim.payer&&topicAddress(log.topics[2])===claim.payee &&
    typeof log.data==='string'&&/^0x[0-9a-f]{64}$/i.test(log.data) &&
    BigInt(log.data)===BigInt(claim.amountAtomic)
  );
  if(matching.length!==1)throw Error('Matching USDC Transfer evidence not found or ambiguous');
  return Object.freeze({
    result:'BASE_USDC_TRANSFER_VERIFIED',network:claim.network,
    txHash:claim.txHash,asset:claim.asset,payer:claim.payer,payee:claim.payee,
    amountAtomic:claim.amountAtomic,confirmations:Number(confirmations),
    blockNumber:receiptBlock.toString(),
    transferLogIndex:String(matching[0].logIndex??''),
    caveat:'An ERC20 Transfer proves a token movement, not that an API delivered correct data or that the transfer was exclusively caused by x402.',
  });
}
export function decodeX402PaymentResponse(header, claim) {
  if(typeof header!=='string'||!header||header.length>8192||!/^[a-zA-Z0-9+/=]+$/.test(header))throw Error('Invalid PAYMENT-RESPONSE header');
  let payload;
  try { payload=JSON.parse(Buffer.from(header,'base64').toString('utf8')); }
  catch {throw Error('Unparseable PAYMENT-RESPONSE header');}
  if(payload?.success!==true || String(payload?.transaction||'').toLowerCase()!==claim.txHash ||
     payload.network!==claim.network)throw Error('x402 settlement response does not match original payment');
  return {result:'X402_RESPONSE_MATCHED',network:claim.network,txHash:claim.txHash,
    caveat:'Header is merchant/facilitator-provided; independent chain verification is required.'};
}
export function makeCasePacket(claim, settlement, x402Response=null) {
  if(settlement?.result!=='BASE_USDC_TRANSFER_VERIFIED'||
     settlement.txHash!==claim.txHash||settlement.network!==claim.network||
     settlement.asset!==claim.asset||settlement.payer!==claim.payer||
     settlement.payee!==claim.payee||settlement.amountAtomic!==claim.amountAtomic) {
    throw Error('Independent Base payment verification required to prepare a case');
  }
  if(x402Response && (x402Response.result!=='X402_RESPONSE_MATCHED'||x402Response.txHash!==claim.txHash))throw Error('Mismatched x402 response');
  const id=caseIdForClaim(claim);
  return {
    caseId:id,network:claim.network,amountAtomic:claim.amountAtomic,
    token:claim.asset,payer:claim.payer,payee:claim.payee,txHash:claim.txHash,
    endpoint:claim.endpoint,terms:claim.terms,delivery:claim.delivery,evidence:claim.evidence,
    settlement, x402ReceiptMatched:Boolean(x402Response),
    status:'PREPARED_NOT_FILED',
    verdict:'UNVERIFIED',
    warning:'Off-chain delivery/evidence remain disputed claims until GenLayer adjudication. No escrow or automatic refund.',
  };
}


/**
 * Discover the single exact official USDC Transfer in a Base transaction,
 * and re-verify that claim independently. READ ONLY: no settlement, no signing.
 * Ambiguous token transfers fail closed rather than auto-filling the wrong payer.
 */
export async function inspectBaseUSDCTransfer({network,txHash},
  {rpcUrl,fetchImpl=fetch,requiredConfirmations=2}={}){
  if(!NETWORKS[network])throw Error('Unsupported payment chain');
  if(typeof txHash!=='string'||!HASH.test(txHash))throw Error('Invalid txHash');
  const normalizedHash=txHash.toLowerCase();
  const asset=NETWORKS[network].usdc;
  const endpoint=requireHttpsEndpoint(rpcUrl);
  let count=0;
  async function rpc(method,params=[]){
    const response=await fetchImpl(endpoint,{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:++count,method,params})
    });
    if(!response.ok)throw Error('RPC HTTP unavailable');
    const body=await response.json();
    if(body?.error||body?.result===undefined)throw Error('RPC response unavailable');
    return body.result;
  }
  const chainId=parseHexQuantity(await rpc('eth_chainId'),'chainId');
  if(chainId!==BigInt(NETWORKS[network].chainId))throw Error('RPC network mismatch');
  const receipt=await rpc('eth_getTransactionReceipt',[normalizedHash]);
  if(!receipt||String(receipt.transactionHash||'').toLowerCase()!==normalizedHash)
    throw Error('Transaction receipt unavailable or mismatched');
  if(parseHexQuantity(receipt.status,'status')!==1n)throw Error('Transaction reverted');
  const candidates=(Array.isArray(receipt.logs)?receipt.logs:[]).filter(log=>
    typeof log?.address==='string'&&log.address.toLowerCase()===asset &&
    Array.isArray(log.topics)&&log.topics.length===3 &&
    String(log.topics[0]).toLowerCase()===TRANSFER_TOPIC &&
    topicAddress(log.topics[1])&&topicAddress(log.topics[2]) &&
    typeof log.data==='string'&&/^0x[0-9a-f]{64}$/i.test(log.data)
  );
  if(candidates.length!==1)throw Error('Ambiguous or absent official USDC Transfer; cannot auto-fill');
  const log=candidates[0];
  const amountAtomic=BigInt(log.data).toString();
  if(BigInt(amountAtomic)===0n||BigInt(amountAtomic)>MAX_ATOMIC)
    throw Error('Payment amount exceeds fixed 0.10 USDC safety cap');
  const claim={network,txHash:normalizedHash,asset,
    payer:topicAddress(log.topics[1]),
    payee:topicAddress(log.topics[2]),amountAtomic};
  const proof=await verifyBaseUSDCTransfer(claim,{rpcUrl,fetchImpl,requiredConfirmations});
  return Object.freeze({
    result:'BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED',
    ...claim,blockNumber:proof.blockNumber,confirmations:proof.confirmations,
    transferLogIndex:proof.transferLogIndex,
    warning:'This proves an official USDC Transfer only, not x402 causation, API delivery, claimant rights or refunds.'
  });
}
