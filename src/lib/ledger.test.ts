import { describe, it, expect } from 'vitest';
import { decodeInvoice, encodeInvoice, type Invoice } from './invoice';
import { invoiceCommitment } from './receipt';
import { addr } from './testAddresses';
import {
  extractEncodedInvoice,
  findPaylinkReceipt,
  invoicesFor,
  ledgerCsv,
  ledgerEntry,
  ledgerTotals,
  matchInvoices,
  parseLedgerTx,
  readHistory,
  readVerboseTx,
  sellerScript,
  type LedgerEntry,
  type LedgerTx,
} from './ledger';

// Real mainnet data: the first BCH Paylink payment and the "prepare wallet" self-send before it.
const SELLER = 'bitcoincash:qz8l22vpcx037klsqha3jzqq8lsnx4jkry9ru9e4pd';
const PAYLINK_TXID = 'd4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f';
const PAYLINK_HEX =
  '02000000011034b8db9d4a662de2f27c511eec0c90454b3cfe09b037846b51c6aa58763270000000006441c6a4be98baec63eb848cf5199ff9e8cd36404cb606ce50cd1939768cbfca72048098011d81fa70c30e93619c59582c7a1e242e67490b7460519f6e9c44e5feec612103f8447fe5295909f1f62fd5cca58b03f7aa890c76f4eb74500f116294d2be4fd0feffffff0310270000000000001976a9148ff52981c19f1f5bf005fb1908003fe13356561988acc70200000000000050ef1034b8db9d4a662de2f27c511eec0c90454b3cfe09b037846b51c6aa58763270601444070b18c23b01f7789316ff7ad8ffc4ee710e1676a914ef15be7c3e300298eea09798f19c71570b39e17888ac85011200000000001976a914ef15be7c3e300298eea09798f19c71570b39e17888ac00000000';
const PLAIN_TXID = '70327658aac6516b8437b009fe3c4b45900cec1e517cf2e22d664a9ddbb83410';
const PLAIN_HEX =
  '0200000001d5043a75549de391cf297a2a635d07de0c20fe79b25a7e51b46729ebaf52fc10010000006a47304402207204c1b6316456d47bdd390da6596e94d186c4f6b7aed38969e74b7e650579950220269f4826cb92aade5f5dbb6572ad0183706be983edc14f377a91c1b3865ec4b94121024a2a77648f789942492a240f1da6c5ad2f0ef35c25af6d96698d3ec90be8fea4feffffff02972c1200000000001976a9148ff52981c19f1f5bf005fb1908003fe13356561988accaf81400000000001976a914842e6069ff4e38a00f706c761b451a0891df58f788acb1e10e00';
const TEST_INVOICE_ENCODED =
  'eyJ2IjoxLCJwYXllZSI6ImJpdGNvaW5jYXNoOnF6OGwyMnZwY3gwMzdrbHNxaGEzanpxcThsc254NGprcnk5cnU5ZTRwZCIsInNhdHMiOjEwMDAwLCJtZW1vIjoiVGVzdCIsImN1cnJlbmN5IjoiQkNIIn0';
const COMMITMENT = '44070b18c23b01f7789316ff7ad8ffc4ee710e16';

const seller = () => {
  const s = sellerScript(SELLER, 'mainnet');
  if ('error' in s) throw new Error(s.error);
  return s;
};

describe('sellerScript', () => {
  it('gives the locking script and the Electrum script hash (sha256, byte-reversed)', () => {
    const s = seller();
    expect(s.lockHex).toBe('76a9148ff52981c19f1f5bf005fb1908003fe13356561988ac');
    expect(s.scriptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.address).toBe(SELLER);
  });
  it('accepts an address without its prefix and in upper case', () => {
    const s = sellerScript(SELLER.slice('bitcoincash:'.length).toUpperCase(), 'mainnet');
    expect(s).toEqual(seller());
  });
  it('treats the token-aware (z…) form as the same script', () => {
    const s = sellerScript('bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77', 'mainnet');
    expect('error' in s ? s.error : s.lockHex).toBe(seller().lockHex);
  });
  it.each([
    ['', /Enter/],
    ['bitcoincash:qz8l22vpcx037klsqha3jzqq8lsnx4jkry9ru9e4pX', /not a valid/],
    [addr('bchtest', 3), /bitcoincash:/],
    ['hello', /not a valid/],
  ])('rejects %j', (text, msg) => {
    const s = sellerScript(text, 'mainnet');
    expect('error' in s ? s.error : '').toMatch(msg);
  });
});

