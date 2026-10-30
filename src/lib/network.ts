export type Network = 'mainnet' | 'testnet' | 'chipnet';

export const cashAddrPrefix = (network: Network): 'bitcoincash' | 'bchtest' =>
  network === 'mainnet' ? 'bitcoincash' : 'bchtest';
