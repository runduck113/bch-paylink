import { describe, it, expect } from 'vitest';
import { planPayment, planPrep, PlanError, type BuyerUtxo } from './plan';
import { invoiceCommitment } from './receipt';
import type { Invoice } from './invoice';
import { addr } from './testAddresses';

const buyer = addr('bchtest', 9);
const invoice: Invoice = { v: 1, payee: addr('bchtest', 1), sats: 5000, memo: 'test', currency: 'BCH' };
const tx = (c: string) => c.repeat(64);
const utxo = (c: string, vout: number, sats: number): BuyerUtxo => ({ txid: tx(c), vout, satoshis: BigInt(sats) });
const plan = (utxos: BuyerUtxo[], feeRate = 1) =>
  planPayment({ buyerUtxos: utxos, invoice, buyerAddress: buyer, feeRate, network: 'chipnet' });

function planError(fn: () => unknown): PlanError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(PlanError);
    return e as PlanError;
  }
  throw new Error('expected PlanError');
}

// Sizes: P2PKH input 148 (worst case), P2PKH output 34, receipt NFT output 89 (55-byte token prefix + 25),
// overhead 10. Receipt dust = 444 + 3*89 = 711.
describe('planPayment maths', () => {
  it('pays payee, mints receipt to buyer, returns change', () => {
    const p = plan([utxo('a', 0, 10_000)]);
    expect(p.size).toBe(315);
    expect(p.fee).toBe(315n);
    expect(p.outputs.map((o) => o.role)).toEqual(['payee', 'receipt', 'change']);
    expect(p.outputs[0]).toMatchObject({ to: invoice.payee, sats: 5000n });
    expect(p.outputs[1].sats).toBe(711n);
    expect(p.outputs[2]).toMatchObject({ to: buyer, sats: 10_000n - 5000n - 711n - 315n });
  });

  it('receipt NFT: category = input 0 txid, commitment = invoice hash, sent to token-aware buyer address', () => {
    const p = plan([utxo('a', 0, 10_000)]);
    const r = p.outputs[1];
    expect(r.to).toBe(addr('bchtest', 9, 'p2pkhWithTokens'));
    expect(r.token).toEqual({ category: tx('a'), amount: 0n, nft: { capability: 'none', commitment: invoiceCommitment(invoice) } });
    expect(p.category).toBe(tx('a'));
  });

  it('drops change below dust into the fee', () => {
    const p = plan([utxo('a', 0, 6500)]);
    expect(p.outputs.map((o) => o.role)).toEqual(['payee', 'receipt']);
    expect(p.fee).toBe(6500n - 5000n - 711n);
    expect(p.size).toBe(281);
  });

  it('scales the fee with feeRate', () => {
    expect(plan([utxo('a', 0, 10_000)], 2).fee).toBe(630n);
  });

  it('balances: inputs = outputs + fee', () => {
    const p = plan([utxo('a', 0, 3000), utxo('b', 2, 4000), utxo('c', 1, 900)]);
    const ins = p.inputs.reduce((s, u) => s + u.satoshis, 0n);
    const outs = p.outputs.reduce((s, o) => s + o.sats, 0n);
    expect(ins).toBe(outs + p.fee);
  });

  it('throws a readable error with the shortfall when funds are insufficient', () => {
    const e = planError(() => plan([utxo('a', 0, 5900)]));
    expect(e.code).toBe('INSUFFICIENT_FUNDS');
    expect(e.message).toMatch(/92 sats/);
  });

  it('treats an empty wallet as insufficient funds', () => {
    expect(planError(() => plan([])).code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('planPayment genesis input rule', () => {
  it('moves a vout-0 UTXO to input 0, then adds largest-first', () => {
    const p = plan([utxo('a', 1, 50_000), utxo('b', 3, 20_000), utxo('c', 0, 1000)]);
    expect(p.inputs[0]).toMatchObject({ txid: tx('c'), vout: 0 });
    expect(p.inputs[1].txid).toBe(tx('a'));
    expect(p.inputs).toHaveLength(2);
    expect(p.category).toBe(tx('c'));
  });

  it('prefers the largest vout-0 UTXO as genesis input', () => {
    const p = plan([utxo('a', 0, 2000), utxo('b', 0, 30_000)]);
    expect(p.inputs.map((u) => u.txid)).toEqual([tx('b')]);
  });

  it('errors with NO_GENESIS_UTXO when no spendable vout-0 UTXO exists', () => {
    const e = planError(() => plan([utxo('a', 1, 50_000)]));
    expect(e.code).toBe('NO_GENESIS_UTXO');
    expect(e.message).toMatch(/output 0/i);
  });

  it('never spends token-carrying UTXOs (would burn tokens)', () => {
    const tokenUtxo: BuyerUtxo = { ...utxo('d', 0, 100_000), token: { category: tx('e'), amount: 5n } };
    const p = plan([tokenUtxo, utxo('a', 0, 10_000)]);
    expect(p.inputs.map((u) => u.txid)).toEqual([tx('a')]);
    expect(planError(() => plan([tokenUtxo])).code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('planPayment input checks', () => {
  it('rejects an invalid invoice', () => {
    const e = planError(() =>
      planPayment({ buyerUtxos: [utxo('a', 0, 10_000)], invoice: { ...invoice, sats: 10 }, buyerAddress: buyer, feeRate: 1, network: 'chipnet' }),
    );
    expect(e.code).toBe('INVALID_INVOICE');
    expect(e.message).toMatch(/546/);
  });

  it('rejects a buyer address from another network or non-P2PKH', () => {
    const run = (b: string) => () =>
      planPayment({ buyerUtxos: [utxo('a', 0, 10_000)], invoice, buyerAddress: b, feeRate: 1, network: 'chipnet' });
    expect(planError(run(addr('bitcoincash', 9))).code).toBe('INVALID_BUYER');
    expect(planError(run('bchtest:nonsense')).code).toBe('INVALID_BUYER');
  });

  it('rejects a feeRate below 1 sat/byte', () => {
    expect(() => plan([utxo('a', 0, 10_000)], 0.5)).toThrow(/fee rate/i);
  });
});

describe('planPrep (self-send to create a vout-0 UTXO)', () => {
  it('consolidates spendable UTXOs into one output 0 to the buyer', () => {
    const p = planPrep({ buyerUtxos: [utxo('a', 1, 5000), utxo('b', 2, 3000)], buyerAddress: buyer, feeRate: 1, network: 'chipnet' });
    expect(p.inputs).toHaveLength(2);
    expect(p.size).toBe(340);
    expect(p.outputs).toEqual([{ role: 'prep', to: buyer, sats: 8000n - 340n }]);
    expect(p.fee).toBe(340n);
  });

  it('errors when the result would be dust', () => {
    expect(planError(() => planPrep({ buyerUtxos: [utxo('a', 1, 700)], buyerAddress: buyer, feeRate: 1, network: 'chipnet' })).code).toBe(
      'INSUFFICIENT_FUNDS',
    );
  });
});
