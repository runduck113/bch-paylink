import {
  cashAddressToLockingBytecode,
  decodeCashAddress,
  encodeCashAddress,
  encodeTransactionOutput,
  getDustThreshold,
  hexToBin,
  type Output,
} from '@bitauth/libauth';
import { validateInvoice, type Invoice } from './invoice';
import { invoiceCommitment } from './receipt';
import { cashAddrPrefix, type Network } from './network';

/** Buyer UTXO as reported by an indexer / wallet. `address` defaults to the buyer address. */
export interface BuyerUtxo {
  txid: string;
  vout: number;
  satoshis: bigint;
  token?: unknown;
  address?: string;
}

export interface ReceiptToken {
  category: string;
  amount: 0n;
  nft: { capability: 'none'; commitment: string };
}

export interface PlannedOutput {
  role: 'payee' | 'receipt' | 'change' | 'prep';
  to: string;
  sats: bigint;
  token?: ReceiptToken;
}

export interface TxPlan {
  /** Ordered inputs; index i here is input i of the transaction. */
  inputs: BuyerUtxo[];
  outputs: PlannedOutput[];
  fee: bigint;
  /** Estimated signed size in bytes (worst-case signatures). */
  size: number;
}

export interface PaymentPlan extends TxPlan {
  /** CashTokens category of the receipt NFT (= txid of input 0, which spends an output 0). */
  category: string;
  commitment: string;
}

export type PlanErrorCode = 'INVALID_INVOICE' | 'INVALID_BUYER' | 'INVALID_FEE_RATE' | 'NO_GENESIS_UTXO' | 'INSUFFICIENT_FUNDS';

export class PlanError extends Error {
  readonly code: PlanErrorCode;
  constructor(code: PlanErrorCode, message: string) {
    super(message);
    this.name = 'PlanError';
    this.code = code;
  }
}

/** Signed P2PKH input, worst case (ECDSA sig): 36 outpoint + 1 + 107 script + 4 sequence. */
export const P2PKH_INPUT_BYTES = 148;
/** version (4) + locktime (4); input/output counts are added as varints. */
const TX_OVERHEAD_BYTES = 8;

interface Common {
  buyerUtxos: BuyerUtxo[];
  buyerAddress: string;
  /** Satoshis per byte; at least 1 (relay minimum). */
  feeRate: number;
  network: Network;
}

export interface PlanPaymentArgs extends Common {
  invoice: Invoice;
}

export function planPayment({ buyerUtxos, invoice, buyerAddress, feeRate, network }: PlanPaymentArgs): PaymentPlan {
  const invoiceErrors = validateInvoice(invoice, network);
  if (invoiceErrors.length) throw new PlanError('INVALID_INVOICE', invoiceErrors.join(' '));
  checkFeeRate(feeRate);
  const buyer = parseBuyer(buyerAddress, network);

  const spendable = buyerUtxos.filter((u) => u.token === undefined);
  const genesis = spendable.filter((u) => u.vout === 0).sort(bySatsDesc)[0];
  if (spendable.length > 0 && !genesis) {
    throw new PlanError(
      'NO_GENESIS_UTXO',
      'To mint the receipt NFT, the wallet needs a coin that was output 0 of its transaction. ' +
        'None was found: send a small amount to yourself first (prep step), then pay.',
    );
  }
  const ordered = genesis ? [genesis, ...spendable.filter((u) => u !== genesis).sort(bySatsDesc)] : [];

  // Category placeholder only matters for size/dust (always 32 bytes); real value set below when a genesis exists.
  const category = genesis ? genesis.txid : '00'.repeat(32);
  const commitment = invoiceCommitment(invoice);
  const payee: PlannedOutput = { role: 'payee', to: invoice.payee, sats: BigInt(invoice.sats) };
  const receiptBase: PlannedOutput = {
    role: 'receipt',
    to: buyer.tokenAddress,
    sats: 0n,
    token: { category, amount: 0n, nft: { capability: 'none', commitment } },
  };
  const receipt: PlannedOutput = { ...receiptBase, sats: dustOf(receiptBase) };

  const plan = selectAndFinish(ordered, [payee, receipt], buyer.address, feeRate);
  return { ...plan, category, commitment };
}

