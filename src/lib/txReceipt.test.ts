import { describe, it, expect } from 'vitest';
import { MockNetworkProvider, SignatureTemplate } from 'cashscript';
import { encodeCashAddress, hash160, secp256k1 } from '@bitauth/libauth';
import { buildWcTransaction } from './buildTx';
import { planPayment } from './plan';
import type { Invoice } from './invoice';
import { addr } from './testAddresses';
import { checkTxAgainstInvoice, isAlreadyKnownError, parseTx, txidOf } from './txReceipt';

const priv = new Uint8Array(32).fill(7);
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const buyer = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(pub) }).address;
const invoice: Invoice = { v: 1, payee: addr('bchtest', 1), sats: 5000, memo: 'Logo design', currency: 'BCH' };

const plan = planPayment({
  buyerUtxos: [{ txid: '22'.repeat(32), vout: 0, satoshis: 30_000n }],
  invoice,
  buyerAddress: buyer,
  feeRate: 1,
  network: 'chipnet',
});
const { hex } = buildWcTransaction(plan, {
  provider: new MockNetworkProvider(),
  buyerAddress: buyer,
  unlocker: () => new SignatureTemplate(priv).unlockP2PKH(),
});

describe('parseTx', () => {
  const tx = parseTx(hex, 'chipnet');

  it('finds the receipt NFT with the planned category and commitment', () => {
    const nfts = tx.outputs.filter((o) => o.nft);
    expect(nfts).toHaveLength(1);
    expect(nfts[0].nft).toEqual({ category: plan.category, capability: 'none', commitment: plan.commitment });
    expect(nfts[0].address).toMatch(/^bchtest:z/);
  });

  it('decodes addresses and values', () => {
    expect(tx.outputs[0].address).toBe(invoice.payee);
    expect(tx.outputs[0].sats).toBe(5000n);
  });

  it('txid is 64 hex and stable', () => {
    expect(tx.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(txidOf(hex)).toBe(tx.txid);
  });

  it('rejects junk', () => {
    expect(() => parseTx('zz', 'chipnet')).toThrow(/hex/);
    expect(() => parseTx('00', 'chipnet')).toThrow(/decode/);
  });
});

describe('checkTxAgainstInvoice', () => {
  const tx = parseTx(hex, 'chipnet');

  it('matches the invoice the tx was built for', () => {
    expect(checkTxAgainstInvoice(tx, invoice)).toEqual({ expectedCommitment: plan.commitment, commitmentMatches: true, payeePaid: true });
  });

  it('flags a different invoice (memo changed) and an underpaid one', () => {
    expect(checkTxAgainstInvoice(tx, { ...invoice, memo: 'Other' }).commitmentMatches).toBe(false);
    const bigger = checkTxAgainstInvoice(tx, { ...invoice, sats: 6000 });
    expect(bigger.payeePaid).toBe(false);
    expect(bigger.commitmentMatches).toBe(false);
  });

  it('payee match is by locking script (token-aware address of the same key also counts)', () => {
    const tokenPayee = addr('bchtest', 1, 'p2pkhWithTokens');
    expect(checkTxAgainstInvoice(tx, { ...invoice, payee: tokenPayee }).payeePaid).toBe(true);
  });
});

describe('isAlreadyKnownError', () => {
  it.each(['txn-already-known', 'Transaction already in block chain', 'the transaction was rejected by network rules.\n\ntxn-already-in-mempool'])(
    'treats %s as already broadcast',
    (m) => expect(isAlreadyKnownError(m)).toBe(true),
  );
  it('does not swallow real errors', () => {
    expect(isAlreadyKnownError('mandatory-script-verify-flag-failed')).toBe(false);
    expect(isAlreadyKnownError('bad-txns-inputs-missingorspent')).toBe(false);
  });
});
