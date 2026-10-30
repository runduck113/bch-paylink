import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeTransaction,
  hashTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import type { Invoice } from './invoice';
import { invoiceCommitment } from './receipt';
import { cashAddrPrefix, type Network } from './network';

export interface ParsedOutput {
  index: number;
  sats: bigint;
  lockingBytecodeHex: string;
  /** Cashaddr when the script is a standard type, otherwise undefined. */
  address?: string;
  nft?: { category: string; capability: string; commitment: string };
}

export interface ParsedTx {
  txid: string;
  outputs: ParsedOutput[];
}

const isHex = (s: string) => /^([0-9a-f]{2})+$/i.test(s);

/** txid of a raw transaction (hex). */
export function txidOf(hex: string): string {
  if (!isHex(hex)) throw new Error('Transaction is not hex.');
  return hashTransaction(hexToBin(hex));
}

export function parseTx(hex: string, network: Network): ParsedTx {
  if (!isHex(hex)) throw new Error('Transaction is not hex.');
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(`Cannot decode transaction: ${tx}`);
  const prefix = cashAddrPrefix(network);
  const outputs = tx.outputs.map((o, index): ParsedOutput => {
    const addr = lockingBytecodeToCashAddress({ prefix, bytecode: o.lockingBytecode, tokenSupport: o.token !== undefined });
    const out: ParsedOutput = { index, sats: o.valueSatoshis, lockingBytecodeHex: binToHex(o.lockingBytecode) };
    if (typeof addr !== 'string') out.address = addr.address;
    if (o.token?.nft) {
      out.nft = {
        category: binToHex(o.token.category),
        capability: o.token.nft.capability,
        commitment: binToHex(o.token.nft.commitment),
      };
    }
    return out;
  });
  return { txid: txidOf(hex), outputs };
}

export interface InvoiceCheck {
  expectedCommitment: string;
  /** An NFT output in the tx carries exactly this invoice's commitment. */
  commitmentMatches: boolean;
  /** Some output pays the invoice payee at least the invoice amount. */
  payeePaid: boolean;
}

export function checkTxAgainstInvoice(tx: ParsedTx, invoice: Invoice): InvoiceCheck {
  const expectedCommitment = invoiceCommitment(invoice);
  const lock = cashAddressToLockingBytecode(invoice.payee.toLowerCase());
  const payeeHex = typeof lock === 'string' ? null : binToHex(lock.bytecode);
  return {
    expectedCommitment,
    commitmentMatches: tx.outputs.some((o) => o.nft?.commitment === expectedCommitment),
    payeePaid: payeeHex !== null && tx.outputs.some((o) => o.lockingBytecodeHex === payeeHex && o.sats >= BigInt(invoice.sats)),
  };
}

/** Electrum rejects a re-broadcast of a tx it already has; for us that is success. */
export function isAlreadyKnownError(message: string): boolean {
  return /already known|already have transaction|txn-already|already in (the )?mempool|transaction already in block chain/i.test(message);
}

/**
 * True when `signedHex` spends the same outpoints and creates the same outputs (script, value, token) as
 * `unsignedHex`: a wallet may only add signatures. Used before broadcasting what the wallet returned.
 */
export function sameTxSkeleton(unsignedHex: string, signedHex: string): boolean {
  if (!isHex(unsignedHex) || !isHex(signedHex)) return false;
  const a = decodeTransaction(hexToBin(unsignedHex));
  const b = decodeTransaction(hexToBin(signedHex));
  if (typeof a === 'string' || typeof b === 'string') return false;
  type Tx = Exclude<typeof a, string>;
  const shape = (t: Tx) =>
    JSON.stringify([
      t.version,
      t.locktime,
      t.inputs.map((i) => [binToHex(i.outpointTransactionHash), i.outpointIndex, i.sequenceNumber]),
      t.outputs.map((o) => [
        binToHex(o.lockingBytecode),
        String(o.valueSatoshis),
        o.token
          ? [binToHex(o.token.category), String(o.token.amount), o.token.nft ? [o.token.nft.capability, binToHex(o.token.nft.commitment)] : null]
          : null,
      ]),
    ]);
  return shape(a) === shape(b);
}