describe('parseLedgerTx / findPaylinkReceipt', () => {
  it('reads input 0 in txid byte order, so it can be compared with a token category', () => {
    const tx = parseLedgerTx(PAYLINK_HEX, 'mainnet');
    expect(tx.txid).toBe(PAYLINK_TXID);
    expect(tx.inputZeroTxid).toBe(PLAIN_TXID);
  });
  it('finds the receipt in the real payment: 20-byte commitment, category = input 0 txid', () => {
    expect(findPaylinkReceipt(parseLedgerTx(PAYLINK_HEX, 'mainnet'))).toEqual({ commitment: COMMITMENT, category: PLAIN_TXID });
  });
  it('finds nothing in a payment without an NFT', () => {
    expect(findPaylinkReceipt(parseLedgerTx(PLAIN_HEX, 'mainnet'))).toBeUndefined();
  });
  const withNft = (nft: { category: string; commitment: string }): LedgerTx => ({
    txid: PAYLINK_TXID,
    inputZeroTxid: PLAIN_TXID,
    outputs: [{ index: 0, sats: 800n, lockingBytecodeHex: '00', nft: { ...nft, capability: 'none' } }],
  });
  it('ignores an NFT whose category is not the txid of input 0 (not minted in this tx)', () => {
    expect(findPaylinkReceipt(withNft({ category: 'ab'.repeat(32), commitment: COMMITMENT }))).toBeUndefined();
  });
  it('ignores an NFT whose commitment is not 20 bytes', () => {
    expect(findPaylinkReceipt(withNft({ category: PLAIN_TXID, commitment: 'ab'.repeat(19) }))).toBeUndefined();
    expect(findPaylinkReceipt(withNft({ category: PLAIN_TXID, commitment: '' }))).toBeUndefined();
  });
  it('throws on junk', () => {
    expect(() => parseLedgerTx('zz', 'mainnet')).toThrow();
  });
});

describe('ledgerEntry', () => {
  it('the real payment: 10,000 sats received with a Paylink receipt', () => {
    const e = ledgerEntry(parseLedgerTx(PAYLINK_HEX, 'mainnet'), seller().lockHex, 975291, 1793429891);
    expect(e).toEqual({
      txid: PAYLINK_TXID,
      height: 975291,
      time: 1793429891,
      received: 10000n,
      receipt: { commitment: COMMITMENT, category: PLAIN_TXID },
    });
  });
  it('the self-send: a plain payment, no receipt', () => {
    const e = ledgerEntry(parseLedgerTx(PLAIN_HEX, 'mainnet'), seller().lockHex, 975282);
    expect(e).toEqual({ txid: PLAIN_TXID, height: 975282, received: 1191063n });
  });
  it('does not count the receipt NFT output as money received when the buyer is the seller', () => {
    const tx = parseLedgerTx(PAYLINK_HEX, 'mainnet');
    const nftOut = tx.outputs.find((o) => o.nft)!;
    const e = ledgerEntry(tx, nftOut.lockingBytecodeHex, 1);
    expect(e?.received ?? 0n).toBe(BigInt(tx.outputs[2].sats));
  });
  it('null when nothing in the tx pays the seller (a spend from the address)', () => {
    const other = sellerScript(addr('bitcoincash', 9), 'mainnet');
    if ('error' in other) throw new Error(other.error);
    expect(ledgerEntry(parseLedgerTx(PAYLINK_HEX, 'mainnet'), other.lockHex, 1)).toBeNull();
  });
});

describe('readHistory', () => {
  it('sorts newest first, unconfirmed (height <= 0) on top, and drops malformed rows', () => {
    const rows = readHistory([
      { height: 10, tx_hash: 'a'.repeat(64) },
      { height: 0, tx_hash: 'b'.repeat(64) },
      { height: 30, tx_hash: 'c'.repeat(64) },
      { height: -1, tx_hash: 'd'.repeat(64) },
      { height: 20, tx_hash: 'nope' },
      'junk',
    ]);
    expect(rows.map((r) => r.txid[0])).toEqual(['b', 'd', 'c', 'a']);
  });
  it('lists a txid once even if the server repeats it', () => {
    const rows = readHistory([
      { height: 10, tx_hash: 'a'.repeat(64) },
      { height: 10, tx_hash: 'a'.repeat(64) },
    ]);
    expect(rows).toHaveLength(1);
  });
  it('throws when a non-empty answer has no readable row', () => {
    expect(() => readHistory([{ nope: 1 }])).toThrow(/history/);
    expect(readHistory([])).toEqual([]);
  });
  it('throws when the server answer is not a list', () => {
    expect(() => readHistory({ error: 'x' })).toThrow(/history/);
  });
});

