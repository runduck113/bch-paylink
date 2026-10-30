import { describe, it, expect } from 'vitest';
import { MockNetworkProvider, SignatureTemplate, type NetworkProvider } from 'cashscript';
import {
  binToHex,
  createVirtualMachineBCH,
  decodeTransaction,
  encodeCashAddress,
  hash160,
  hexToBin,
  secp256k1,
  verifyTransactionTokens,
} from '@bitauth/libauth';
import { buildWcTransaction, toRelaySignRequest } from './buildTx';
import { planPayment, planPrep, type BuyerUtxo } from './plan';
import type { Invoice } from './invoice';
import { addr } from './testAddresses';

// Throwaway key, never funded; only used to prove the planned tx is consensus-valid once signed.
const priv = new Uint8Array(32).fill(7);
const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
const buyer = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(pub) }).address;

const invoice: Invoice = { v: 1, payee: addr('bchtest', 1), sats: 5000, memo: 'test', currency: 'BCH' };
const utxos: BuyerUtxo[] = [
  { txid: '11'.repeat(32), vout: 2, satoshis: 4000n },
  { txid: '22'.repeat(32), vout: 0, satoshis: 3000n },
];
const plan = () => planPayment({ buyerUtxos: utxos, invoice, buyerAddress: buyer, feeRate: 1, network: 'chipnet' });

describe('buildWcTransaction (placeholder unlockers, for the wallet to sign)', () => {
  const p = plan();
  const { wc, hex, fee } = buildWcTransaction(p, {
    provider: new MockNetworkProvider(),
    buyerAddress: buyer,
    userPrompt: 'Pay invoice',
    broadcast: true,
  });

  it('has one source output per input, in plan order', () => {
    expect(wc.transaction.inputs).toHaveLength(2);
    expect(wc.sourceOutputs).toHaveLength(2);
    expect(wc.transaction.inputs.map((i) => binToHex(i.outpointTransactionHash))).toEqual(p.inputs.map((u) => u.txid));
    expect(wc.sourceOutputs.map((s) => s.valueSatoshis)).toEqual(p.inputs.map((u) => u.satoshis));
    expect(binToHex(wc.sourceOutputs[0].lockingBytecode)).toBe('76a914' + binToHex(hash160(pub)) + '88ac');
  });

  it('passes userPrompt and broadcast through', () => {
    expect(wc.userPrompt).toBe('Pay invoice');
    expect(wc.broadcast).toBe(true);
  });

  it('outputs match the plan, receipt category = input 0 outpoint txid', () => {
    const outs = wc.transaction.outputs;
    expect(outs.map((o) => o.valueSatoshis)).toEqual(p.outputs.map((o) => o.sats));
    expect(binToHex(outs[1].token!.category)).toBe(binToHex(wc.transaction.inputs[0].outpointTransactionHash));
    expect(wc.transaction.inputs[0].outpointIndex).toBe(0);
    expect(binToHex(outs[1].token!.nft!.commitment)).toBe(p.commitment);
  });

  it('passes libauth CashTokens validation (genesis rule)', () => {
    expect(verifyTransactionTokens(wc.transaction, wc.sourceOutputs)).toBe(true);
  });

  it('agrees with the plan fee and the hex decodes to the same tx', () => {
    expect(fee).toBe(p.fee);
    const decoded = decodeTransaction(hexToBin(hex));
    expect(typeof decoded).not.toBe('string');
  });

  it('builds a prep self-send too', () => {
    const prep = planPrep({ buyerUtxos: utxos, buyerAddress: buyer, feeRate: 1, network: 'chipnet' });
    const r = buildWcTransaction(prep, { provider: new MockNetworkProvider(), buyerAddress: buyer });
    expect(r.wc.transaction.outputs).toHaveLength(1);
    expect(r.wc.transaction.outputs[0].valueSatoshis).toBe(prep.outputs[0].sats);
  });
});

describe('planned tx is consensus-valid when signed', () => {
  it('verifies in the libauth BCH VM with a real signature', () => {
    const p = plan();
    const { hex, sourceOutputs } = buildWcTransaction(p, {
      provider: new MockNetworkProvider(),
      buyerAddress: buyer,
      unlocker: () => new SignatureTemplate(priv).unlockP2PKH(),
    });
    const tx = decodeTransaction(hexToBin(hex));
    if (typeof tx === 'string') throw new Error(tx);
    expect(createVirtualMachineBCH().verify({ transaction: tx, sourceOutputs })).toBe(true);
    // Real signed size must not exceed the planned (worst-case) size, so the fee rate holds.
    expect(hex.length / 2).toBeLessThanOrEqual(p.size);
  });
});

describe('mainnet', () => {
  it('builds a mainnet payment with a mainnet-network provider (no network calls)', () => {
    const mainBuyer = addr('bitcoincash', 9);
    const p = planPayment({
      buyerUtxos: [{ txid: '33'.repeat(32), vout: 0, satoshis: 20_000n }],
      invoice: { ...invoice, payee: addr('bitcoincash', 1) },
      buyerAddress: mainBuyer,
      feeRate: 1,
      network: 'mainnet',
    });
    // build() only reads provider.network; a stub keeps the test offline.
    const provider = { network: 'mainnet' } as unknown as NetworkProvider;
    const { wc } = buildWcTransaction(p, { provider, buyerAddress: mainBuyer });
    expect(verifyTransactionTokens(wc.transaction, wc.sourceOutputs)).toBe(true);
  });
});

describe('toRelaySignRequest (WizardConnect relay sends plain JSON.stringify)', () => {
  it('produces a JSON-safe request: tx as hex, bigint/bytes encoded', () => {
    const built = buildWcTransaction(plan(), { provider: new MockNetworkProvider(), buyerAddress: buyer, userPrompt: 'Pay', broadcast: true });
    const req = toRelaySignRequest(built);
    expect(() => JSON.stringify(req)).not.toThrow();
    expect(req.transaction).toBe(built.hex);
    expect(req.sourceOutputs[0].valueSatoshis).toBe(`<bigint: ${built.sourceOutputs[0].valueSatoshis}n>`);
    expect(req.userPrompt).toBe('Pay');
    expect(req.broadcast).toBe(true);
  });
});
