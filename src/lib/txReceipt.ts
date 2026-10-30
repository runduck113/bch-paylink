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