describe('readVerboseTx', () => {
  it('reads hex and block time from a verbose answer', () => {
    expect(readVerboseTx({ hex: 'abcd', blocktime: 5 })).toEqual({ hex: 'abcd', time: 5 });
  });
  it.each([1e20, -5, 1.5, 0, Number.NaN])('drops an impossible block time %s', (blocktime) => {
    expect(readVerboseTx({ hex: 'abcd', blocktime })).toEqual({ hex: 'abcd' });
  });
  it('accepts a plain hex answer (servers without verbose mode)', () => {
    expect(readVerboseTx('abcd')).toEqual({ hex: 'abcd' });
  });
  it('throws on anything else', () => {
    expect(() => readVerboseTx({ nope: 1 })).toThrow();
    expect(() => readVerboseTx(null)).toThrow();
  });
});

const realEntry = (): LedgerEntry => ledgerEntry(parseLedgerTx(PAYLINK_HEX, 'mainnet'), seller().lockHex, 975291, 1793429891)!;
const plainEntry = (): LedgerEntry => ledgerEntry(parseLedgerTx(PLAIN_HEX, 'mainnet'), seller().lockHex, 975282)!;
const testInvoice = () => decodeInvoice(TEST_INVOICE_ENCODED);

describe('matchInvoices', () => {
  it('marks the real "Test" invoice PAID by the real transaction', () => {
    const { invoices, unknownReceipts } = matchInvoices([testInvoice()], [realEntry(), plainEntry()]);
    expect(invoices).toHaveLength(1);
    expect(invoices[0].commitment).toBe(COMMITMENT);
    expect(invoices[0].status).toBe('paid');
    expect(invoices[0].paidBy?.txid).toBe(PAYLINK_TXID);
    expect(unknownReceipts).toEqual([]);
  });
  it('an invoice with no matching receipt is UNPAID', () => {
    const other: Invoice = { ...testInvoice(), memo: 'Another job' };
    const { invoices } = matchInvoices([other], [realEntry()]);
    expect(invoices[0].status).toBe('unpaid');
    expect(invoices[0].paidBy).toBeUndefined();
  });
  it('a receipt that matches but pays less than the invoice is UNDERPAID, not paid', () => {
    const e = { ...realEntry(), received: 9999n };
    expect(matchInvoices([testInvoice()], [e]).invoices[0].status).toBe('underpaid');
  });
  it('lists receipts whose invoice is not known in this browser', () => {
    const { unknownReceipts } = matchInvoices([], [realEntry(), plainEntry()]);
    expect(unknownReceipts.map((e) => e.txid)).toEqual([PAYLINK_TXID]);
  });
  it('lists the same invoice once', () => {
    expect(matchInvoices([testInvoice(), testInvoice()], [realEntry()]).invoices).toHaveLength(1);
  });
});

describe('invoicesFor', () => {
  it('keeps invoices paying the seller, in either the q… or z… form, and drops others', () => {
    const z: Invoice = { ...testInvoice(), payee: 'bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77', memo: 'z' };
    const other: Invoice = { ...testInvoice(), payee: addr('bitcoincash', 7) };
    expect(invoicesFor([testInvoice(), z, other], seller(), 'mainnet').map((i) => i.memo)).toEqual(['Test', 'z']);
  });
});

describe('ledgerTotals', () => {
  it('splits received sats by kind and counts known invoices', () => {
    const entries = [realEntry(), plainEntry()];
    const unpaid: Invoice = { ...testInvoice(), memo: 'Unpaid one' };
    const { invoices } = matchInvoices([testInvoice(), unpaid], entries);
    expect(ledgerTotals(entries, invoices)).toEqual({
      paylinkSats: 10000n,
      plainSats: 1191063n,
      paylinkCount: 1,
      plainCount: 1,
      paid: 1,
      unpaid: 1,
    });
  });
});

