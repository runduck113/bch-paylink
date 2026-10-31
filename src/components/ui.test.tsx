import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PROJECT_TOKEN_ADDRESS, SLIDES_URL } from '../config';
import type { Invoice } from '../lib/invoice';
import CreatePage from '../pages/CreatePage';
import { Banner, InvoiceLines, NftStub, Slip } from './ui';

describe('Banner (contest rule)', () => {
  const html = renderToStaticMarkup(<Banner />);
  it('links slides (or says soon) and GitHub', () => {
    expect(html).toContain(SLIDES_URL ? 'Slides' : 'Slides (soon)');
    expect(html).toContain('github.com/runduck113/bch-paylink');
  });
  it('shows the CashTokens address shortened, keeps the full one for screen readers and copying', () => {
    expect(html).toContain('zz8l22vp…zf0mhn77');
    expect(html).toContain(`class="sr-only">${PROJECT_TOKEN_ADDRESS}<`);
    expect(html).toContain('aria-label="Copy CashTokens address"');
  });
});

describe('CreatePage: the slip is the form', () => {
  const html = renderToStaticMarkup(<CreatePage />);
  it('every field typed on the paper has a real label', () => {
    const ids = [...html.matchAll(/<(?:input|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(html).toContain(`for="${id}"`);
    for (const name of ['>For<', '>Pay to<', '>Due ', '>Total<']) expect(html).toContain(name);
  });
  it('sits under the printer and has the print key', () => {
    expect(html).toContain('class="printer"');
    expect(html).toMatch(/<button type="submit"[^>]*>Print payment link<\/button>/);
  });
});

describe('Slip and stub', () => {
  const invoice: Invoice = { v: 1, payee: 'bchtest:qqqszqgpqyqszqgpqyqszqgpqyqszqgpqy8kvl0kqa', sats: 250_000, memo: 'Logo design', currency: 'BCH' };
  it('prints the invoice lines and the stamp', () => {
    const html = renderToStaticMarkup(
      <Slip label="Invoice" stamp="paid">
        <InvoiceLines invoice={invoice} />
      </Slip>,
    );
    expect(html).toContain('Logo design');
    expect(html).toContain('0.0025');
    expect(html).toContain('250,000 sats');
    expect(html).toContain('On receipt');
    expect(html).toContain('aria-label="Stamped: Paid"');
  });
  it('NFT stub carries the fingerprint', () => {
    const html = renderToStaticMarkup(<NftStub stub={{ commitment: 'ab'.repeat(20), category: 'cd'.repeat(32) }} />);
    expect(html).toContain('ab'.repeat(20));
    expect(html).toContain('cd'.repeat(32));
  });
});
