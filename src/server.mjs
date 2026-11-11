import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateClaim,verifyBaseUSDCTransfer,inspectBaseUSDCTransfer,decodeX402PaymentResponse,makeCasePacket} from './payment.mjs';
import {trackFiledCase} from './case-tracker.mjs';
import {serveV2X402} from './v2-x402-relay.mjs';
import {createHostedOneShotLock,validUpstashConfig,LIVE_PAYMENT_SESSION} from './hosted-payment-lock.mjs';
import {restoreAcceptedV2Case} from './v2-known-case.mjs';
import {summarizeV2ReadOnlyTx} from './genlayer-v2-tx-outcome.mjs';
import {isGenLayerOverlongRlpError} from './v2-raw-read.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const MAX_BODY=18000;
const V1_ADDRESS='0xd57a04c3cc304ab30c9435a9ae34a840802f11c8';
const v2Configured=address=>/^0x[0-9a-f]{40}$/i.test(address||'')&&address.toLowerCase()!==V1_ADDRESS;
// Hosted purchases are opt-in, capped to one exact signed 0.01 test-USDC
// transaction, and disabled unless the Redis SET NX lock is configured.
const hostedCheckoutReady=()=>Boolean(process.env.VERCEL)&&
  process.env.PAYJURY_NEW_CHECKOUT_ENABLED==='1'&&validUpstashConfig();
