import { describe, it, expect } from 'vitest';
import { encodeInvoice, decodeInvoice, validateInvoice, type Invoice } from './invoice';
import { addr } from './testAddresses';

const base: Invoice = {
  v: 1,
  payee: addr('bitcoincash', 1),
  sats: 5000,
  memo: 'Logo design — invoice #12',
  currency: 'BCH',
};

describe('encode/decode', () => {
  it('round-trips an invoice', () => {
    expect(decodeInvoice(encodeInvoice(base))).toEqual(base);
  });

  it('round-trips with due date and unicode memo', () => {
    const inv = { ...base, memo: 'お支払い 🙏 ⚡', due: '2026-12-31' };
    expect(decodeInvoice(encodeInvoice(inv))).toEqual(inv);
  });

  it('is URL-safe (no + / = and unchanged by URI encoding)', () => {
    // memo chosen so plain base64 would contain + and /
    const inv = { ...base, memo: '>>>???~~~' + 'ÿ'.repeat(10) };
    const s = encodeInvoice(inv);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(s)).toBe(s);
  });

  it('rejects garbage', () => {
    expect(() => decodeInvoice('!!!not base64')).toThrow(/invoice/i);
    expect(() => decodeInvoice(encodeRaw('not json'))).toThrow(/invoice/i);
  });

  it('rejects unknown version', () => {
    expect(() => decodeInvoice(encodeRaw(JSON.stringify({ ...base, v: 2 })))).toThrow(/version/i);
  });

  it('rejects wrong field types', () => {
    expect(() => decodeInvoice(encodeRaw(JSON.stringify({ ...base, sats: '5000' })))).toThrow(/sats/i);
    expect(() => decodeInvoice(encodeRaw(JSON.stringify({ ...base, payee: 5 })))).toThrow(/payee/i);
    expect(() => decodeInvoice(encodeRaw(JSON.stringify({ ...base, currency: 'USD' })))).toThrow(/currency/i);
  });
});

describe('validateInvoice', () => {
  it('accepts a good mainnet invoice', () => {
    expect(validateInvoice(base, 'mainnet')).toEqual([]);
  });

  it('accepts a token-aware payee and a chipnet invoice', () => {
    expect(validateInvoice({ ...base, payee: addr('bitcoincash', 2, 'p2pkhWithTokens') }, 'mainnet')).toEqual([]);
    expect(validateInvoice({ ...base, payee: addr('bchtest', 1) }, 'chipnet')).toEqual([]);
  });

  it('flags network prefix mismatch', () => {
    const errs = validateInvoice({ ...base, payee: addr('bchtest', 1) }, 'mainnet');
    expect(errs.join(' ')).toMatch(/bitcoincash:/);
  });

  it('flags a bad checksum', () => {
    const p = base.payee;
    const broken = p.slice(0, -1) + (p.endsWith('q') ? 'p' : 'q');
    expect(validateInvoice({ ...base, payee: broken }, 'mainnet').join(' ')).toMatch(/address/i);
  });

  it('flags missing prefix', () => {
    const noPrefix = base.payee.split(':')[1];
    expect(validateInvoice({ ...base, payee: noPrefix }, 'mainnet').join(' ')).toMatch(/bitcoincash:/);
  });

  it('flags dust, non-integer and unsafe amounts', () => {
    expect(validateInvoice({ ...base, sats: 545 }, 'mainnet').join(' ')).toMatch(/546/);
    expect(validateInvoice({ ...base, sats: 546 }, 'mainnet')).toEqual([]);
    expect(validateInvoice({ ...base, sats: 1000.5 }, 'mainnet').join(' ')).toMatch(/whole/i);
    expect(validateInvoice({ ...base, sats: Number.MAX_SAFE_INTEGER + 1 }, 'mainnet').join(' ')).toMatch(/too large/i);
  });

  it('counts memo length in characters (code points), max 140', () => {
    expect(validateInvoice({ ...base, memo: '🙏'.repeat(140) }, 'mainnet')).toEqual([]);
    expect(validateInvoice({ ...base, memo: 'a'.repeat(141) }, 'mainnet').join(' ')).toMatch(/140/);
  });

  it('flags a malformed due date', () => {
    expect(validateInvoice({ ...base, due: '2026-02-30' }, 'mainnet').join(' ')).toMatch(/due/i);
    expect(validateInvoice({ ...base, due: 'tomorrow' }, 'mainnet').join(' ')).toMatch(/due/i);
    expect(validateInvoice({ ...base, due: '2026-02-28' }, 'mainnet')).toEqual([]);
  });

  it('returns several errors at once', () => {
    expect(validateInvoice({ ...base, sats: 1, memo: 'x'.repeat(200) }, 'mainnet').length).toBe(2);
  });
});

function encodeRaw(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

describe('decodeInvoice size cap', () => {
  it('rejects absurdly long links', () => {
    expect(() => decodeInvoice('A'.repeat(5000))).toThrow(/too long/);
  });
});
