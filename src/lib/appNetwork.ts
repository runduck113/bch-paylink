/** Networks the web app can run on (the lib also knows 'testnet', which the app does not offer). */
export type AppNetwork = 'mainnet' | 'chipnet';

/**
 * VITE_NETWORK decides the network. Unset: chipnet in dev, mainnet in production builds.
 * Any other value is a configuration mistake and fails loudly.
 */
export function resolveNetwork(value: string | undefined, isDev: boolean): AppNetwork {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') return isDev ? 'chipnet' : 'mainnet';
  if (v === 'mainnet' || v === 'chipnet') return v;
  throw new Error(`VITE_NETWORK must be "mainnet" or "chipnet", got "${value}".`);
}
