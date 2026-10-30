import { useMemo, useState, type ReactNode } from 'react';
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
          <span className="token-label">CashTokens address</span>
          <code title={PROJECT_TOKEN_ADDRESS}>{PROJECT_TOKEN_ADDRESS}</code>
          <CopyButton text={PROJECT_TOKEN_ADDRESS} label="Copy" variant="banner" />
        </span>
        {NETWORK !== 'mainnet' && <span className="net-badge">Test network: {NETWORK}</span>}
      </nav>
    </header>
  );
}

export function CopyButton({ text, label = 'Copy link', variant = 'secondary' }: { text: string; label?: string; variant?: 'secondary' | 'banner' }) {
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
    <button type="button" className={variant === 'banner' ? 'btn-banner' : 'btn btn-secondary'} onClick={copy}>
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

/** QR code as inline SVG (byte mode, so lowercase URLs work). */
export function QrCode({ value, size = 168, label }: { value: string; size?: number; label: string }) {
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
      <path d={path} fill="#16150f" />
    </svg>
  );
}

/** Address with the last 8 characters marked: that is what people compare by eye. */
export function Address({ value }: { value: string }) {
  const i = value.indexOf(':');
  const prefix = i === -1 ? '' : value.slice(0, i + 1);
  const body = i === -1 ? value : value.slice(i + 1);
  return (
    <code className="address">
      {prefix && <span className="addr-prefix">{prefix}</span>}
      {body.slice(0, -8)}
      <mark>{body.slice(-8)}</mark>
    </code>
  );
}

export function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const isOverdue = (due: string) => due < new Date().toISOString().slice(0, 10);

export interface Stub {
  commitment: string;
  category?: string;
  txid?: string;
}

/**
 * The invoice printed as a thermal receipt. Optional rubber stamp (paid / mismatch), a QR printed at the
 * foot, and the torn-off NFT stub that carries the invoice fingerprint.
 */
export function ReceiptPaper({
  invoice,
  stamp,
  qr,
  stub,
  draft,
}: {
  invoice: Invoice;
  stamp?: 'paid' | 'mismatch';
  qr?: ReactNode;
  stub?: Stub;
  draft?: boolean;
}) {
  const hasAmount = invoice.sats > 0;
  return (
    <div className={`paper-stack${draft ? ' is-draft' : ''}`}>
      <article className="paper" aria-label="Invoice">
        <header className="paper-head">
          <p className="paper-shop">BCH Paylink</p>
          <p className="paper-kind">Invoice</p>
        </header>
        <p className="paper-memo">{invoice.memo || (draft ? 'What it is for' : 'Payment')}</p>
        <hr className="rule-dash" />
        <dl className="paper-lines">
          <div>
            <dt>Pay to</dt>
            <dd>{invoice.payee ? <Address value={invoice.payee} /> : <span className="placeholder">your address</span>}</dd>
          </div>
          {invoice.due && (
            <div className="paper-row">
              <dt>Due</dt>
              <dd>
                {invoice.due}
                {isOverdue(invoice.due) && <span className="overdue"> past due</span>}
              </dd>
            </div>
          )}
          <div className="paper-row">
            <dt>Network</dt>
            <dd>{NETWORK}</dd>
          </div>
        </dl>
        <hr className="rule-double" />
        <div className="paper-total">
          <span>Total</span>
          <span className="paper-amount">{hasAmount ? formatSatsAsBch(invoice.sats) : '0'} BCH</span>
        </div>
        <p className="paper-sats">{formatSats(invoice.sats)} sats</p>
        {qr && <div className="paper-qr">{qr}</div>}
        <p className="paper-foot">Paid from your own wallet. The same transaction gives you an NFT receipt.</p>
        {stamp && (
          <div className={`rubber-stamp ${stamp === 'paid' ? 'stamp-paid' : 'stamp-bad'}`} role="status">
            {stamp === 'paid' ? 'Paid' : 'Not this invoice'}
          </div>
        )}
      </article>
      {stub && (
        <aside className="stub" aria-label="NFT receipt">
          <p className="stub-title">NFT receipt</p>
          <dl>
            <div>
              <dt>Invoice fingerprint</dt>
              <dd><code>{stub.commitment}</code></dd>
            </div>
            {stub.category && (
              <div>
                <dt>Token category</dt>
                <dd><code>{stub.category}</code></dd>
              </div>
            )}
          </dl>
        </aside>
      )}
    </div>
  );
}

export function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      <p className="notice-title">{title}</p>
      {children}
    </div>
  );
}
