import { binToHex, sha256, utf8ToBin } from '@bitauth/libauth';
import type { Invoice } from './invoice';

/** Number of sha256 bytes kept as the NFT commitment (CashTokens allows up to 40). */
export const COMMITMENT_BYTES = 20;

/** Canonical JSON: fixed key order, sats as decimal string, lowercase payee, `due` only when present. */
export function canonicalInvoiceJson(invoice: Invoice): string {
  return JSON.stringify({
    v: invoice.v,
    payee: invoice.payee.toLowerCase(),
    sats: String(invoice.sats),
    memo: invoice.memo,
    ...(invoice.due !== undefined ? { due: invoice.due } : {}),
    currency: invoice.currency,
  });
}

/** Hex commitment = first COMMITMENT_BYTES of sha256(canonical JSON). */
export function invoiceCommitment(invoice: Invoice): string {
  return binToHex(sha256.hash(utf8ToBin(canonicalInvoiceJson(invoice))).slice(0, COMMITMENT_BYTES));
}
