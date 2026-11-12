import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {claimFromOneTakePacket,ONE_TAKE_TX,ONE_TAKE_CASE} from '../web/restore-packet.js';

const packet={
  caseId:ONE_TAKE_CASE,txHash:ONE_TAKE_TX,network:'eip155:84532',
  amountAtomic:'10000',payer:'0x4c7cb73ac8f8999af21cfc9ff4cf2333a9508dcb',
  payee:'0xe3837fe309618ae075dbef0a20735c0615a308e6',
  token:'0x036cbd53842c5426634e7929541ec2318f3dcf7e',
  endpoint:'https://x402.payai.network/api/base-sepolia/paid-content',
  terms:'Original agreed requirements',delivery:'Paid HTTP 200 with nonempty body',
  evidence:'On-chain receipt and response hash',
  settlement:{result:'BASE_USDC_TRANSFER_VERIFIED'},status:'PREPARED_NOT_FILED'
};
test('one-take recovery extracts public claim without trusting supplied settlement status',()=>{
  const claim=claimFromOneTakePacket(packet);
  assert.equal(claim.txHash,ONE_TAKE_TX);
  assert.equal(claim.terms,packet.terms);
  assert.equal(claim.settlement,undefined);
  assert.equal(claim.status,undefined);
  assert.equal(claim.paymentResponseHeader,undefined);
});
test('one-take restoration refuses old cases, changed scope or empty evidence',()=>{
  const variants=[
    {...packet,caseId:'pj_9f2276fd1904120b16d5f5b6ea5f7a2b'},
    {...packet,txHash:'0x6edc3d9a0589f22e55ca4f348bc021df70b5644b437fef054099391fae798ae2'},
    {...packet,network:'eip155:8453'},
    {...packet,amountAtomic:'20000'},
    {...packet,payer:'0x'+'0'.repeat(40)},
    {...packet,payee:'0x'+'0'.repeat(40)},
    {...packet,token:'0x'+'0'.repeat(40)},
    {...packet,endpoint:'https://untrusted.example/'},
    {...packet,terms:''},
    {...packet,evidence:'x'.repeat(2501)}
  ];
  for(const invalid of variants)
    assert.throws(()=>claimFromOneTakePacket(invalid));
});
test('browser recovery is explicitly read-only and rechecks case identity',async()=>{
  const app=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
  const html=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  assert.match(html,/id="v2-import-packet"/);
  assert.match(html,/id="v2-import-verify"/);
  assert.match(app,/claimFromOneTakePacket\(saved\)/);
  assert.match(app,/fetch\('\/api\/verify'/);
  assert.match(app,/checked\.caseId!==ONE_TAKE_CASE/);
  assert.match(app,/updateV2PreparedPacket\(checked\)/);
  assert.doesNotMatch(app,/fetch\('\/api\/v2\/x402\/execute'.*v2-import/);
});
