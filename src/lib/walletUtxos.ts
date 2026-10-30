import type { BuyerUtxo } from './plan';
import type { WalletAddress, WalletPathName } from './hdAddresses';

/** Minimal UTXO shape returned by cashscript's NetworkProvider.getUtxos. */
export interface FetchedUtxo {
  txid: string;
  vout: number;
  satoshis: bigint;
  token?: unknown;
}

export type InputPath = [inputIndex: number, pathName: WalletPathName, addressIndex: number];

/** Fetch UTXOs for every wallet address (in parallel) and tag each with the address it belongs to. */
export async function collectWalletUtxos(
  addresses: readonly WalletAddress[],
  getUtxos: (address: string) => Promise<FetchedUtxo[]>,
): Promise<BuyerUtxo[]> {
  const lists = await Promise.all(addresses.map((a) => getUtxos(a.address)));
  const seen = new Set<string>();
  const out: BuyerUtxo[] = [];
  lists.forEach((list, i) => {
    for (const u of list) {
      const key = `${u.txid}:${u.vout}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ txid: u.txid, vout: u.vout, satoshis: u.satoshis, token: u.token ?? undefined, address: addresses[i].address });
    }
  });
  return out;
}

/** For each planned input, the wallet path that signs it: [inputIndex, 'receive' | 'change', addressIndex]. */
export function mapInputsToPaths(inputs: readonly BuyerUtxo[], addresses: readonly WalletAddress[]): InputPath[] {
  const byAddress = new Map(addresses.map((a) => [a.address.toLowerCase(), a]));
  return inputs.map((u, i): InputPath => {
    const a = u.address ? byAddress.get(u.address.toLowerCase()) : undefined;
    if (!a) throw new Error(`Input ${i} (${u.txid}:${u.vout}) is not from a known wallet address.`);
    return [i, a.pathName, a.index];
  });
}
