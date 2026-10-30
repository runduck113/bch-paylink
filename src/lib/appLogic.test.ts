import { describe, it, expect } from 'vitest';
import { resolveNetwork } from './appNetwork';
import { formatSats, formatSatsAsBch, parseBchToSats } from './amount';
import { absoluteLink, parseRoute, payHash, receiptHash } from './routes';

describe('resolveNetwork', () => {
  it('defaults: chipnet in dev, mainnet in production', () => {
    expect(resolveNetwork(undefined, true)).toBe('chipnet');
    expect(resolveNetwork('', false)).toBe('mainnet');
  });
  it('honours an explicit value in any case', () => {
    expect(resolveNetwork('MAINNET', true)).toBe('mainnet');
    expect(resolveNetwork(' chipnet ', false)).toBe('chipnet');
  });
  it('fails loudly on unknown values', () => {
    expect(() => resolveNetwork('testnet4', false)).toThrow(/VITE_NETWORK/);
  });
});

describe('parseBchToSats / formatSatsAsBch', () => {
  it.each([
    ['0.0001', 10_000n],
    ['1', 100_000_000n],
    ['.5', 50_000_000n],
    ['0,00000546', 546n],
    ['21000000', 2_100_000_000_000_000n],
    [' 0.12345678 ', 12_345_678n],
  ])('%s BCH = %s sats', (text, sats) => {
    expect(parseBchToSats(text)).toEqual({ sats });
    expect(parseBchToSats(formatSatsAsBch(sats))).toEqual({ sats });
  });
  it.each(['', 'abc', '1.2.3', '-1', '0.123456789', '.', '1e3'])('rejects %j', (text) => {
    expect(parseBchToSats(text)).toHaveProperty('error');
  });
  it('formats', () => {
    expect(formatSatsAsBch(10_000n)).toBe('0.0001');
    expect(formatSatsAsBch(100_000_000)).toBe('1');
    expect(formatSats(1234567n)).toBe('1,234,567');
  });
});

describe('routes', () => {
  const txid = 'ab'.repeat(32);
  it('parses create / pay / receipt', () => {
    expect(parseRoute('')).toEqual({ page: 'create' });
    expect(parseRoute('#/')).toEqual({ page: 'create' });
    expect(parseRoute(payHash('eyJ2IjoxfQ'))).toEqual({ page: 'pay', encoded: 'eyJ2IjoxfQ' });
    expect(parseRoute(receiptHash(txid))).toEqual({ page: 'receipt', txid });
    expect(parseRoute(receiptHash(txid, 'abc_-'))).toEqual({ page: 'receipt', txid, encoded: 'abc_-' });
  });
  it('normalises txid case and rejects bad ones', () => {
    expect(parseRoute(`#/receipt/${txid.toUpperCase()}`)).toEqual({ page: 'receipt', txid });
    expect(parseRoute('#/receipt/xyz')).toEqual({ page: 'notFound' });
    expect(parseRoute('#/nope')).toEqual({ page: 'notFound' });
  });
  it('builds absolute share links from the current URL', () => {
    expect(absoluteLink('https://paylink.pages.dev/#/old', payHash('x'))).toBe('https://paylink.pages.dev/#/pay/x');
    expect(absoluteLink('http://localhost:4173/', '#/pay/x')).toBe('http://localhost:4173/#/pay/x');
  });
});
