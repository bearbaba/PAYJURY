import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPaymentRequirements,assertPaymentAuthorization,PAYMENT_CAP_ATOMIC} from '../scripts/pay-x402-testnet.mjs';
const payee='0x'+'2'.repeat(40),asset='0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const approved={scheme:'exact',network:'eip155:84532',payTo:payee,asset,amount:PAYMENT_CAP_ATOMIC,extra:{assetTransferMethod:'eip3009'}};
const control={payee,amount:PAYMENT_CAP_ATOMIC,asset};
test('x402 client policy accepts only the exact approved Base Sepolia USDC charge',()=>{
  assert.deepEqual(allowedPaymentRequirements(2,[approved],control),[approved]);
  assert.deepEqual(allowedPaymentRequirements(1,[approved],control),[]);
});
test('x402 client policy blocks price, token, payee, network and transfer-method changes',()=>{
  const alters=[
    {...approved,amount:'10001'}, {...approved,amount:'9999'},
    {...approved,payTo:'0x'+'3'.repeat(40)},
    {...approved,asset:'0x'+'4'.repeat(40)},
    {...approved,network:'eip155:8453'},
    {...approved,scheme:'upto'},
    {...approved,extra:{assetTransferMethod:'permit2'}},
  ];
  for(const alter of alters)assert.equal(allowedPaymentRequirements(2,[alter],control).length,0);
});
test('payment execution requires explicit CLI flag and dedicated key, URL, merchant',()=>{
  const original=process.env.PAYJURY_CONFIRM_ONE_PAYMENT;
  try{
    delete process.env.PAYJURY_CONFIRM_ONE_PAYMENT;
    const config={args:[],endpoint:'https://api.example.com/paid',host:'api.example.com',
      payee,privateKey:'0x'+'1'.repeat(64),rpcUrl:'https://sepolia.base.org'};
    assert.throws(()=>assertPaymentAuthorization(config),/--execute/);
    assert.throws(()=>assertPaymentAuthorization({...config,args:['--execute']}),/authorization/);
    process.env.PAYJURY_CONFIRM_ONE_PAYMENT='I_APPROVE_ONE_TESTNET_X402_PAYMENT';
    assert.throws(()=>assertPaymentAuthorization({...config,args:['--execute'],privateKey:'fake'}),/test wallet/);
    assert.throws(()=>assertPaymentAuthorization({...config,args:['--execute'],payee:'fake'}),/merchant/);
  }finally {
    if(original===undefined)delete process.env.PAYJURY_CONFIRM_ONE_PAYMENT;
    else process.env.PAYJURY_CONFIRM_ONE_PAYMENT=original;
  }
});
