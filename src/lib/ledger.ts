import { binToHex, cashAddressToLockingBytecode, decodeCashAddress, decodeTransaction, hexToBin, sha256 } from '@bitauth/libauth';
import { decodeInvoice, type Invoice } from './invoice';
import { COMMITMENT_BYTES, invoiceCommitment } from './receipt';
import { parseTx, type ParsedOutput } from './txReceipt';
import { formatSatsAsBch } from './amount';
import { cashAddrPrefix, type Network } from './network';

/**
 * The seller's ledger, read from the chain: which transactions paid the address, which of them carry a
 * BCH Paylink receipt, and which known invoices those receipts settle. Pure functions; the page does the I/O.
 */

const PAYABLE_TYPES = new Set(['p2pkh', 'p2sh', 'p2pkhWithTokens', 'p2shWithTokens']);
const TXID = /^[0-9a-f]{64}$/;

export interface SellerScript {
  /** Normalised cashaddr (lowercase, with prefix). */
  address: string;
  lockHex: string;
  /** Electrum script hash: sha256 of the locking script, byte-reversed, hex. */
  scriptHash: string;
}

export function sellerScript(text: string, network: Network): SellerScript | { error: string } {
  const prefix = cashAddrPrefix(network);
  const t = text.trim().toLowerCase();
  if (t === '') return { error: 'Enter your address.' };
  const address = t.includes(':') ? t : `${prefix}:${t}`;
  if (!address.startsWith(prefix + ':')) return { error: `Use a ${prefix}: address on ${network}.` };
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string' || !PAYABLE_TYPES.has(decoded.type)) return { error: 'This is not a valid Bitcoin Cash address.' };
  const lock = cashAddressToLockingBytecode(address);
  if (typeof lock === 'string') return { error: 'This is not a valid Bitcoin Cash address.' };
  return { address, lockHex: binToHex(lock.bytecode), scriptHash: binToHex(sha256.hash(lock.bytecode).reverse()) };
}

export interface LedgerTx {
  txid: string;
  /** txid of the coin spent by input 0, in the same byte order as txids and token categories. */
  inputZeroTxid: string;
  outputs: (ParsedOutput & { hasToken?: boolean })[];
}

export function parseLedgerTx(hex: string, network: Network): LedgerTx {
  const { txid, outputs } = parseTx(hex, network);
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string' || tx.inputs.length === 0) throw new Error('Cannot decode transaction inputs.');
  return {
    txid,
    inputZeroTxid: binToHex(tx.inputs[0].outpointTransactionHash),
    outputs: outputs.map((o) => (tx.outputs[o.index].token ? { ...o, hasToken: true } : o)),
  };
}

export interface PaylinkReceipt {
  commitment: string;
  category: string;
}

/**
 * A receipt as the app mints it: an NFT with a COMMITMENT_BYTES commitment whose category is the txid of
 * input 0, i.e. a genesis in this same transaction.
 */
export function findPaylinkReceipt(tx: LedgerTx): PaylinkReceipt | undefined {
  const out = tx.outputs.find((o) => o.nft && o.nft.commitment.length === COMMITMENT_BYTES * 2 && o.nft.category === tx.inputZeroTxid);
  return out?.nft ? { commitment: out.nft.commitment, category: out.nft.category } : undefined;
}

export interface LedgerEntry {
  txid: string;
  /** Block height; 0 or below means unconfirmed. */
  height: number;
  /** Block time, unix seconds, when known. */
  time?: number;
  /** Sum of the outputs that pay the seller. */
  received: bigint;
  receipt?: PaylinkReceipt;
}

/**
 * The ledger line for one transaction, or null when nothing in it pays the seller. Outputs carrying tokens are
 * not counted: their sats travel with the token (e.g. the receipt NFT when the buyer is the seller).
 */
export function ledgerEntry(tx: LedgerTx, sellerLockHex: string, height: number, time?: number): LedgerEntry | null {
  const received = tx.outputs.filter((o) => o.lockingBytecodeHex === sellerLockHex && !o.hasToken && !o.nft).reduce((sum, o) => sum + o.sats, 0n);
  if (received === 0n) return null;
  const entry: LedgerEntry = { txid: tx.txid, height, received };
  if (time !== undefined) entry.time = time;
  const receipt = findPaylinkReceipt(tx);
  if (receipt) entry.receipt = receipt;
  return entry;
}

export interface HistoryRow {
  txid: string;
  height: number;
}

/** Electrum `get_history` answer, newest first (unconfirmed on top). Malformed rows are dropped. */
export function readHistory(answer: unknown): HistoryRow[] {
  if (!Array.isArray(answer)) throw new Error('The server sent an unreadable address history.');
  const rows = new Map<string, HistoryRow>();
  for (const r of answer) {
    if (typeof r !== 'object' || r === null) continue;
    const { tx_hash, height } = r as Record<string, unknown>;
    if (typeof tx_hash !== 'string' || !TXID.test(tx_hash) || typeof height !== 'number' || !Number.isInteger(height)) continue;
    rows.set(tx_hash, { txid: tx_hash, height });
  }
  if (answer.length > 0 && rows.size === 0) throw new Error('The server sent an unreadable address history.');
  return [...rows.values()].sort((a, b) => chainOrder(b.height) - chainOrder(a.height));
}

/** Sort key for block heights: unconfirmed (0 or below) comes after every block. */
const chainOrder = (height: number) => (height <= 0 ? Number.MAX_SAFE_INTEGER : height);

