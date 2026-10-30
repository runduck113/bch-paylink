import { ElectrumNetworkProvider, Network } from 'cashscript';
import { NETWORK } from '../config';
import { isAlreadyKnownError, txidOf } from '../lib/txReceipt';

let provider: ElectrumNetworkProvider | null = null;

/** One shared Electrum connection per page (cashscript connects on demand and idles out). */
export function getProvider(): ElectrumNetworkProvider {
  provider ??= new ElectrumNetworkProvider(NETWORK === 'mainnet' ? Network.MAINNET : Network.CHIPNET);
  return provider;
}

/** Broadcast a signed tx; "already known" (e.g. the wallet broadcast it too) counts as success. Returns the txid. */
export async function broadcast(hex: string): Promise<string> {
  const txid = txidOf(hex);
  try {
    await getProvider().sendRawTransaction(hex);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isAlreadyKnownError(message)) throw new Error(`The network rejected the transaction: ${message}`);
  }
  return txid;
}

export const fetchRawTx = (txid: string) => getProvider().getRawTransaction(txid);
