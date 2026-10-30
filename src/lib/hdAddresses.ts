import { binToHex, decodeHdPublicKey, deriveHdPublicNodeChild, encodeCashAddress, hash160 } from '@bitauth/libauth';
import { cashAddrPrefix, type Network } from './network';

/** Path names WizardConnect (hdwalletv1) uses in inputPaths; we only spend from these two. */
export type WalletPathName = 'receive' | 'change';
const SPENDABLE_PATHS: readonly WalletPathName[] = ['receive', 'change'];

/** Shape of what the wallet shares in wallet_ready (`{ name, xpub }` per path). */
export interface PathXpubLike {
  name: string;
  xpub: string;
}

export interface WalletAddress {
  pathName: WalletPathName;
  index: number;
  /** Plain P2PKH cashaddr. */
  address: string;
  /** P2PKH locking bytecode, hex. */
  lockingBytecodeHex: string;
}

/**
 * Derive the first `count` P2PKH addresses of each spendable path (receive, change) from the wallet's xpubs.
 * Each xpub is the node for that chain (m/44'/145'/0'/0 or /1), so address i is its non-hardened child i
 * (same as DappPubkeyStateManager.getPubkey in @wizardconnect/dapp).
 */
export function deriveWalletAddresses(paths: readonly PathXpubLike[], count: number, network: Network): WalletAddress[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer');
  const prefix = cashAddrPrefix(network);
  const out: WalletAddress[] = [];
  for (const pathName of SPENDABLE_PATHS) {
    const entry = paths.find((p) => p.name === pathName);
    if (!entry) continue;
    const decoded = decodeHdPublicKey(entry.xpub);
    if (typeof decoded === 'string') throw new Error(`Wallet sent a bad xpub for "${pathName}": ${decoded}`);
    for (let index = 0; index < count; index++) {
      const child = deriveHdPublicNodeChild(decoded.node, index);
      const pkh = hash160(child.publicKey);
      out.push({
        pathName,
        index,
        address: encodeCashAddress({ prefix, type: 'p2pkh', payload: pkh }).address,
        lockingBytecodeHex: '76a914' + binToHex(pkh) + '88ac',
      });
    }
  }
  if (!out.some((a) => a.pathName === 'receive')) throw new Error('Wallet did not share a "receive" xpub.');
  return out;
}