describe('extractEncodedInvoice', () => {
  const enc = TEST_INVOICE_ENCODED;
  it.each([
    [`https://runduck113.github.io/bch-paylink/#/pay/${enc}`],
    [`https://runduck113.github.io/bch-paylink/#/pay/${enc}?counter`],
    [`#/pay/${enc}`],
    [`https://x.test/#/receipt/${PAYLINK_TXID}?inv=${enc}`],
    [`  ${enc}  `],
  ])('reads %s', (text) => {
    expect(extractEncodedInvoice(text)).toEqual({ encoded: enc, invoice: testInvoice() });
  });
  it.each(['', 'https://example.com/', '#/pay/!!!', 'eyJ2IjoyfQ'])('rejects %j', (text) => {
    expect(extractEncodedInvoice(text)).toHaveProperty('error');
  });
});

describe('ledgerCsv', () => {
  it('one row per payment with kind, amount, fingerprint and the matched invoice', () => {
    const entries = [realEntry(), plainEntry()];
    const { invoices } = matchInvoices([testInvoice()], entries);
    const lines = ledgerCsv(entries, invoices).trimEnd().split('\r\n');
    expect(lines[0]).toBe('date_utc,block_height,txid,kind,received_sats,received_bch,receipt_fingerprint,invoice_memo,invoice_sats,invoice_status');
    expect(lines[1]).toBe(`2026-10-31,975291,${PAYLINK_TXID},paylink_receipt,10000,0.0001,${COMMITMENT},Test,10000,paid`);
    expect(lines[2]).toBe(`,975282,${PLAIN_TXID},plain_payment,1191063,0.01191063,,,,`);
  });
  it('marks a receipt for an unknown invoice and an unconfirmed tx', () => {
    const e = { ...realEntry(), height: 0, time: undefined };
    const line = ledgerCsv([e], []).trimEnd().split('\r\n')[1];
    expect(line).toBe(`,unconfirmed,${PAYLINK_TXID},paylink_receipt,10000,0.0001,${COMMITMENT},,,not_in_this_browser`);
  });
  it('the earliest receipt settles the invoice; a later one for it is a duplicate', () => {
    const second = { ...realEntry(), txid: 'f'.repeat(64), height: 975300 };
    const entries = [second, realEntry()];
    const { invoices } = matchInvoices([testInvoice()], entries);
    const lines = ledgerCsv(entries, invoices).trimEnd().split('\r\n');
    expect(lines[1]).toMatch(/,partial_or_extra_receipt$/);
    expect(lines[2]).toMatch(/,paid$/);
  });
  it('defuses formulas behind leading spaces', () => {
    const inv: Invoice = { v: 1, payee: SELLER, sats: 10000, memo: '  =1+1', currency: 'BCH' };
    const e: LedgerEntry = { ...realEntry(), receipt: { commitment: invoiceCommitment(inv), category: PLAIN_TXID } };
    expect(ledgerCsv([e], matchInvoices([inv], [e]).invoices)).toContain(",'  =1+1,");
  });
  it('an underpaid earlier receipt and a later full one: the full one settles, the earlier is partial', () => {
    const early = { ...realEntry(), txid: 'e'.repeat(64), height: 975000, received: 4000n };
    const entries = [realEntry(), early];
    const { invoices } = matchInvoices([testInvoice()], entries);
    expect(invoices[0].paidBy?.txid).toBe(PAYLINK_TXID);
    const lines = ledgerCsv(entries, invoices).trimEnd().split(String.fromCharCode(13, 10));
    expect(lines[2]).toMatch(/,partial_or_extra_receipt$/);
  });
  it('quotes commas, quotes and newlines, and defuses spreadsheet formulas in memos', () => {
    const memo = '=HYPERLINK("x"), a\nb';
    const inv: Invoice = { v: 1, payee: SELLER, sats: 10000, memo, currency: 'BCH' };
    const e: LedgerEntry = { ...realEntry(), receipt: { commitment: invoiceCommitment(inv), category: PLAIN_TXID } };
    const { invoices } = matchInvoices([inv], [e]);
    const csv = ledgerCsv([e], invoices);
    expect(csv).toContain(`"'=HYPERLINK(""x""), a\nb"`);
  });
  it('round-trips the invoice used in the fixtures', () => {
    expect(encodeInvoice(testInvoice())).toBe(TEST_INVOICE_ENCODED);
  });
});