/** Self-send of all spendable coins into a single output 0, so a later payment has a genesis input. */
export function planPrep({ buyerUtxos, buyerAddress, feeRate, network }: Common): TxPlan {
  checkFeeRate(feeRate);
  const buyer = parseBuyer(buyerAddress, network);
  const inputs = buyerUtxos.filter((u) => u.token === undefined);
  const total = sum(inputs);
  const out: PlannedOutput = { role: 'prep', to: buyer.address, sats: 0n };
  const size = txSize(Math.max(inputs.length, 1), [out]);
  const fee = feeFor(size, feeRate);
  const sats = total - fee;
  if (inputs.length === 0 || sats < dustOf(out)) {
    throw new PlanError(
      'INSUFFICIENT_FUNDS',
      `Not enough BCH to prepare the wallet (have ${total} sats, need ${fee + dustOf(out)}).`,
    );
  }
  return { inputs, outputs: [{ ...out, sats }], fee, size };
}

function selectAndFinish(ordered: BuyerUtxo[], fixed: PlannedOutput[], changeTo: string, feeRate: number): TxPlan {
  const fixedSats = fixed.reduce((s, o) => s + o.sats, 0n);
  const changeTemplate: PlannedOutput = { role: 'change', to: changeTo, sats: 0n };
  const changeDust = dustOf(changeTemplate);
  let need = fixedSats + feeFor(txSize(1, fixed), feeRate);
  for (let n = 1; n <= ordered.length; n++) {
    const inputs = ordered.slice(0, n);
    const total = sum(inputs);
    const sizeNoChange = txSize(n, fixed);
    need = fixedSats + feeFor(sizeNoChange, feeRate);
    if (total < need) continue;

    const sizeWithChange = txSize(n, [...fixed, changeTemplate]);
    const change = total - fixedSats - feeFor(sizeWithChange, feeRate);
    if (change >= changeDust) {
      return {
        inputs,
        outputs: [...fixed, { ...changeTemplate, sats: change }],
        fee: total - fixedSats - change,
        size: sizeWithChange,
      };
    }
    return { inputs, outputs: fixed, fee: total - fixedSats, size: sizeNoChange };
  }
  const have = sum(ordered);
  throw new PlanError(
    'INSUFFICIENT_FUNDS',
    `Not enough BCH: need ${need} sats including fee, wallet has ${have} spendable. Short by ${need - have} sats.`,
  );
}

function parseBuyer(address: string, network: Network) {
  const prefix = cashAddrPrefix(network);
  const decoded = decodeCashAddress(address.toLowerCase());
  if (typeof decoded === 'string' || decoded.prefix !== prefix || decoded.type !== 'p2pkh') {
    throw new PlanError('INVALID_BUYER', `Buyer address must be a P2PKH "${prefix}:" address.`);
  }
  return {
    address: address.toLowerCase(),
    tokenAddress: encodeCashAddress({ prefix, type: 'p2pkhWithTokens', payload: decoded.payload }).address,
  };
}

function checkFeeRate(feeRate: number) {
  if (!Number.isFinite(feeRate) || feeRate < 1) {
    throw new PlanError('INVALID_FEE_RATE', 'Fee rate must be at least 1 sat/byte.');
  }
}

export function toLibauthOutput(o: PlannedOutput): Output {
  const lock = cashAddressToLockingBytecode(o.to);
  if (typeof lock === 'string') throw new Error(`Bad output address ${o.to}: ${lock}`);
  const out: Output = { lockingBytecode: lock.bytecode, valueSatoshis: o.sats };
  if (o.token) {
    out.token = {
      category: hexToBin(o.token.category),
      amount: o.token.amount,
      nft: { capability: o.token.nft.capability, commitment: hexToBin(o.token.nft.commitment) },
    };
  }
  return out;
}

const dustOf = (o: PlannedOutput) => getDustThreshold(toLibauthOutput(o));
const outputBytes = (o: PlannedOutput) => encodeTransactionOutput(toLibauthOutput(o)).length;
const varIntBytes = (n: number) => (n < 0xfd ? 1 : n <= 0xffff ? 3 : 5);
const txSize = (nIn: number, outs: PlannedOutput[]) =>
  TX_OVERHEAD_BYTES +
  varIntBytes(nIn) +
  nIn * P2PKH_INPUT_BYTES +
  varIntBytes(outs.length) +
  outs.reduce((s, o) => s + outputBytes(o), 0);
const feeFor = (size: number, feeRate: number) => BigInt(Math.ceil(size * feeRate));
const sum = (us: BuyerUtxo[]) => us.reduce((s, u) => s + u.satoshis, 0n);
const bySatsDesc = (a: BuyerUtxo, b: BuyerUtxo) => (a.satoshis === b.satoshis ? 0 : a.satoshis > b.satoshis ? -1 : 1);
