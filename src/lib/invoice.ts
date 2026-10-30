import { base64ToBin, binToBase64, binToUtf8, decodeCashAddress, utf8ToBin } from '@bitauth/libauth';
import { cashAddrPrefix, type Network } from './network';

export interface Invoice {
  v: 1;
  /** Payee cashaddr, with prefix (bitcoincash: / bchtest:). */
  payee: string;
  /** Amount in satoshis; integer (JSON number, must be a safe integer). */
  sats: number;
  memo: string;
  /** Optional due date, YYYY-MM-DD. */
  due?: string;
  currency: 'BCH';
}

/** Smallest standard P2PKH output (sats). */
export const MIN_INVOICE_SATS = 546;
export const MAX_MEMO_CHARS = 140;
/** Generous cap on the encoded link part (a max-size invoice is well under 1 KB). */
export const MAX_LINK_CHARS = 4096;

const PAYABLE_TYPES = new Set(['p2pkh', 'p2sh', 'p2pkhWithTokens', 'p2shWithTokens']);

export function encodeInvoice(invoice: Invoice): string {
  const json = JSON.stringify(toPlain(invoice));
  return binToBase64(utf8ToBin(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeInvoice(text: string): Invoice {
  if (text.length > MAX_LINK_CHARS) throw new Error('Invalid invoice link: too long');
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid invoice link: not base64url');
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  let raw: unknown;
  try {
    raw = JSON.parse(binToUtf8(base64ToBin(b64 + '='.repeat((4 - (b64.length % 4)) % 4))));
  } catch {
    throw new Error('Invalid invoice link: cannot be read');
  }
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid invoice link: not an object');
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) throw new Error(`Unsupported invoice version: ${String(o.v)}`);
  if (typeof o.payee !== 'string') throw new Error('Invalid invoice: payee must be text');
  if (typeof o.sats !== 'number') throw new Error('Invalid invoice: sats must be a number');
  if (typeof o.memo !== 'string') throw new Error('Invalid invoice: memo must be text');
  if (o.due !== undefined && typeof o.due !== 'string') throw new Error('Invalid invoice: due must be text');
  if (o.currency !== 'BCH') throw new Error('Invalid invoice: currency must be BCH');
  return toPlain({ v: 1, payee: o.payee, sats: o.sats, memo: o.memo, due: o.due as string | undefined, currency: 'BCH' });
}

/** Returns human-readable problems; empty array means the invoice is payable on `network`. */
export function validateInvoice(invoice: Invoice, network: Network): string[] {
  const errors: string[] = [];
  const prefix = cashAddrPrefix(network);

  if (!invoice.payee.toLowerCase().startsWith(prefix + ':')) {
    errors.push(`Payee address must start with "${prefix}:" on ${network}.`);
  } else {
    const decoded = decodeCashAddress(invoice.payee.toLowerCase());
    if (typeof decoded === 'string') errors.push(`Payee address is not valid (${decoded}).`);
    else if (!PAYABLE_TYPES.has(decoded.type)) errors.push(`Payee address type "${decoded.type}" is not supported.`);
  }

  if (!Number.isInteger(invoice.sats)) errors.push('Amount must be a whole number of satoshis.');
  else if (!Number.isSafeInteger(invoice.sats)) errors.push('Amount is too large.');
  else if (invoice.sats < MIN_INVOICE_SATS) errors.push(`Amount must be at least ${MIN_INVOICE_SATS} sats (dust limit).`);

  if ([...invoice.memo].length > MAX_MEMO_CHARS) errors.push(`Memo must be at most ${MAX_MEMO_CHARS} characters.`);

  if (invoice.due !== undefined && !isIsoDate(invoice.due)) errors.push('Due date must be a real date in YYYY-MM-DD form.');

  return errors;
}

function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Fixed key order, `due` omitted when absent. */
function toPlain(i: Invoice): Invoice {
  const out: Invoice = { v: 1, payee: i.payee, sats: i.sats, memo: i.memo, currency: 'BCH' };
  if (i.due !== undefined) out.due = i.due;
  return out;
}
