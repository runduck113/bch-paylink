import { resolveNetwork, type AppNetwork } from './lib/appNetwork';

/** Hackathon banner links. Leave SLIDES_URL empty until the slides are public; the banner then shows "Slides (soon)". */
export const SLIDES_URL: string = 'https://docs.google.com/presentation/d/1b6KO1aTGUeWA0oWCafc7ZTAp0i3hFmOKYymTJ6YXZTI/edit?usp=sharing';
export const GITHUB_URL = 'https://github.com/runduck113/bch-paylink';
/** Project CashTokens address shown in the banner (owner's Paytaca wallet, public). */
export const PROJECT_TOKEN_ADDRESS = 'bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77';

/** Set with VITE_NETWORK=mainnet|chipnet. Unset: chipnet in `vite dev`, mainnet in `vite build`. */
export const NETWORK: AppNetwork = resolveNetwork(import.meta.env.VITE_NETWORK, import.meta.env.DEV);

/** Where "View on explorer" links go, per network (CashTokens-aware explorers). */
export const EXPLORER_TX_URL: Record<AppNetwork, string> = {
  mainnet: 'https://blockchair.com/bitcoin-cash/transaction/',
  chipnet: 'https://chipnet.imaginary.cash/tx/',
};

/** Fee rate for payments, sat/byte (BCH relay minimum is 1). */
export const FEE_RATE_SAT_PER_BYTE = 1;
/** How many receive and change addresses of the connected wallet to scan for coins. */
export const WALLET_ADDRESS_SCAN_COUNT = 20;

export const DAPP_NAME = 'BCH Paylink';

/**
 * The first real mainnet payment (Paytaca over WizardConnect, 10,000 sats + NFT receipt) and the invoice it paid.
 * The create page links its receipt so anyone without a wallet can see a verified payment, checked live from the chain.
 */
export const DEMO_RECEIPT = {
  txid: 'd4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f',
  invoice: 'eyJ2IjoxLCJwYXllZSI6ImJpdGNvaW5jYXNoOnF6OGwyMnZwY3gwMzdrbHNxaGEzanpxcThsc254NGprcnk5cnU5ZTRwZCIsInNhdHMiOjEwMDAwLCJtZW1vIjoiVGVzdCIsImN1cnJlbmN5IjoiQkNIIn0',
} as const;
