import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateClaim,verifyBaseUSDCTransfer,inspectBaseUSDCTransfer,decodeX402PaymentResponse,makeCasePacket} from './payment.mjs';
import {trackFiledCase} from './case-tracker.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const MAX_BODY=18000;
const V1_ADDRESS='0xd57a04c3cc304ab30c9435a9ae34a840802f11c8';
const v2Configured=address=>/^0x[0-9a-f]{40}$/i.test(address||'')&&address.toLowerCase()!==V1_ADDRESS;
function respond(res,status,data) {
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
  res.end(JSON.stringify(data));
}
async function jsonBody(req) {
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
async function v2DefaultReader({address,functionName,args}){
  const client=await genlayerReadClient();
  return client.readContract({address,functionName,args});
}
async function v2DefaultTxReader({hash}){
  const client=await genlayerReadClient();
  return client.getTransaction({hash});
}
function summarizeV2ReadOnlyTx(tx,hash){
  const status=String(tx?.statusName||'UNKNOWN').toUpperCase();
  const execution=String(tx?.txExecutionResultName||'UNKNOWN').toUpperCase();
  const normalizedExecution=execution.replace(/[^A-Z]/g,'');
  const resultCode=typeof tx?.txExecutionResult==='bigint'?
    Number(tx.txExecutionResult):tx?.txExecutionResult;
  const finalized=status==='FINALIZED';
  return {hash,status,execution,finalized,
    success:finalized&&(normalizedExecution==='FINISHEDWITHRETURN'||resultCode===1),
    note:'GenLayer transaction lookup is read-only. No retries or writes performed.'};
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
  let data=await client.readContract({address,functionName:'get_case',args:[caseId]});
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
export function createServer({rpcUrl=process.env.BASE_RPC_URL,port=4173,
  caseReader=readGenLayerCaseRecord,verifyTransfer=verifyBaseUSDCTransfer,
  v2Reader=v2DefaultReader,v2TxReader=v2DefaultTxReader}={}) {
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    try {
      if(req.method==='GET'&&url.pathname==='/api/status'){
        const contract=process.env.GENLAYER_CONTRACT_ADDRESS;
        const v2=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        respond(res,200,{name:'PAYJURY',mode:'evidence-first',
          paymentVerifierConfigured:Boolean(rpcUrl),genlayerReadConfigured:/^0x[0-9a-f]{40}$/i.test(contract||''),
          genlayerContractAddress:/^0x[0-9a-f]{40}$/i.test(contract||'')?contract:null,
          genlayerV2ContractAddress:v2Configured(v2)?v2:null,
          v2FilingEnabled:v2Configured(v2),
          acceptsPayments:false,signsGenLayerWrites:false});return;
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
        }catch{
          respond(res,503,{error:'GenLayer V2 RPC read unavailable. No wallet transaction was attempted.'});
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
          if(tx?.hash&&String(tx.hash).toLowerCase()!==hash.toLowerCase()){
            respond(res,503,{error:'GenLayer transaction hash mismatch; state unverified'});return;
          }
          respond(res,200,summarizeV2ReadOnlyTx(tx,hash));
        }catch{
          respond(res,503,{error:'GenLayer V2 transaction lookup unavailable. Do not resubmit.'});
        }
        return;
      }
      if(req.method==='GET'&&url.pathname==='/api/inspect'){
        if(!rpcUrl){respond(res,503,{error:'BASE_RPC_URL not configured; inspection unavailable'});return;}
        const network=url.searchParams.get('network')||'';
        const txHash=url.searchParams.get('txHash')||'';
        const found=await inspectBaseUSDCTransfer({network,txHash},{rpcUrl});
        respond(res,200,found);return;
      }
      if(req.method==='POST'&&url.pathname==='/api/verify'){
        const body=await jsonBody(req);
        const claim=validateClaim(body);
        if(!rpcUrl){respond(res,503,{error:'BASE_RPC_URL not configured; no payment verification attempted'});return;}
        const settlement=await verifyBaseUSDCTransfer(claim,{rpcUrl});
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
          const tracked=await trackFiledCase(caseId,{readCase:id=>caseReader(id,address),verifyTransfer,rpcUrl});
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
      if(req.method==='GET'&&['/','/app.js','/styles.css','/studio-wallet.bundle.js'].includes(url.pathname)){
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
