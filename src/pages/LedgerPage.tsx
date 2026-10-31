import { memo, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { EXPLORER_TX_URL, NETWORK } from '../config';
import { decodeInvoice, type Invoice } from '../lib/invoice';
import {
  extractEncodedInvoice,
  invoicesFor,
  isoDate,
  ledgerCsv,
  ledgerEntry,
  ledgerTotals,
  matchInvoices,
  parseLedgerTx,
  readHistory,
  readVerboseTx,
  sellerScript,
  type HistoryRow,
  type InvoiceMatch,
  type LedgerEntry,
  type SellerScript,
} from '../lib/ledger';
import { browserStore, forgetInvoice, readBook, rememberInvoice } from '../lib/invoiceBook';
import { formatSats, formatSatsAsBch } from '../lib/amount';
import { ledgerHash, receiptHash } from '../lib/routes';
import { cashAddrPrefix } from '../lib/network';
import { Address, Counter, ErrorBox, PaperHead, Perforation, Slip } from '../components/ui';
import { truncateMiddle } from '../components/format';
import { fetchHistory, fetchTxVerbose } from '../wallet/electrum';

/** Transactions read per "load more". */
const PAGE_SIZE = 50;
/** Parallel Electrum requests while reading a page. */
const BATCH = 10;

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function LedgerPage({ addr }: { addr?: string }) {
  const seller = addr ? sellerScript(addr, NETWORK) : null;
  const note = (
    <>
      <h1>Ledger</h1>
      <p className="lede">Every payment to your address, read from the chain. Payments made through a BCH Paylink invoice carry an NFT receipt; the ledger matches each receipt to the invoice it names.</p>
      <p className="lede lede-quiet">Nothing is stored on a server. Invoices you printed in this browser are matched on their own; paste any other invoice link to check it.</p>
    </>
  );
  if (!seller || 'error' in seller) {
    return (
      <Counter note={note}>
        <Slip label="Ledger">
          <PaperHead kind="Ledger" />
          <AddressForm initial={addr ?? ''} error={seller && 'error' in seller ? seller.error : undefined} />
        </Slip>
      </Counter>
    );
  }
  return <Ledger key={seller.address} seller={seller} note={note} />;
}

function AddressForm({ initial, error }: { initial: string; error?: string }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    window.location.hash = ledgerHash(value.trim());
  };
  return (
    <form className="slip-form" onSubmit={submit} noValidate>
      <div className="line">
        <label className="line-label" htmlFor={`${id}-addr`}>Your address</label>
        <input
          id={`${id}-addr`}
          className="ink-input"
          placeholder={`${cashAddrPrefix(NETWORK)}:q…`}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s+/g, ''))}
          aria-describedby={error ? `${id}-addr-hint ${id}-addr-err` : `${id}-addr-hint`}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <p className="line-hint" id={`${id}-addr-hint`}>The address your invoices are paid to. Only public chain data is read.</p>
      </div>
      {error && (
        <ErrorBox title="Can’t open this ledger">
          <p id={`${id}-addr-err`}>{error}</p>
        </ErrorBox>
      )}
      <button type="submit" className="btn btn-primary btn-wide">Open ledger</button>
    </form>
  );
}

type History = { k: 'loading' } | { k: 'error'; message: string } | { k: 'ok'; rows: HistoryRow[] };

/** Reads one page of history rows into ledger lines (rows that don't pay the seller are dropped). */
async function readPage(rows: HistoryRow[], seller: SellerScript): Promise<LedgerEntry[]> {
  const out: LedgerEntry[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = await Promise.all(
      rows.slice(i, i + BATCH).map(async (row) => {
        const { hex, time } = readVerboseTx(await fetchTxVerbose(row.txid));
        const tx = parseLedgerTx(hex, NETWORK);
        if (tx.txid !== row.txid) throw new Error('The server sent a different transaction.');
        return ledgerEntry(tx, seller.lockHex, row.height, row.height > 0 ? time : undefined);
      }),
    );
    for (const e of batch) if (e) out.push(e);
  }
  return out;
}

