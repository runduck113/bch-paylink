import { useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { NETWORK, GITHUB_URL, PROJECT_TOKEN_ADDRESS, SLIDES_URL } from '../config';
import type { Invoice } from '../lib/invoice';
import { formatSats, formatSatsAsBch } from '../lib/amount';

export function Banner() {
  return (
    <header className="banner">
      <a className="brand" href="#/">BCH Paylink</a>
      <nav className="banner-links" aria-label="Project links">
        <a href={SLIDES_URL} target="_blank" rel="noreferrer">Slides</a>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        <span className="token-addr">
          <span className="token-label">Project CashTokens address</span>
          <code title={PROJECT_TOKEN_ADDRESS}>{PROJECT_TOKEN_ADDRESS}</code>
          <CopyButton text={PROJECT_TOKEN_ADDRESS} label="Copy" small />
        </span>
        {NETWORK !== 'mainnet' && <span className="net-badge">Test network: {NETWORK}</span>}
      </nav>
    </header>
  );
}

export function CopyButton({ text, label = 'Copy link', small }: { text: string; label?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1600);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  return (
    <button type="button" className={small ? 'btn btn-ghost btn-small' : 'btn btn-secondary'} onClick={copy} aria-live="polite">
      {done ? 'Copied' : label}
    </button>
  );
}

/** QR code as inline SVG (byte mode, so lowercase URLs work). */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { path: d, n: count };
  }, [value]);
  return (
    <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#121a24" />
    </svg>
  );
}

const shortAddr = (a: string) => {
  const [prefix, body] = a.includes(':') ? a.split(':') : ['', a];
  return { prefix, head: body.slice(0, body.length - 8), tail: body.slice(-8) };
};

/** Address with the last 8 characters emphasised: that is what people compare by eye. */
export function Address({ value }: { value: string }) {
  const s = shortAddr(value);
  return (
    <code className="address">
      {s.prefix && <span className="addr-prefix">{s.prefix}:</span>}
      {s.head}
      <strong>{s.tail}</strong>
    </code>
  );
}

const isOverdue = (due: string) => due < new Date().toISOString().slice(0, 10);

/** The invoice as a paper slip: the one visual anchor of the app. */
export function InvoiceSlip({ invoice, stamp }: { invoice: Invoice; stamp?: React.ReactNode }) {
  return (
    <article className="slip" aria-label="Invoice">
      <div className="slip-body">
        <p className="slip-memo">{invoice.memo || 'Payment'}</p>
        <p className="slip-amount">
          <span className="amount-num">{formatSatsAsBch(invoice.sats)}</span>
          <span className="amount-unit">BCH</span>
        </p>
        <p className="slip-sats">{formatSats(invoice.sats)} sats</p>
        <dl className="slip-fields">
          <div>
            <dt>Pay to</dt>
            <dd><Address value={invoice.payee} /></dd>
          </div>
          {invoice.due && (
            <div>
              <dt>Due</dt>
              <dd>
                {invoice.due}
                {isOverdue(invoice.due) && <span className="overdue"> (past due)</span>}
              </dd>
            </div>
          )}
        </dl>
      </div>
      {stamp && <div className="slip-stamp">{stamp}</div>}
    </article>
  );
}

export function ErrorBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="notice notice-error" role="alert">
      <p className="notice-title">{title}</p>
      {children}
    </div>
  );
}