function respond(res,status,data) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
  res.end(JSON.stringify(data));
}
async function jsonBody(req) {
  // Vercel's Node adapter may pre-parse POST bodies. Keep the same strict
  // validation as the raw local Node stream, without consuming it twice.
  if(req.body!==undefined){
    const serialized=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(Buffer.byteLength(serialized)>MAX_BODY)throw Error('Request exceeds size limit');
    try{return JSON.parse(serialized);}catch{throw Error('Invalid JSON request');}
  }
  let size=0,chunks=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>MAX_BODY)throw Error('Request exceeds size limit');
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Error('Invalid JSON request');}
}
// Strict, read-only GenLayer V2 proxy. Browser CSP and CORS must not prevent
// checking version/rights; the server has NO funded account and NO write route.
const V2_READ_METHODS=new Set(['version','can_file_for','filing_status','get_case']);
const EVM_ADDRESS=/^0x[0-9a-f]{40}$/i;
const EVM_HASH=/^0x[0-9a-f]{64}$/i;
const CASE_ID=/^pj_[0-9a-f]{32}$/;
const V2_NETWORKS=new Set(['eip155:84532','eip155:8453']);
function checkV2Read(method,args){
  if(!V2_READ_METHODS.has(method)||!Array.isArray(args))
    throw Error('Unsupported GenLayer V2 read method');
  const addr=value=>typeof value==='string'&&EVM_ADDRESS.test(value);
  const hash=value=>typeof value==='string'&&EVM_HASH.test(value);
  const network=value=>typeof value==='string'&&V2_NETWORKS.has(value);
  const amount=value=>typeof value==='string'&&/^[1-9][0-9]{0,5}$/.test(value)&&Number(value)<=100000;
  const valid=method==='version'?args.length===0:
    method==='get_case'?args.length===1&&CASE_ID.test(args[0]):
    method==='can_file_for'?args.length===4&&addr(args[0])&&network(args[1])&&hash(args[2])&&addr(args[3]):
    args.length===8&&CASE_ID.test(args[0])&&network(args[1])&&hash(args[2])&&
      addr(args[3])&&addr(args[4])&&addr(args[5])&&amount(args[6])&&addr(args[7]);
  if(!valid)throw Error('Invalid GenLayer V2 read arguments');
}
async function genlayerReadClient(){
  const [{createClient,createAccount},{studionet}]=await Promise.all([
    import('genlayer-js'),import('genlayer-js/chains')]);
  if(studionet.id!==61999)throw Error('Unexpected GenLayer network');
  // Deterministic dummy account is ONLY for SDK readContract compatibility.
  // Never provide any server-side wallet account to writeContract.
  return createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
}
// Security-sensitive PAYJURY case/permission reads must use finalized,
// durable contract state. GenLayerJS otherwise defaults to LATEST_NONFINAL.
export async function readV2Finalized(client,{address,functionName,args},variant='latest-final'){
  if(variant!=='latest-final')throw Error('V2 finalized read requires latest-final');
  return client.readContract({address,functionName,args,transactionHashVariant:variant});
}
async function v2DefaultReader({address,functionName,args}){
  const client=await genlayerReadClient();
  // Normal GenLayerJS finalized reads are authoritative. Raw calldata
  // workaround was tested LIVE and the VM rejected it: do not rely on it
  // in transaction gating. Instead clearly classify the known upstream bug.
  return readV2Finalized(client,{address,functionName,args});
}
async function v2DefaultTxReader({hash}){
  const client=await genlayerReadClient();
  return client.getTransaction({hash});
}
async function readGenLayerCaseRecord(caseId, contractAddress=process.env.GENLAYER_CONTRACT_ADDRESS) {
  if(!/^pj_[0-9a-f]{32}$/.test(caseId))throw Error('Invalid case ID');
  const address=contractAddress;
  if(!/^0x[0-9a-f]{40}$/i.test(address||''))throw Error('GenLayer readback not configured');
  const [{createClient,createAccount},{studionet}]=await Promise.all([
    import('genlayer-js'),import('genlayer-js/chains')]);
  if(studionet.id!==61999)throw Error('Unexpected Studionet chain ID');
  // A deterministic, non-funded dummy account is used only to satisfy SDK reads.
  // Never permit a server-side signing key in this endpoint.
  const client=createClient({chain:studionet,account:createAccount('0x'+'11'.repeat(32))});
  let data=await readV2Finalized(client,{address,functionName:'get_case',args:[caseId]});
  if(typeof data==='string')data=JSON.parse(data);
  if(data?.case_id!==caseId||!['FILED','DECIDED'].includes(data?.status))throw Error('GenLayer readback not verified');
  return data;
}
async function readGenLayerCase(caseId) {
  const data=await readGenLayerCaseRecord(caseId);
  return {caseId,status:data.status,verdict:data.status==='DECIDED'?data.verdict:null,
    reason:data.status==='DECIDED'?data.reason:null,
    txHash:data.tx_hash, network:data.network,
    evidenceStatus:'CONTRACT_READBACK_ONLY_TX_FINALITY_NOT_INDEPENDENTLY_AUDITED',
    note:'Receipt finality and on-chain payment verification require separate checks.'};
}
export function createServer({rpcUrl=process.env.BASE_RPC_URL,
  mainnetRpcUrl=process.env.BASE_MAINNET_RPC_URL,port=4173,
  caseReader=readGenLayerCaseRecord,verifyTransfer=verifyBaseUSDCTransfer,
  inspectTransfer=inspectBaseUSDCTransfer,
  v2Reader=v2DefaultReader,v2TxReader=v2DefaultTxReader}={}) {
  // Base RPCs MUST be network-specific. A Sepolia RPC cannot verify Base mainnet.
  // Never silently fall back to the wrong chain or a paid API.
  const rpcForNetwork=network=>network==='eip155:84532'?rpcUrl:
    network==='eip155:8453'?mainnetRpcUrl:null;
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    try {
      if(req.method==='GET'&&url.pathname==='/api/status'){
        const contract=process.env.GENLAYER_CONTRACT_ADDRESS;
        const v2=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        respond(res,200,{name:'PAYJURY',mode:'evidence-first',
          paymentVerifierConfigured:Boolean(rpcUrl||mainnetRpcUrl),
          baseSepoliaRpcConfigured:Boolean(rpcUrl),baseMainnetRpcConfigured:Boolean(mainnetRpcUrl),
          genlayerReadConfigured:/^0x[0-9a-f]{40}$/i.test(contract||''),
          genlayerContractAddress:/^0x[0-9a-f]{40}$/i.test(contract||'')?contract:null,
          genlayerV2ContractAddress:v2Configured(v2)?v2:null,
          v2FilingEnabled:v2Configured(v2),
          acceptsPayments:hostedCheckoutReady(),
          hostedReadOnly:Boolean(process.env.VERCEL)&&!hostedCheckoutReady(),
          newPaymentEnabled:hostedCheckoutReady(),newPaymentSession:LIVE_PAYMENT_SESSION,
          signsGenLayerWrites:false});return;
      }
      // ONE already-paid case restored from owner-supplied immutable evidence.
      // NO x402 PAYMENT-SIGNATURE, no wallet, no GenLayer writes or local lock reset.
      if(req.method==='GET'&&url.pathname==='/api/v2/resume-known'){
        if(!v2Configured(process.env.GENLAYER_V2_CONTRACT_ADDRESS)){
          respond(res,503,{error:'V2 contract is not configured; recovery unavailable'});return;
        }
        const selectedRpc=rpcForNetwork('eip155:84532');
        if(!selectedRpc){
          respond(res,503,{error:'Base Sepolia RPC unavailable; cannot reverify existing payment'});return;
        }
        try{
          const packet=await restoreAcceptedV2Case({verifyTransfer,rpcUrl:selectedRpc});
          respond(res,200,{...packet,restoredReadOnly:true,
            genlayerFileCaseSubmitted:false,genlayerDecisionSubmitted:false,
            note:'Owner-supplied original x402 evidence recovered after fresh Base USDC verification. PREPARED_NOT_FILED is NOT an onchain status; check GenLayer separately.'});
        }catch{
          respond(res,503,{error:'Original Base USDC transfer could not be independently reverified; no paid request or GenLayer write was attempted'});
        }
        return;
      }
      if(['/api/v2/x402/quote','/api/v2/x402/execute','/api/v2/x402/session'].includes(url.pathname)){
        if(!v2Configured(process.env.GENLAYER_V2_CONTRACT_ADDRESS)){
          respond(res,503,{error:'V2 contract not configured; new x402 payment disabled.'});return;
        }
        // Local Codespaces uses its existing durable owner-controlled file lock.
        // Hosted Vercel rejects EVERY purchase until an atomic Redis store
        // and explicit checkout flag are both configured.
        const isHosted=Boolean(process.env.VERCEL);
        if(isHosted&&!hostedCheckoutReady()){
          respond(res,503,{error:'Hosted x402 checkout is locked pending a verified durable idempotency store. No payment forwarded.'});return;
        }
        const lockStore=isHosted?createHostedOneShotLock():null;
        if(url.pathname==='/api/v2/x402/session'){
          if(!lockStore){
            respond(res,503,{error:'Hosted checkout session unavailable; no payment permitted.'});return;
          }
          try{
            const locked=await lockStore.isLocked();
            respond(res,200,{session:LIVE_PAYMENT_SESSION,readOnly:true,
              paymentEnabled:!locked,locked,amountAtomic:'10000',
              network:'eip155:84532',oneShot:true});
          }catch{
            respond(res,503,{error:'Cannot independently check checkout lock. No payment is permitted.'});
          }
          return;
        }
        await serveV2X402({req,res,rpcUrl,lockStore});
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/v2/read'){
        const address=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        if(!v2Configured(address)){
          respond(res,503,{error:'PAYJURY V2 contract not configured; wallet actions remain disabled.'});return;
        }
        const method=url.searchParams.get('method')||'';
        const raw=url.searchParams.get('args')||'';
        if(raw.length>1200){respond(res,422,{error:'Invalid GenLayer V2 read arguments'});return;}
        let args;
        try{args=JSON.parse(raw);}catch{respond(res,422,{error:'Invalid GenLayer V2 read arguments'});return;}
        try{checkV2Read(method,args);}
        catch{respond(res,422,{error:'Unsupported or invalid GenLayer V2 read request'});return;}
        try{
          const result=await v2Reader({address,functionName:method,args});
          respond(res,200,{address,method,result,readOnly:true});
        }catch(error){
          if(method==='filing_status'&&isGenLayerOverlongRlpError(error)){
            // Existing GenLayer Studio bug #1745: backend cannot parse
            // long read calldata. This is NOT a "READY" response.
            respond(res,503,{
              error:'GenLayer V2 filing_status read blocked by upstream RLP length bug',
              code:'GENLAYER_RLP_255_READ_UNAVAILABLE',
              readOnly:true,filingStatus:'UNVERIFIED',
              noWalletTransactionAttempted:true
            });
          }else{
            respond(res,503,{error:'GenLayer V2 RPC read unavailable. No wallet transaction was attempted.'});
          }
        }
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/v2/tx'){
        const address=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        if(!v2Configured(address)){
          respond(res,503,{error:'PAYJURY V2 contract not configured'});return;
        }
        const hash=url.searchParams.get('hash')||'';
        if(!EVM_HASH.test(hash)){respond(res,422,{error:'Invalid transaction hash'});return;}
        try{
          const tx=await v2TxReader({hash});
          const observedHash=tx?.hash||tx?.txId;
          if(observedHash&&String(observedHash).toLowerCase()!==hash.toLowerCase()){
            respond(res,503,{error:'GenLayer transaction hash mismatch; state unverified'});return;
          }
          respond(res,200,summarizeV2ReadOnlyTx(tx,hash));
        }catch{
          respond(res,503,{error:'GenLayer V2 transaction lookup unavailable. Do not resubmit.'});
        }
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/inspect'){
        const network=url.searchParams.get('network')||'';
        if(!V2_NETWORKS.has(network)){respond(res,422,{error:'Unsupported payment network'});return;}
        const chosenRpc=rpcForNetwork(network);
        if(!chosenRpc){respond(res,503,{error:'Base RPC for selected network not configured; inspection unavailable'});return;}
        const txHash=url.searchParams.get('txHash')||'';
        const found=await inspectTransfer({network,txHash},{rpcUrl:chosenRpc});
        respond(res,200,found);return;
      }
      // Evidence-only acceptance of an EXISTING transfer. Nothing is paid,
      // filed, adjudicated, delegated or signed through this endpoint.
      if(req.method==='GET'&&url.pathname==='/api/v2/candidate'){
        const contract=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        if(!v2Configured(contract)){
          respond(res,503,{error:'V2 contract not configured'});return;
        }
        const network=url.searchParams.get('network')||'';
        const txHash=String(url.searchParams.get('txHash')||'').toLowerCase();
        const claimant=String(url.searchParams.get('claimant')||'').toLowerCase();
        if(!V2_NETWORKS.has(network)||!EVM_HASH.test(txHash)||!EVM_ADDRESS.test(claimant)){
          respond(res,422,{error:'Invalid V2 payment candidate parameters'});return;
        }
        const chosenRpc=rpcForNetwork(network);
        if(!chosenRpc){
          respond(res,503,{error:'Base RPC for selected network not configured'});return;
        }
        let transfer;
        try{
          transfer=await inspectTransfer({network,txHash},{rpcUrl:chosenRpc});
          if(transfer?.result!=='BASE_USDC_TRANSFER_DISCOVERED_AND_VERIFIED'||
            String(transfer.network)!==network||String(transfer.txHash).toLowerCase()!==txHash||
            !EVM_ADDRESS.test(transfer.payer||'')||!EVM_ADDRESS.test(transfer.payee||'')||
            !/^[1-9][0-9]*$/.test(transfer.amountAtomic||'')||
            Number(transfer.amountAtomic)>100000){
            throw Error('Invalid Base USDC transfer verification');
          }
        }catch{
          respond(res,422,{error:'Independent Base USDC transfer verification did not pass'});return;
        }
        try{
          const payer=transfer.payer.toLowerCase();
          const [authorized,filingStatus]=await Promise.all([
            v2Reader({address:contract,functionName:'can_file_for',
              args:[payer,network,txHash,claimant]}),
            // Probe only: inspect transfer use without inventing a real case ID.
            // filing_status checks the scoped transfer key in GenLayer V2.
            v2Reader({address:contract,functionName:'filing_status',
              args:['pj_'+'0'.repeat(32),network,txHash,transfer.asset,
                payer,transfer.payee,transfer.amountAtomic,payer]})
          ]);
          if(typeof authorized!=='boolean'||
             !['READY_REQUIRES_BASE_PROOF','TRANSFER_ALREADY_FILED','CASE_EXISTS'].includes(filingStatus)){
            throw Error('Unexpected V2 readback');
          }
          const unused=filingStatus==='READY_REQUIRES_BASE_PROOF';
          respond(res,200,{
            result:unused&&authorized?'PAYMENT_VERIFIED_V2_FILING_PREFLIGHT_POSSIBLE':
              unused?'PAYMENT_VERIFIED_V2_SIGNER_NOT_AUTHORIZED':'PAYMENT_VERIFIED_BUT_V2_ALREADY_FILED',
            transfer,claimant,claimantAuthorized:authorized,
            v2FilingStatus:filingStatus,unusedInV2:unused,readOnly:true,
            signingPerformed:false,paymentPerformed:false,
            warning:'Base USDC Transfer does not prove API delivery. Payer or on-chain delegate must authorize each real filing; no transaction is sent here.'
          });
        }catch{
          respond(res,503,{error:'V2 authorization or payment reuse state could not be independently read; no filing was attempted'});return;
        }
        return;
      }
      if(req.method==='POST'&&url.pathname==='/api/verify'){
        const body=await jsonBody(req);
        const claim=validateClaim(body);
        const chosenRpc=rpcForNetwork(claim.network);
        if(!chosenRpc){respond(res,503,{error:'Base RPC for selected network not configured; no payment verification attempted'});return;}
        const settlement=await verifyTransfer(claim,{rpcUrl:chosenRpc});
        const matched=body.paymentResponseHeader?
          decodeX402PaymentResponse(body.paymentResponseHeader,claim):null;
        respond(res,200,makeCasePacket(claim,settlement,matched));return;
      }
      if(req.method==='GET'&&url.pathname==='/api/case'){
        const caseId=url.searchParams.get('caseId')||'';
        if(!/^pj_[0-9a-f]{32}$/.test(caseId)){
          respond(res,422,{error:'Invalid case ID'});return;
        }
        const version=url.searchParams.get('version')||'v1';
        if(!['v1','v2'].includes(version)){
          respond(res,422,{error:'Unsupported case contract version'});return;
        }
        const address=version==='v2'?process.env.GENLAYER_V2_CONTRACT_ADDRESS:
          process.env.GENLAYER_CONTRACT_ADDRESS;
        if(version==='v2'&&!v2Configured(address)){
          respond(res,503,{error:'V2 contract not configured. Read-only v1 available.'});return;
        }
        try{
          const tracked=await trackFiledCase(caseId,{readCase:id=>caseReader(id,address),
            verifyTransfer,rpcUrl,selectRpcUrl:rpcForNetwork});
          respond(res,200,{...tracked,contractVersion:version,
            contractAddress:/^0x[0-9a-f]{40}$/i.test(address||'')?address:null});
        }catch{
          respond(res,422,{error:'GenLayer case readback unavailable or invalid. No verdict can be inferred.'});
        }
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/verdict'){
        try{respond(res,200,await readGenLayerCase(url.searchParams.get('caseId')||''));}
        catch{respond(res,422,{error:'GenLayer case not independently readable or not configured. Do not infer a verdict.'});}
        return;
      }
      if(req.method==='GET'&&['/','/app.js','/filing-policy.js','/styles.css','/studio-wallet.bundle.js'].includes(url.pathname)){
        const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
        const content=await readFile(path.join(ROOT,name));
        res.writeHead(200,{'content-type':MIME[path.extname(name)],'x-content-type-options':'nosniff',
          'content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self' https://studio.genlayer.com; object-src 'none'; base-uri 'none'",
          'cache-control':'no-store'});
        res.end(content);return;
      }
      respond(res,404,{error:'Not found'});
    } catch(error){
      const safe=String(error?.message||'Validation error').slice(0,170);
      const known=/^(Invalid|Only|Payment|Transaction|Matching|Ambiguous|Unsupported|HTTPS|x402|RPC |Malformed|Request |Expected|Unparseable)/.test(safe);
      respond(res,known?422:503,{error:known?safe:'Verification unavailable; do not assume payment or verdict success.'});
    }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
  createServer().listen(port,'127.0.0.1',()=>console.log('PAYJURY local demo listening on http://127.0.0.1:'+port+' (read-only; no signing)'));
}
