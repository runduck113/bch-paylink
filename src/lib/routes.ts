/** Hash routes, so the app works on any static host without rewrite rules. */
export type Route =
  | { page: 'create' }
  | { page: 'pay'; encoded: string }
  | { page: 'receipt'; txid: string; encoded?: string }
  | { page: 'notFound' };

const TXID = /^[0-9a-f]{64}$/;

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const q = h.indexOf('?');
  const path = q === -1 ? h : h.slice(0, q);
  const query = q === -1 ? '' : h.slice(q + 1);
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { page: 'create' };
  if (parts[0] === 'pay' && parts.length === 2) return { page: 'pay', encoded: parts[1] };
  if (parts[0] === 'receipt' && parts.length === 2) {
    const txid = parts[1].toLowerCase();
    if (!TXID.test(txid)) return { page: 'notFound' };
    const inv = new URLSearchParams(query).get('inv');
    return inv ? { page: 'receipt', txid, encoded: inv } : { page: 'receipt', txid };
  }
  return { page: 'notFound' };
}

export const payHash = (encoded: string) => `#/pay/${encoded}`;
export const receiptHash = (txid: string, encoded?: string) => `#/receipt/${txid}` + (encoded ? `?inv=${encoded}` : '');

/** Absolute link for sharing: current page URL without its hash, plus the route hash. */
export const absoluteLink = (pageUrl: string, hash: string) => pageUrl.split('#')[0] + hash;
