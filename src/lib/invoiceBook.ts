/**
 * Invoices printed in this browser, kept in localStorage as their encoded link parts so the ledger can
 * match them without the seller pasting links. A convenience only: blocked or cleared storage means an
 * empty book, never an error.
 */

export const BOOK_KEY = 'bch-paylink:invoices';
export const BOOK_LIMIT = 200;

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

const ENCODED = /^[A-Za-z0-9_-]+$/;

export function readBook(store: KeyValueStore | null): string[] {
  try {
    const raw: unknown = JSON.parse(store?.getItem(BOOK_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === 'string' && ENCODED.test(e)) : [];
  } catch {
    return [];
  }
}

function writeBook(store: KeyValueStore | null, book: string[]) {
  try {
    store?.setItem(BOOK_KEY, JSON.stringify(book.slice(0, BOOK_LIMIT)));
  } catch {
    /* private mode or full storage: the seller can still paste links */
  }
}

export function rememberInvoice(store: KeyValueStore | null, encoded: string) {
  writeBook(store, [encoded, ...readBook(store).filter((e) => e !== encoded)]);
}

export function forgetInvoice(store: KeyValueStore | null, encoded: string) {
  writeBook(store, readBook(store).filter((e) => e !== encoded));
}

/** `window.localStorage`, or null where reading the property itself throws (some privacy modes). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
