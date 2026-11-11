import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateClaim,verifyBaseUSDCTransfer,decodeX402PaymentResponse,makeCasePacket} from './payment.mjs';
import {trackFiledCase} from './case-tracker.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../web');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const MAX_BODY=18000;
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
  caseReader=readGenLayerCaseRecord,verifyTransfer=verifyBaseUSDCTransfer}={}) {
  return http.createServer(async(req,res)=>{
    const url=new URL(req.url||'/', 'http://127.0.0.1');
    try {
      if(req.method==='GET'&&url.pathname==='/api/status'){
        const contract=process.env.GENLAYER_CONTRACT_ADDRESS;
        const v2=process.env.GENLAYER_V2_CONTRACT_ADDRESS;
        respond(res,200,{name:'PAYJURY',mode:'evidence-first',
          paymentVerifierConfigured:Boolean(rpcUrl),genlayerReadConfigured:/^0x[0-9a-f]{40}$/i.test(contract||''),
          genlayerContractAddress:/^0x[0-9a-f]{40}$/i.test(contract||'')?contract:null,
          genlayerV2ContractAddress:/^0x[0-9a-f]{40}$/i.test(v2||'')?v2:null,
          v2FilingEnabled:/^0x[0-9a-f]{40}$/i.test(v2||''),
          acceptsPayments:false,signsGenLayerWrites:false});return;
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
        if(version==='v2'&&!/^0x[0-9a-f]{40}$/i.test(address||'')){
          respond(res,503,{error:'V2 contract not configured. Read-only v1 available.'});return;
        }
        try{
          respond(res,200,await trackFiledCase(caseId,{readCase:id=>caseReader(id,address),verifyTransfer,rpcUrl}));
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
          'content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'",
          'cache-control':'no-store'});
        res.end(content);return;
      }
      respond(res,404,{error:'Not found'});
    } catch(error){
      const safe=String(error?.message||'Validation error').slice(0,170);
      const known=/^(Invalid|Only|Payment|Transaction|Matching|Unsupported|HTTPS|x402|RPC |Malformed|Request |Expected|Unparseable)/.test(safe);
      respond(res,known?422:503,{error:known?safe:'Verification unavailable; do not assume payment or verdict success.'});
    }
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4173);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
  createServer().listen(port,'127.0.0.1',()=>console.log('PAYJURY local demo listening on http://127.0.0.1:'+port+' (read-only; no signing)'));
}
