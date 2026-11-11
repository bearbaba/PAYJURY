"""Offline PAYJURY V2 contract security tests. No GenLayer RPC, signing or deploy."""
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path

class FakeTree(dict):
    @classmethod
    def __class_getitem__(cls, _):
        return cls

class FakeReturn:
    def __init__(self, calldata):
        self.calldata = calldata

class MockVM:
    UserError = type("UserError", (Exception,), {})
    Return = FakeReturn

    def run_nondet_unsafe(self, judge, validator):
        answer=judge()
        if not validator(FakeReturn(answer)):
            raise self.UserError("Validator dissent")
        return answer

class FakePublic:
    def write(self, fn): return fn
    def view(self, fn): return fn

class FakeGL:
    Contract = object
    public = FakePublic()
    vm = MockVM()
    message = types.SimpleNamespace(sender_address="0x" + "1"*40)
    nondet = types.SimpleNamespace(exec_prompt=lambda prompt, response_format: {
        "verdict": "ACCEPT", "reason": "Independent reviewer confirms only a narrow delivery receipt."
    })

module=types.ModuleType("genlayer")
module.gl=FakeGL
module.TreeMap=FakeTree
module.allow_storage=lambda obj:obj
sys.modules["genlayer"]=module

file=Path(__file__).resolve().parents[1]/"contracts"/"PayJuryV2.py"
spec=importlib.util.spec_from_file_location("payjury_v2_under_test",file)
contract=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=contract
spec.loader.exec_module(contract)

PAYER="0x"+"1"*40
DELEGATE="0x"+"2"*40
STRANGER="0x"+"3"*40
PAYEE="0x"+"4"*40
ASSET="0x036cbd53842c5426634e7929541ec2318f3dcf7e"
HASH="0x"+"a"*64
NETWORK="eip155:84532"
ENDPOINT="https://api.example.com/paid"
TERMS="Provide requested items"
DELIVERY="Three API items arrived"
EVIDENCE="Client-recorded HTTP body SHA-256 and payment receipt"

def args(**updates):
    data=dict(network=NETWORK,tx_hash=HASH,asset=ASSET,payer=PAYER,
        payee=PAYEE,amount_atomic="10000",endpoint=ENDPOINT,
        terms=TERMS,delivery=DELIVERY,evidence=EVIDENCE)
    data.update(updates)
    data["case_id"]=contract._canonical_id(data["network"],data["asset"],
        data["tx_hash"],data["amount_atomic"],data["payer"],data["payee"],
        data["endpoint"],data["terms"],data["delivery"],data["evidence"])
    return data

def make():
    ic=contract.PayJuryV2()
    ic.cases=FakeTree()
    ic.delegations=FakeTree()
    ic.claimed_transfers=FakeTree()
    return ic

class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.ic=make()
        FakeGL.message.sender_address=STRANGER

    def test_non_payer_cannot_file_without_delegation(self):
        with self.assertRaisesRegex(MockVM.UserError, "Payer or authorized delegate"):
            self.ic.file_case(**args())
        self.assertEqual(len(self.ic.cases),0)

    def test_payer_direct_file_once_with_canonical_id(self):
        FakeGL.message.sender_address=PAYER
        packet=args()
        self.ic.file_case(**packet)
        saved=json.loads(self.ic.get_case(packet["case_id"]))
        self.assertEqual(saved["status"],"FILED")
        self.assertEqual(saved["claimant"],PAYER)
        self.assertEqual(saved["verdict"],"PENDING")
        with self.assertRaisesRegex(MockVM.UserError, "Case exists"):
            self.ic.file_case(**packet)

    def test_payer_delegation_revocation_no_false_authorization(self):
        FakeGL.message.sender_address=PAYER
        self.ic.set_delegate(DELEGATE,True)
        self.assertTrue(self.ic.can_file_for(PAYER,DELEGATE))
        self.assertFalse(self.ic.can_file_for(PAYER,STRANGER))
        FakeGL.message.sender_address=DELEGATE
        self.ic.file_case(**args())
        self.assertEqual(self.ic.cases[args()["case_id"]].claimant,DELEGATE)
        FakeGL.message.sender_address=PAYER
        self.ic.set_delegate(DELEGATE,False)
        self.assertFalse(self.ic.can_file_for(PAYER,DELEGATE))
        FakeGL.message.sender_address=DELEGATE
        with self.assertRaisesRegex(MockVM.UserError,"Payer or authorized delegate"):
            self.ic.file_case(**args(tx_hash="0x"+"b"*64))

    def test_delegate_cannot_authorize_itself_for_another_payer(self):
        FakeGL.message.sender_address=STRANGER
        self.ic.set_delegate(DELEGATE,True)
        self.assertFalse(self.ic.can_file_for(PAYER,DELEGATE))
        self.assertTrue(self.ic.can_file_for(STRANGER,DELEGATE))

    def test_altered_case_id_fails(self):
        FakeGL.message.sender_address=PAYER
        altered=args()
        altered["case_id"]="pj_"+"f"*32
        with self.assertRaisesRegex(MockVM.UserError,"Noncanonical case ID"):
            self.ic.file_case(**altered)

    def test_same_paid_transfer_cannot_be_reused_with_modified_evidence(self):
        FakeGL.message.sender_address=PAYER
        self.ic.file_case(**args())
        with self.assertRaisesRegex(MockVM.UserError,"payment already has a case"):
            self.ic.file_case(**args(evidence=EVIDENCE+" altered"))

    def test_wrong_asset_rejected(self):
        FakeGL.message.sender_address=PAYER
        with self.assertRaisesRegex(MockVM.UserError,"official Base Sepolia USDC"):
            self.ic.file_case(**args(asset="0x"+"9"*40))

    def test_filing_status_safe_for_repeat_payment(self):
        packet=args()
        self.assertEqual(self.ic.filing_status(packet["case_id"], NETWORK,HASH,ASSET,
            PAYER,PAYEE,"10000",STRANGER),"NOT_AUTHORIZED")
        FakeGL.message.sender_address=PAYER
        self.assertEqual(self.ic.filing_status(packet["case_id"], NETWORK,HASH,ASSET,
            PAYER,PAYEE,"10000",PAYER),"READY_REQUIRES_BASE_PROOF")
        self.ic.file_case(**packet)
        self.assertEqual(self.ic.filing_status(packet["case_id"], NETWORK,HASH,ASSET,
            PAYER,PAYEE,"10000",PAYER),"CASE_EXISTS")

    def test_stranger_cannot_adjudicate_and_buyer_can(self):
        FakeGL.message.sender_address=PAYER
        packet=args()
        self.ic.file_case(**packet)
        FakeGL.message.sender_address=STRANGER
        with self.assertRaisesRegex(MockVM.UserError,"Claimant or payer"):
            self.ic.adjudicate_case(packet["case_id"])
        FakeGL.message.sender_address=PAYER
        self.ic.adjudicate_case(packet["case_id"])
        decision=json.loads(self.ic.get_case(packet["case_id"]))
        self.assertEqual(decision["status"],"DECIDED")
        self.assertEqual(decision["verdict"],"ACCEPT")
        with self.assertRaisesRegex(MockVM.UserError,"Already decided"):
            self.ic.adjudicate_case(packet["case_id"])

if __name__=="__main__":
    unittest.main(verbosity=2)
