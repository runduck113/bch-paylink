import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { NETWORK, GITHUB_URL, PROJECT_TOKEN_ADDRESS, SLIDES_URL } from '../config';
import type { Invoice } from '../lib/invoice';
import { formatSats, formatSatsAsBch } from '../lib/amount';
import { truncateMiddle } from './format';

/** Contest banner: slides, repo and the project CashTokens address. A quiet strip above the counter. */
export function Banner() {
  return (
    <header className="banner">
      <div className="banner-id">
        <a className="brand" href="#/">
          <BrandMark />
          BCH Paylink
        </a>
        {NETWORK !== 'mainnet' && (
          <span className="net-badge"><span className="net-long">Test network · </span>{NETWORK}</span>
        )}
      </div>
      <nav className="banner-links" aria-label="Project links">
        {SLIDES_URL ? (
          <a href={SLIDES_URL} target="_blank" rel="noreferrer">Slides</a>
        ) : (
          <span className="banner-soon">Slides (soon)</span>
        )}
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        <span className="token-addr">
          <span className="token-label">CashTokens</span>
          <code title={PROJECT_TOKEN_ADDRESS}>
            <span aria-hidden="true">{truncateMiddle(PROJECT_TOKEN_ADDRESS)}</span>
            <span className="sr-only">{PROJECT_TOKEN_ADDRESS}</span>
          </code>
          <CopyButton text={PROJECT_TOKEN_ADDRESS} label="Copy CashTokens address" variant="icon" />
        </span>
      </nav>
    </header>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 16 20" aria-hidden="true">
      <path d="M1 1h14v18l-2.33-1.6L10.33 19 8 17.4 5.67 19l-2.34-1.6L1 19z" fill="currentColor" />
      <path d="M4.5 6h7M4.5 9.5h7M4.5 13h4" stroke="#0e0e0d" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CopyButton({
  text,
  label = 'Copy link',
  variant = 'secondary',
}: {
  text: string;
  label?: string;
  variant?: 'secondary' | 'icon';
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (!alive.current) return;
      setDone(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  if (variant === 'icon') {
    return (
      <>
        <button type="button" className="btn-icon" onClick={copy} aria-label={label} title={label}>
          {done ? <CheckIcon /> : <CopyIcon />}
        </button>
        <span className="sr-only" role="status">{done ? 'Copied' : ''}</span>
      </>
    );
  }
  return (
    <button type="button" className="btn btn-secondary" onClick={copy}>
      <span aria-live="polite">{done ? 'Copied' : label}</span>
    </button>
  );
}

/** Paper colour, so codes printed on the slip blend into it. */
export const PAPER = '#f6f5ef';

/** QR code as inline SVG (byte mode, so lowercase URLs work). */
export function QrCode({ value, size = 184, label }: { value: string; size?: number; label: string }) {
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
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill={PAPER} />
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

function CopyIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 3.5v-1h-8v8h1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The page: a dark counter with a caption on the left, the slip in the middle and an optional second
 * piece of paper (the NFT stub) on the right. On phones they stack.
 */
export function Counter({ note, children, aside }: { note: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <main className="counter">
      <div className="counter-note">{note}</div>
      <div className="counter-slip">{children}</div>
      {aside && <div className="counter-aside">{aside}</div>}
    </main>
  );
}

export type StampKind = 'paid' | 'mismatch' | 'void';
const STAMP_TEXT: Record<StampKind, string> = { paid: 'Paid', mismatch: 'Not this invoice', void: 'Void' };

/**
 * One thermal slip. `printer` shows the printer mouth the paper feeds from; `torn` means it has been torn
 * off (the paper drops a little and shows its torn top edge). Everything inside is printed on the paper.
 */
export function Slip({
  children,
  label,
  printer,
  torn = true,
  stamp,
}: {
  children: ReactNode;
  label: string;
  printer?: boolean;
  torn?: boolean;
  stamp?: StampKind;
}) {
  return (
    <div className={`slip${printer ? ' has-printer' : ''}${torn ? ' is-torn' : ''}`}>
      {printer && <div className="printer" aria-hidden="true" />}
      <article className="paper" aria-label={label}>
        {children}
        {stamp && (
          <div className={`rubber-stamp stamp-${stamp}`} role="img" aria-label={`Stamped: ${STAMP_TEXT[stamp]}`}>
            {STAMP_TEXT[stamp]}
          </div>
        )}
      </article>
    </div>
  );
}

export function PaperHead({ kind }: { kind: string }) {
  return (
    <header className="paper-head">
      <p className="paper-shop">BCH Paylink</p>
      <p className="paper-kind">{kind}</p>
    </header>
  );
}

/** A row of perforations: the line between the invoice and the part that gets torn off or filled in. */
export function Perforation() {
  return <hr className="perf" />;
}

const isOverdue = (due: string) => due < new Date().toISOString().slice(0, 10);

/** The invoice as printed: memo, payee, due date, network, total. */
export function InvoiceLines({ invoice }: { invoice: Invoice }) {
  return (
    <>
      <div className="line">
        <p className="line-label">For</p>
        <p className="line-value line-memo">{invoice.memo || 'Payment'}</p>
      </div>
      <div className="line">
        <p className="line-label">Pay to</p>
        <p className="line-value"><Address value={invoice.payee} /></p>
      </div>
      <div className="line-pair">
        <div className="line">
          <p className="line-label">Due</p>
          <p className="line-value">
            {invoice.due ?? 'On receipt'}
            {invoice.due && isOverdue(invoice.due) && <span className="overdue"> past due</span>}
          </p>
        </div>
        <div className="line line-end">
          <p className="line-label">Network</p>
          <p className="line-value">{NETWORK}</p>
        </div>
      </div>
      <hr className="rule-double" />
      <div className="total">
        <p className="line-label">Total</p>
        <p className="total-figure">
          <span className="total-amount">{formatSatsAsBch(invoice.sats)}</span>
          <span className="total-unit">BCH</span>
        </p>
      </div>
      <p className="total-sats">{formatSats(invoice.sats)} sats</p>
    </>
  );
}

export interface Stub {
  commitment: string;
  category?: string;
}

/** The second, smaller piece of paper: the NFT receipt the buyer keeps. */
export function NftStub({ stub }: { stub: Stub }) {
  return (
    <aside className="stub" aria-label="NFT receipt">
      <p className="stub-title">NFT receipt</p>
      <p className="stub-sub">Held by the buyer. The fingerprint is a hash of the invoice it paid.</p>
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
  );
}

/** A problem printed in red ink on the slip. */
export function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="notice" role="alert">
      <p className="notice-title"><CrossIcon />{title}</p>
      {children}
    </div>
  );
}

/** A small voided slip for dead ends: bad links, missing pages, crashes. */
export function DeadEnd({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Counter note={<h1>{title}</h1>}>
      <Slip label={title} stamp="void">
        <PaperHead kind="Nothing to pay" />
        <div className="paper-section">{children}</div>
      </Slip>
    </Counter>
  );
}
