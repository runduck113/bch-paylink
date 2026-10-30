import { describe, it, expect } from 'vitest';
import { collectWalletUtxos, mapInputsToPaths, type FetchedUtxo } from './walletUtxos';
import type { WalletAddress } from './hdAddresses';
import { addr } from './testAddresses';
import { planPayment } from './plan';

const book: WalletAddress[] = [
  { pathName: 'receive', index: 0, address: addr('bchtest', 10), lockingBytecodeHex: '' },
  { pathName: 'receive', index: 1, address: addr('bchtest', 11), lockingBytecodeHex: '' },
  { pathName: 'change', index: 0, address: addr('bchtest', 20), lockingBytecodeHex: '' },
];

const chain: Record<string, FetchedUtxo[]> = {
  [addr('bchtest', 10)]: [{ txid: 'aa'.repeat(32), vout: 1, satoshis: 2000n }],
  [addr('bchtest', 11)]: [],
  [addr('bchtest', 20)]: [
    { txid: 'bb'.repeat(32), vout: 0, satoshis: 9000n },
    { txid: 'cc'.repeat(32), vout: 0, satoshis: 800n, token: { category: 'dd'.repeat(32), amount: 0n } },
  ],
};
const fetcher = async (a: string) => chain[a] ?? [];

describe('collectWalletUtxos', () => {
  it('tags every UTXO with the address it was found at', async () => {
    const utxos = await collectWalletUtxos(book, fetcher);
    expect(utxos.map((u) => [u.txid.slice(0, 2), u.address])).toEqual([
      ['aa', addr('bchtest', 10)],
      ['bb', addr('bchtest', 20)],
      ['cc', addr('bchtest', 20)],
    ]);
    expect(utxos[2].token).toBeDefined();
  });

  it('drops duplicates (same outpoint reported twice)', async () => {
    const dup = [book[0], { ...book[0] }];
    expect(await collectWalletUtxos(dup, fetcher)).toHaveLength(1);
  });

  it('propagates network errors instead of hiding them', async () => {
    await expect(collectWalletUtxos(book, async () => { throw new Error('electrum down'); })).rejects.toThrow('electrum down');
  });
});

describe('mapInputsToPaths', () => {
  it('maps planned inputs (in plan order) to [inputIndex, path, addressIndex]', async () => {
    const utxos = await collectWalletUtxos(book, fetcher);
    const plan = planPayment({
      buyerUtxos: utxos,
      invoice: { v: 1, payee: addr('bchtest', 1), sats: 9_500, memo: 'x', currency: 'BCH' },
      buyerAddress: book[0].address,
      feeRate: 1,
      network: 'chipnet',
    });
    // Genesis (vout 0, from change/0) must come first, then the receive/0 coin; the token UTXO is never spent.
    expect(mapInputsToPaths(plan.inputs, book)).toEqual([
      [0, 'change', 0],
      [1, 'receive', 0],
    ]);
  });

  it('is case-insensitive on addresses', () => {
    const input = { txid: 'aa'.repeat(32), vout: 0, satoshis: 1n, address: book[1].address.toUpperCase() };
    expect(mapInputsToPaths([input], book)).toEqual([[0, 'receive', 1]]);
  });

  it('throws for an input that is not from the wallet', () => {
    expect(() => mapInputsToPaths([{ txid: 'ee'.repeat(32), vout: 0, satoshis: 1n, address: addr('bchtest', 99) }], book)).toThrow(/not from a known wallet address/);
    expect(() => mapInputsToPaths([{ txid: 'ee'.repeat(32), vout: 0, satoshis: 1n }], book)).toThrow();
  });
});
