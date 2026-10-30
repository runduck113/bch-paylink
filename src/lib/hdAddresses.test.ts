import { describe, it, expect } from 'vitest';
import {
  decodeCashAddress,
  deriveHdPath,
  deriveHdPrivateNodeFromSeed,
  deriveHdPublicNode,
  encodeCashAddress,
  encodeHdPublicKey,
  hash160,
  hexToBin,
  secp256k1,
} from '@bitauth/libauth';
import { deriveWalletAddresses } from './hdAddresses';

// Throwaway seed (never funded). The "wallet" shares the chain-level xpubs m/44'/145'/0'/0 and /1.
const seed = hexToBin('000102030405060708090a0b0c0d0e0f');
const root = deriveHdPrivateNodeFromSeed(seed);
const chainNode = (chain: 0 | 1) => deriveHdPath(root, `m/44'/145'/0'/${chain}`);
const xpubOf = (chain: 0 | 1, network: 'mainnet' | 'testnet' = 'mainnet') => {
  const enc = encodeHdPublicKey({ network, node: deriveHdPublicNode(chainNode(chain)) });
  return typeof enc === 'string' ? enc : enc.hdPublicKey;
};
/** Independent route: derive the private key at the full path, then its address. */
const expectedAddress = (chain: 0 | 1, i: number, prefix: 'bitcoincash' | 'bchtest' = 'bitcoincash') => {
  const priv = deriveHdPath(root, `m/44'/145'/0'/${chain}/${i}`).privateKey;
  const pub = secp256k1.derivePublicKeyCompressed(priv) as Uint8Array;
  return encodeCashAddress({ prefix, type: 'p2pkh', payload: hash160(pub) }).address;
};

const paths = [
  { name: 'receive', xpub: xpubOf(0) },
  { name: 'change', xpub: xpubOf(1) },
  { name: 'defi', xpub: xpubOf(0) },
];

describe('deriveWalletAddresses', () => {
  it('derives receive then change addresses that match private-key derivation', () => {
    const list = deriveWalletAddresses(paths, 3, 'mainnet');
    expect(list.map((a) => [a.pathName, a.index])).toEqual([
      ['receive', 0], ['receive', 1], ['receive', 2],
      ['change', 0], ['change', 1], ['change', 2],
    ]);
    expect(list[0].address).toBe(expectedAddress(0, 0));
    expect(list[2].address).toBe(expectedAddress(0, 2));
    expect(list[4].address).toBe(expectedAddress(1, 1));
  });

  it('locking bytecode is P2PKH of the same hash', () => {
    const [a] = deriveWalletAddresses(paths, 1, 'mainnet');
    const decoded = decodeCashAddress(a.address);
    if (typeof decoded === 'string') throw new Error(decoded);
    expect(a.lockingBytecodeHex).toMatch(/^76a914[0-9a-f]{40}88ac$/);
    expect(a.lockingBytecodeHex.slice(6, 46)).toBe(Buffer.from(decoded.payload).toString('hex'));
  });

  it('uses the app network prefix (chipnet -> bchtest) and accepts tpub-style keys', () => {
    const list = deriveWalletAddresses([{ name: 'receive', xpub: xpubOf(0, 'testnet') }], 2, 'chipnet');
    expect(list).toHaveLength(2);
    expect(list[1].address).toBe(expectedAddress(0, 1, 'bchtest'));
  });

  it('ignores extra paths and works without a change xpub', () => {
    const list = deriveWalletAddresses([{ name: 'receive', xpub: xpubOf(0) }], 2, 'mainnet');
    expect(list.every((a) => a.pathName === 'receive')).toBe(true);
  });

  it('rejects a missing receive path, a bad xpub and a bad count', () => {
    expect(() => deriveWalletAddresses([{ name: 'change', xpub: xpubOf(1) }], 1, 'mainnet')).toThrow(/receive/);
    expect(() => deriveWalletAddresses([{ name: 'receive', xpub: 'xpubNOPE' }], 1, 'mainnet')).toThrow(/bad xpub/);
    expect(() => deriveWalletAddresses(paths, 0, 'mainnet')).toThrow(/count/);
  });
});