function Ledger({ seller, note }: { seller: SellerScript; note: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState<History>({ k: 'loading' });
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  /** How many history rows have been read into `entries`. */
  const [read, setRead] = useState(0);
  /** Rows wanted so far: grows by PAGE_SIZE on "load more". */
  const [wanted, setWanted] = useState(PAGE_SIZE);
  const [pageError, setPageError] = useState<string | null>(null);
  const [book, setBook] = useState(() => readBook(browserStore()));

  useEffect(() => {
    let live = true;
    // The component is keyed by address, so only a retry re-runs this; nothing was read before a history error.
    setHistory({ k: 'loading' });
    fetchHistory(seller.scriptHash)
      .then((answer) => {
        if (live) setHistory({ k: 'ok', rows: readHistory(answer) });
      })
      .catch((e) => {
        if (live) setHistory({ k: 'error', message: messageOf(e) });
      });
    return () => {
      live = false;
    };
  }, [seller.scriptHash, attempt]);

  const rows = history.k === 'ok' ? history.rows : null;
  const reading = rows !== null && read < Math.min(wanted, rows.length) && pageError === null;

  useEffect(() => {
    if (!rows || !reading) return;
    let live = true;
    const slice = rows.slice(read, Math.min(wanted, rows.length));
    readPage(slice, seller)
      .then((more) => {
        if (!live) return;
        setEntries((prev) => [...prev, ...more]);
        setRead((n) => n + slice.length);
      })
      .catch((e) => {
        if (live) setPageError(messageOf(e));
      });
    return () => {
      live = false;
    };
  }, [rows, read, wanted, reading, seller]);

  const known = useMemo(() => {
    const decoded: { encoded: string; invoice: Invoice }[] = [];
    for (const encoded of book) {
      try {
        decoded.push({ encoded, invoice: decodeInvoice(encoded) });
      } catch {
        /* an old or damaged entry: skip it */
      }
    }
    const mine = new Set(invoicesFor(decoded.map((d) => d.invoice), seller, NETWORK));
    return decoded.filter((d) => mine.has(d.invoice));
  }, [book, seller]);

  const matched = useMemo(() => matchInvoices(known.map((k) => k.invoice), entries), [known, entries]);
  const totals = useMemo(() => ledgerTotals(entries, matched.invoices), [entries, matched]);
  /** Where focus goes when the button that was pressed disappears while reading. */
  const scopeRef = useRef<HTMLParagraphElement>(null);
  const keepFocus = () => scopeRef.current?.focus();
  const encodedOf = useMemo(() => new Map(known.map((k) => [k.invoice, k.encoded])), [known]);
  const byCommitment = useMemo(() => new Map(matched.invoices.map((m) => [m.commitment, m])), [matched]);
  const more = rows ? rows.length - read : 0;
  const complete = rows !== null && read >= rows.length;

  const addInvoice = (encoded: string) => {
    const store = browserStore();
    rememberInvoice(store, encoded);
    const saved = readBook(store);
    // Storage blocked: keep the invoice for this visit anyway.
    setBook(saved.includes(encoded) ? saved : [encoded, ...book.filter((e) => e !== encoded)]);
  };
  const removeInvoice = (encoded: string) => {
    forgetInvoice(browserStore(), encoded);
    setBook((b) => b.filter((e) => e !== encoded));
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([ledgerCsv(entries, matched.invoices)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bch-paylink-ledger-${truncateMiddle(seller.address, 6, 6).replace('…', '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <Counter note={note}>
      <Slip label="Ledger">
        <PaperHead kind="Ledger" />
        <div className="line">
          <p className="line-label">Paid to</p>
          <p className="line-value"><Address value={seller.address} /></p>
        </div>

        {history.k === 'loading' && <p className="working" role="status">Reading the address history on {NETWORK}…</p>}
        {history.k === 'error' && (
          <div className="paper-section">
            <ErrorBox title="Couldn’t reach the network">
              <p>{history.message}</p>
              <p>The public Electrum server didn’t answer. Nothing is wrong with your address.</p>
            </ErrorBox>
            <button type="button" className="btn btn-secondary btn-wide" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
          </div>
        )}

        {rows && (
          <>
            <dl className="ledger ledger-totals" aria-label="Totals">
              <div><dt>Received with a Paylink receipt</dt><dd>{formatSatsAsBch(totals.paylinkSats)} BCH <span className="tally">({totals.paylinkCount})</span></dd></div>
              <div><dt>Plain payments</dt><dd>{formatSatsAsBch(totals.plainSats)} BCH <span className="tally">({totals.plainCount})</span></dd></div>
              <div><dt>Known invoices paid</dt><dd>{totals.paid}</dd></div>
              <div><dt>Known invoices unpaid</dt><dd>{totals.unpaid}</dd></div>
            </dl>
            <p className="line-hint ledger-scope" aria-live="polite" ref={scopeRef} tabIndex={-1}>
              {reading
                ? `Reading transactions ${read + 1}–${Math.min(wanted, rows.length)} of ${rows.length}…`
                : rows.length === 0
                  ? 'No transactions yet.'
                  : complete
                    ? `All ${rows.length} transactions read.`
                    : `Latest ${read} of ${rows.length} transactions read. Older ones are not counted yet.`}
            </p>

            <InvoicePanel
              matches={matched.invoices}
              encodedOf={encodedOf}
              complete={complete}
              seller={seller}
              onAdd={addInvoice}
              onRemove={removeInvoice}
            />

            <section className="paper-section" aria-label="Payments received">
              <Perforation />
              <h2 className="line-label">Payments received</h2>
              {rows.length === 0 ? (
                <div className="ledger-empty">
                  <p>Nothing has been paid to this address on {NETWORK} yet.</p>
                  <p className="line-hint">When a buyer pays one of your invoices, it shows here with its receipt.</p>
                </div>
              ) : entries.length === 0 && !reading && pageError === null ? (
                <p className="ledger-empty">No incoming payments in the transactions read so far. The rest are payments sent from this address.</p>
              ) : (
                <ol className="tape">
                  {entries.map((e) => (
                    <TapeLine key={e.txid} entry={e} match={e.receipt ? byCommitment.get(e.receipt.commitment) : undefined} encodedOf={encodedOf} />
                  ))}
                </ol>
              )}
              {reading && <p className="working" aria-hidden="true">{entries.length > 0 ? 'Reading more' : 'Reading transactions'}</p>}
              {pageError && (
                <>
                  <ErrorBox title="Stopped reading transactions">
                    <p>{pageError}</p>
                  </ErrorBox>
                  <button type="button" className="btn btn-secondary btn-wide" onClick={() => {
                      keepFocus();
                      setPageError(null);
                    }}
                  >
                    Try again
                  </button>
                </>
              )}
              {!reading && !pageError && more > 0 && (
                <button type="button" className="btn btn-secondary btn-wide" onClick={() => {
                    keepFocus();
                    setWanted(read + PAGE_SIZE);
                  }}
                >
                  Load {Math.min(PAGE_SIZE, more)} older transactions
                </button>
              )}
              {entries.length > 0 && (
                <button type="button" className="btn btn-primary btn-wide" onClick={exportCsv} disabled={reading}>Export CSV</button>
              )}
            </section>
          </>
        )}
        <p className="paper-foot">Read live from public Electrum servers. Amounts are what each transaction paid this address.</p>
        <p className="paper-again"><a className="text-button" href="#/">Print an invoice</a></p>
      </Slip>
    </Counter>
  );
}

const STATUS_TEXT = { paid: 'Paid', underpaid: 'Paid short', unpaid: 'Unpaid' } as const;

function InvoicePanel({
  matches,
  encodedOf,
  complete,
  seller,
  onAdd,
  onRemove,
}: {
  matches: InvoiceMatch[];
  encodedOf: Map<Invoice, string>;
  complete: boolean;
  seller: SellerScript;
  onAdd: (encoded: string) => void;
  onRemove: (encoded: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = extractEncodedInvoice(text);
    if ('error' in r) return setError(r.error);
    if (invoicesFor([r.invoice], seller, NETWORK).length === 0) return setError('This invoice is paid to a different address than this ledger.');
    setError(null);
    setText('');
    onAdd(r.encoded);
  };
  return (
    <section className="paper-section" aria-label="Invoices">
      <Perforation />
      <h2 className="line-label">Invoices</h2>
      {matches.length === 0 ? (
        <p className="line-hint">No invoices for this address in this browser yet. Paste a pay link below to check whether it was paid.</p>
      ) : (
        <ul className="invoice-list">
          {matches.map((m) => {
            const encoded = encodedOf.get(m.invoice) ?? '';
            return (
              <li key={m.commitment} className={`invoice-row is-${m.status}`}>
                <div className="invoice-main">
                  <span className="invoice-memo">{m.invoice.memo || 'Payment'}</span>
                  <span className="invoice-amount">{formatSatsAsBch(m.invoice.sats)} BCH</span>
                </div>
                <div className="invoice-meta">
                  <span className={`status-chip chip-${m.status}`}>{STATUS_TEXT[m.status]}</span>
                  {m.paidBy ? (
                    <a href={receiptHash(m.paidBy.txid, encoded || undefined)}>receipt {m.paidBy.txid.slice(0, 8)}…</a>
                  ) : (
                    <span className="line-hint">{complete ? 'no receipt on chain' : 'not in the transactions read so far'}</span>
                  )}
                  <button type="button" className="text-button" onClick={() => onRemove(encoded)} aria-label={`Forget invoice “${m.invoice.memo || 'Payment'}”`}>
                    Forget
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form className="invoice-add" onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor={`${id}-inv`}>Invoice link</label>
        <input
          id={`${id}-inv`}
          className="link-field"
          placeholder="Paste a pay link (…/#/pay/…)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-inv-err` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="btn btn-secondary">Check</button>
      </form>
      {error && <p className="error-text line-hint" id={`${id}-inv-err`} role="alert">{error}</p>}
    </section>
  );
}

const TapeLine = memo(function TapeLine({ entry, match, encodedOf }: { entry: LedgerEntry; match?: InvoiceMatch; encodedOf: Map<Invoice, string> }) {
  const when = entry.height > 0 ? `${entry.time !== undefined ? isoDate(entry.time) + ' · ' : ''}block ${entry.height}` : 'unconfirmed';
  const settles = match && match.paidBy?.txid === entry.txid;
  return (
    <li className={`tape-line${entry.receipt ? ' is-receipt' : ''}`}>
      <div className="tape-head">
        <span className="tape-when">{when}</span>
        <span className="tape-amount">+{formatSatsAsBch(entry.received)} BCH</span>
      </div>
      <div className="tape-head">
        <span className={`kind-chip${entry.receipt ? ' kind-receipt' : ''}`}>{entry.receipt ? 'Paylink receipt' : 'Plain payment'}</span>
        <span className="tape-sats">{formatSats(entry.received)} sats</span>
      </div>
      <p className="tape-tx">
        tx <a href={EXPLORER_TX_URL[NETWORK] + entry.txid} target="_blank" rel="noreferrer" title={entry.txid}>{entry.txid.slice(0, 10)}…{entry.txid.slice(-6)}<span className="sr-only"> (opens the explorer in a new tab)</span></a>
      </p>
      {entry.receipt && (
        <>
          <p className="tape-fp">fingerprint <code>{entry.receipt.commitment}</code></p>
          <p className="tape-match">
            {match ? (
              <>
                {settles ? (match.status === 'paid' ? 'Pays ' : 'Pays part of ') : 'Another receipt for '}
                “{match.invoice.memo || 'Payment'}”
                {' · '}
                <a href={receiptHash(entry.txid, encodedOf.get(match.invoice))}>check receipt</a>
              </>
            ) : (
              <>
                Receipt for an invoice not in this browser
                {' · '}
                <a href={receiptHash(entry.txid)}>see receipt</a>
              </>
            )}
          </p>
        </>
      )}
    </li>
  );
});
