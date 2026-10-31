import { ElectrumNetworkProvider, Network } from 'cashscript';
import { NETWORK } from '../config';
import { isAlreadyKnownError, isDefiniteRejection, txidOf } from '../lib/txReceipt';

let provider: ElectrumNetworkProvider | null = null;

/** One shared Electrum connection per page (cashscript connects on demand and idles out). */
export function getProvider(): ElectrumNetworkProvider {
  provider ??= new ElectrumNetworkProvider(NETWORK === 'mainnet' ? Network.MAINNET : Network.CHIPNET);
  return provider;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The node refused the transaction: nothing was sent, so planning a new one is safe. */
export class BroadcastRejectedError extends Error {
  constructor(reason: string) {
    super(`The network refused the transaction, nothing was sent: ${reason}`);
    this.name = 'BroadcastRejectedError';
  }
}

/** We could not tell whether the signed transaction reached the network. Never re-plan; resend the same hex. */
export class BroadcastUnknownError extends Error {
  readonly txid: string;
  readonly hex: string;
  constructor(txid: string, hex: string, reason: string) {
    super(`Could not confirm the transaction reached the network (${reason}).`);
    this.name = 'BroadcastUnknownError';
    this.txid = txid;
    this.hex = hex;
  }
}

async function isKnown(txid: string): Promise<boolean> {
  try {
    await getProvider().getRawTransaction(txid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Broadcast a signed tx and return its txid. "Already known" (e.g. the wallet broadcast it too) is success.
 * A clear node rejection throws BroadcastRejectedError; any other failure is checked by looking the txid up,
 * and if still unclear throws BroadcastUnknownError carrying the hex, so the caller can resend the same tx.
 */
export async function broadcast(hex: string): Promise<string> {
  const txid = txidOf(hex);
  try {
    await getProvider().sendRawTransaction(hex);
    return txid;
  } catch (e) {
    const message = messageOf(e);
    if (isAlreadyKnownError(message)) return txid;
    // "Inputs already spent" can also mean this very tx is already in (e.g. the wallet broadcast it too).
    if (await isKnown(txid)) return txid;
    if (isDefiniteRejection(message)) throw new BroadcastRejectedError(message);
    throw new BroadcastUnknownError(txid, hex, message);
  }
}

export const fetchRawTx = (txid: string) => getProvider().getRawTransaction(txid);

/** Electrum history of a script hash (raw answer; `readHistory` in lib/ledger checks it). */
export const fetchHistory = (scriptHash: string): Promise<unknown> =>
  getProvider().performRequest('blockchain.scripthash.get_history', scriptHash);

/** A transaction in verbose form (hex plus block time) where the server supports it (`readVerboseTx` reads both). */
export const fetchTxVerbose = (txid: string): Promise<unknown> => getProvider().performRequest('blockchain.transaction.get', txid, true);
