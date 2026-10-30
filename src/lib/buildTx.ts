import {
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  type NetworkProvider,
  type Output,
  type Unlocker,
  type WcSourceOutput,
  type WcTransactionObject,
} from 'cashscript';
import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import type { BuyerUtxo, PlannedOutput, TxPlan } from './plan';

export interface BuildOptions {
  /** Provider whose network matches the addresses (ElectrumNetworkProvider in the app, MockNetworkProvider in tests). */
  provider: NetworkProvider;
  buyerAddress: string;
  userPrompt?: string;
  /** Ask the wallet to broadcast after signing. */
  broadcast?: boolean;
  /** Override the unlocker (tests / local signing). Default: placeholder P2PKH for the wallet to fill. */
  unlocker?: (utxo: BuyerUtxo, address: string) => Unlocker;
}

export interface BuiltTx {
  /** BCH WalletConnect-style sign request object (transaction + sourceOutputs). */
  wc: WcTransactionObject;
  /** Unsigned (placeholder) or signed tx hex, as built. */
  hex: string;
  sourceOutputs: WcSourceOutput[];
  fee: bigint;
}

export function buildWcTransaction(plan: TxPlan, opts: BuildOptions): BuiltTx {
  const builder = new TransactionBuilder({ provider: opts.provider });
  for (const utxo of plan.inputs) {
    const address = utxo.address ?? opts.buyerAddress;
    const lock = cashAddressToLockingBytecode(address);
    if (typeof lock === 'string') throw new Error(`Bad input address ${address}: ${lock}`);
    const unlocker = opts.unlocker ? opts.unlocker(utxo, address) : placeholderP2PKHUnlocker(address);
    builder.addInput(
      { txid: utxo.txid, vout: utxo.vout, satoshis: utxo.satoshis, lockingBytecode: binToHex(lock.bytecode) },
      unlocker,
    );
  }
  builder.addOutputs(plan.outputs.map(toCashScriptOutput));

  const wcOptions: { userPrompt?: string; broadcast?: boolean } = {};
  if (opts.userPrompt !== undefined) wcOptions.userPrompt = opts.userPrompt;
  if (opts.broadcast !== undefined) wcOptions.broadcast = opts.broadcast;
  const wc = builder.generateWcTransactionObject(wcOptions);
  return { wc, hex: builder.build(), sourceOutputs: wc.sourceOutputs, fee: builder.calculateTransactionFee().feeSats };
}

function toCashScriptOutput(o: PlannedOutput): Output {
  if (!o.token) return { to: o.to, amount: o.sats };
  return {
    to: o.to,
    amount: o.sats,
    token: {
      category: o.token.category,
      amount: o.token.amount,
      nft: { capability: o.token.nft.capability, commitment: o.token.nft.commitment },
    },
  };
}
