// Deterministic throwaway addresses for tests (payloads are fixed bytes, no keys involved).
import { encodeCashAddress } from '@bitauth/libauth';

const payload = (byte: number) => new Uint8Array(20).fill(byte);

export const addr = (prefix: 'bitcoincash' | 'bchtest', byte: number, type: 'p2pkh' | 'p2pkhWithTokens' = 'p2pkh') =>
  encodeCashAddress({ prefix, type, payload: payload(byte) }).address;