/** Electrum `transaction.get` answer, verbose (object with hex and blocktime) or plain hex. */
export function readVerboseTx(answer: unknown): { hex: string; time?: number } {
  if (typeof answer === 'string') return { hex: answer };
  if (typeof answer === 'object' && answer !== null) {
    const { hex, blocktime } = answer as Record<string, unknown>;
    if (typeof hex === 'string') return isBlockTime(blocktime) ? { hex, time: blocktime } : { hex };
  }
  throw new Error('The server sent an unreadable transaction.');
}

/** Unix seconds that make a real date; anything else would make Date#toISOString throw during render. */
const isBlockTime = (t: unknown): t is number => typeof t === 'number' && Number.isSafeInteger(t) && t > 0 && t < 8.64e12;

export type InvoiceStatus = 'paid' | 'underpaid' | 'unpaid';

export interface InvoiceMatch {
  invoice: Invoice;
  commitment: string;
  status: InvoiceStatus;
  paidBy?: LedgerEntry;
}

/**
 * Each known invoice (once per fingerprint) against the ledger: PAID when a receipt carries its fingerprint
 * and that transaction pays the seller at least the invoice amount. Also returns receipts for unknown invoices.
 */
export function matchInvoices(invoices: Invoice[], entries: LedgerEntry[]): { invoices: InvoiceMatch[]; unknownReceipts: LedgerEntry[] } {
  const seen = new Set<string>();
  const matches: InvoiceMatch[] = [];
  for (const invoice of invoices) {
    const commitment = invoiceCommitment(invoice);
    if (seen.has(commitment)) continue;
    seen.add(commitment);
    // Earliest first (unconfirmed last): the first payment settles the invoice, later ones are duplicates.
    const hits = entries.filter((e) => e.receipt?.commitment === commitment).sort((a, b) => chainOrder(a.height) - chainOrder(b.height));
    const full = hits.find((e) => e.received >= BigInt(invoice.sats));
    if (full) matches.push({ invoice, commitment, status: 'paid', paidBy: full });
    else if (hits.length) matches.push({ invoice, commitment, status: 'underpaid', paidBy: hits[0] });
    else matches.push({ invoice, commitment, status: 'unpaid' });
  }
  return { invoices: matches, unknownReceipts: entries.filter((e) => e.receipt && !seen.has(e.receipt.commitment)) };
}

/** Invoices whose payee is the same script as the seller's (q… and z… forms count as the same). */
export function invoicesFor(invoices: Invoice[], seller: SellerScript, network: Network): Invoice[] {
  return invoices.filter((i) => {
    const s = sellerScript(i.payee, network);
    return !('error' in s) && s.lockHex === seller.lockHex;
  });
}

export interface LedgerTotals {
  paylinkSats: bigint;
  plainSats: bigint;
  paylinkCount: number;
  plainCount: number;
  paid: number;
  unpaid: number;
}

/** Totals over the loaded entries. "unpaid" counts every known invoice not fully paid (underpaid included). */
export function ledgerTotals(entries: LedgerEntry[], invoices: InvoiceMatch[]): LedgerTotals {
  const t: LedgerTotals = { paylinkSats: 0n, plainSats: 0n, paylinkCount: 0, plainCount: 0, paid: 0, unpaid: 0 };
  for (const e of entries) {
    if (e.receipt) {
      t.paylinkSats += e.received;
      t.paylinkCount++;
    } else {
      t.plainSats += e.received;
      t.plainCount++;
    }
  }
  for (const m of invoices) {
    if (m.status === 'paid') t.paid++;
    else t.unpaid++;
  }
  return t;
}

/** An invoice from a pasted pay link, receipt link (?inv=) or bare encoded invoice. */
export function extractEncodedInvoice(text: string): { encoded: string; invoice: Invoice } | { error: string } {
  const t = text.trim();
  if (t === '') return { error: 'Paste an invoice link.' };
  const m = /#\/pay\/([^?&#\s]+)/.exec(t) ?? /[?&]inv=([^&#\s]+)/.exec(t);
  const encoded = m ? m[1] : t;
  if (!m && !/^[A-Za-z0-9_-]+$/.test(encoded)) return { error: 'This is not a BCH Paylink invoice link.' };
  try {
    return { encoded, invoice: decodeInvoice(encoded) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const CSV_HEADER = [
  'date_utc',
  'block_height',
  'txid',
  'kind',
  'received_sats',
  'received_bch',
  'receipt_fingerprint',
  'invoice_memo',
  'invoice_sats',
  'invoice_status',
];

/** RFC 4180 quoting; a leading = + - @ (also after spaces), tab or CR gets a ' so spreadsheets don't run it. */
function csvCell(value: string): string {
  const v = /^[\t\r]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const isoDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** The ledger as CSV for accounting: one row per payment to the seller, in the order given. */
export function ledgerCsv(entries: LedgerEntry[], invoices: InvoiceMatch[]): string {
  const byCommitment = new Map(invoices.map((m) => [m.commitment, m]));
  const rows = entries.map((e) => {
    const m = e.receipt ? byCommitment.get(e.receipt.commitment) : undefined;
    const status = !e.receipt ? '' : !m ? 'not_in_this_browser' : m.paidBy?.txid === e.txid ? m.status : 'partial_or_extra_receipt';
    return [
      e.time !== undefined ? isoDate(e.time) : '',
      e.height > 0 ? String(e.height) : 'unconfirmed',
      e.txid,
      e.receipt ? 'paylink_receipt' : 'plain_payment',
      e.received.toString(),
      formatSatsAsBch(e.received),
      e.receipt?.commitment ?? '',
      m?.invoice.memo ?? '',
      m ? String(m.invoice.sats) : '',
      status,
    ];
  });
  return [CSV_HEADER, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
