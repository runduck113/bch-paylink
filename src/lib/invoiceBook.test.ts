import { describe, it, expect } from 'vitest';
import { BOOK_KEY, BOOK_LIMIT, forgetInvoice, readBook, rememberInvoice } from './invoiceBook';

const memoryStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: m,
  };
};
const broken = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('invoice book (invoices printed in this browser)', () => {
  it('remembers newest first, once each', () => {
    const s = memoryStorage();
    rememberInvoice(s, 'aaa');
    rememberInvoice(s, 'bbb');
    rememberInvoice(s, 'aaa');
    expect(readBook(s)).toEqual(['aaa', 'bbb']);
  });
  it(`keeps at most ${BOOK_LIMIT}`, () => {
    const s = memoryStorage();
    for (let i = 0; i < BOOK_LIMIT + 5; i++) rememberInvoice(s, `e${i}`);
    const book = readBook(s);
    expect(book).toHaveLength(BOOK_LIMIT);
    expect(book[0]).toBe(`e${BOOK_LIMIT + 4}`);
  });
  it('forgets one', () => {
    const s = memoryStorage();
    rememberInvoice(s, 'aaa');
    rememberInvoice(s, 'bbb');
    forgetInvoice(s, 'aaa');
    expect(readBook(s)).toEqual(['bbb']);
  });
  it('reads junk or foreign values as an empty book', () => {
    const s = memoryStorage();
    s.setItem(BOOK_KEY, '{not json');
    expect(readBook(s)).toEqual([]);
    s.setItem(BOOK_KEY, JSON.stringify([1, 'ok', null, 'bad space']));
    expect(readBook(s)).toEqual(['ok']);
  });
  it('never throws when storage is blocked or missing', () => {
    expect(readBook(broken)).toEqual([]);
    expect(() => rememberInvoice(broken, 'aaa')).not.toThrow();
    expect(() => forgetInvoice(broken, 'aaa')).not.toThrow();
    expect(readBook(null)).toEqual([]);
  });
});
