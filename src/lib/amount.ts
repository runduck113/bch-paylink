/** 1 BCH = 100,000,000 satoshis. */
export const SATS_PER_BCH = 100_000_000n;
const BCH_DECIMALS = 8;

/** Parse a decimal BCH amount ("0.0001", "1", ".5") into satoshis without floating point. */
export function parseBchToSats(text: string): { sats: bigint } | { error: string } {
  const t = text.trim().replace(',', '.');
  if (t === '') return { error: 'Enter an amount.' };
  const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
  if (!m || (m[1] === '' && (m[2] ?? '') === '')) return { error: 'Amount must be a number like 0.001.' };
  const frac = m[2] ?? '';
  if (frac.length > BCH_DECIMALS) return { error: 'BCH has at most 8 decimal places.' };
  const sats = BigInt(m[1] || '0') * SATS_PER_BCH + BigInt((frac + '0'.repeat(BCH_DECIMALS)).slice(0, BCH_DECIMALS));
  return { sats };
}

/** Format satoshis as a BCH string with trailing zeros trimmed ("0.0001"). */
export function formatSatsAsBch(sats: bigint | number): string {
  const s = BigInt(sats);
  const neg = s < 0n;
  const abs = neg ? -s : s;
  const whole = abs / SATS_PER_BCH;
  const frac = (abs % SATS_PER_BCH).toString().padStart(BCH_DECIMALS, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

/** Group digits: 12345 -> "12,345". */
export const formatSats = (sats: bigint | number) => BigInt(sats).toLocaleString('en-US');
