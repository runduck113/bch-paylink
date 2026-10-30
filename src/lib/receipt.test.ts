import { describe, it, expect } from 'vitest';
import { invoiceCommitment, canonicalInvoiceJson } from './receipt';
import { encodeInvoice, decodeInvoice, type Invoice } from './invoice';
import { addr } from './testAddresses';

const inv: Invoice = { v: 1, payee: addr('bitcoincash', 1), sats: 5000, memo: 'hello', currency: 'BCH' };

describe('invoiceCommitment', () => {
  it('is 20 bytes (40 hex chars), within the 40-byte NFT commitment limit', () => {
    const c = invoiceCommitment(inv);
    expect(c).toMatch(/^[0-9a-f]{40}$/);
  });

  it('is deterministic across encode/decode and key order', () => {
    const shuffled = { currency: 'BCH', memo: 'hello', sats: 5000, payee: inv.payee, v: 1 } as Invoice;
    expect(invoiceCommitment(decodeInvoice(encodeInvoice(inv)))).toBe(invoiceCommitment(inv));
    expect(invoiceCommitment(shuffled)).toBe(invoiceCommitment(inv));
  });

  it('changes when any field changes', () => {
    const c = invoiceCommitment(inv);
    expect(invoiceCommitment({ ...inv, sats: 5001 })).not.toBe(c);
    expect(invoiceCommitment({ ...inv, memo: 'hello!' })).not.toBe(c);
    expect(invoiceCommitment({ ...inv, due: '2026-12-31' })).not.toBe(c);
    expect(invoiceCommitment({ ...inv, payee: addr('bitcoincash', 2) })).not.toBe(c);
  });

  it('treats payee case-insensitively and omits absent due', () => {
    expect(invoiceCommitment({ ...inv, payee: inv.payee.toUpperCase() })).toBe(invoiceCommitment(inv));
    expect(canonicalInvoiceJson(inv)).not.toMatch(/due/);
  });

  it('matches a known vector (pins the canonical form)', () => {
    expect(canonicalInvoiceJson(inv)).toBe(
      `{"v":1,"payee":"${inv.payee}","sats":"5000","memo":"hello","currency":"BCH"}`,
    );
  });
});
