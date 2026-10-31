import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DEMO_RECEIPT, NETWORK } from '../config';
import { encodeInvoice, validateInvoice, MAX_MEMO_CHARS, MIN_INVOICE_SATS, type Invoice } from '../lib/invoice';
import { cashAddrPrefix } from '../lib/network';
import { formatSats, formatSatsAsBch, parseBchToSats } from '../lib/amount';
import { ledgerHash, payHash, receiptHash } from '../lib/routes';
import { ledgerLinkFor } from '../lib/ledger';
import { browserStore, rememberInvoice } from '../lib/invoiceBook';
import { Counter, ErrorBox, PaperHead, Slip } from '../components/ui';

/** Query flag on the pay route: the invoice was just printed at the counter, so the pay page starts the wallet pairing. */
export const COUNTER_FLAG = 'counter';

/** The seller's address, kept for this tab so "Print another invoice" doesn't make them paste it again. */
const PAYEE_KEY = 'bch-paylink:payee';
function readPayee(): string {
  try {
    return sessionStorage.getItem(PAYEE_KEY) ?? '';
  } catch {
    return '';
  }
}
function keepPayee(payee: string) {
  try {
    sessionStorage.setItem(PAYEE_KEY, payee);
  } catch {
    /* private mode: the seller types it again */
  }
}

/**
 * The slip is the form: the seller types straight onto the paper. "Print payment link" opens the pay page for
 * that invoice in counter mode: the wallet-pairing QR is on the slip at once, for the buyer to scan.
 */
export default function CreatePage() {
  const id = useId();
  const [payee, setPayee] = useState(readPayee);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  const parsed = amount.trim() ? parseBchToSats(amount) : null;
  const prefix = cashAddrPrefix(NETWORK);
  const memoChars = [...memo].length;
  // Only the address typed on this slip (kept per tab), never one from another session: a fresh visitor gets the address form.
  const ledgerLink = ledgerLinkFor(payee, NETWORK);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountResult = parseBchToSats(amount);
    if ('error' in amountResult) return setErrors([amountResult.error]);
    if (amountResult.sats > BigInt(Number.MAX_SAFE_INTEGER)) return setErrors(['That amount is too large.']);
    const invoice: Invoice = { v: 1, payee: payee.trim(), sats: Number(amountResult.sats), memo: memo.trim(), currency: 'BCH' };
    if (due) invoice.due = due;
    const problems = validateInvoice(invoice, NETWORK);
    setErrors(problems);
    if (problems.length) return;
    keepPayee(invoice.payee);
    const encoded = encodeInvoice(invoice);
    // So the seller's ledger can match it later; storage blocked just means pasting the link there.
    rememberInvoice(browserStore(), encoded);
    window.location.hash = `${payHash(encoded)}?${COUNTER_FLAG}`;
  };

  // The address is a textarea so it can wrap on the paper; Enter still submits, like a single-line field.
  const addressKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const note = (
    <>
      <h1>Print a Bitcoin Cash invoice</h1>
      <p className="lede">Fill in the slip and print it. The buyer scans it with their BCH wallet and pays from it, or you send them the link. They get an NFT receipt that names this exact invoice.</p>
      <p className="lede lede-quiet">No account, no backend. The whole invoice lives in the link.</p>
      {NETWORK === 'mainnet' && (
        <p className="lede">
          No wallet at hand? <a href={receiptHash(DEMO_RECEIPT.txid, DEMO_RECEIPT.invoice)}>See a real paid receipt</a>, checked live against mainnet, or <a href={ledgerHash(DEMO_RECEIPT.payee)}>that seller’s ledger</a>.
        </p>
      )}
    </>
  );

  return (
    <Counter note={note}>
      <Slip label="Invoice" printer torn={false}>
        <PaperHead kind="Invoice" />
        <form ref={formRef} className="slip-form" onSubmit={submit} noValidate>
          <div className="line">
            <div className="line-label-row">
              <label className="line-label" htmlFor={`${id}-memo`}>For</label>
              <span className="line-count" id={`${id}-memo-hint`}>
                {memoChars}/{MAX_MEMO_CHARS}<span className="sr-only"> characters</span>
              </span>
            </div>
            <input
              id={`${id}-memo`}
              className="ink-input ink-memo"
              placeholder="Logo design, October"
              maxLength={MAX_MEMO_CHARS}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              aria-describedby={`${id}-memo-hint`}
              autoComplete="off"
            />
          </div>
          <div className="line">
            <label className="line-label" htmlFor={`${id}-payee`}>Pay to</label>
            <textarea
              id={`${id}-payee`}
              className="ink-input ink-address"
              rows={2}
              placeholder={`${prefix}:q…`}
              value={payee}
              onChange={(e) => setPayee(e.target.value.replace(/\s+/g, ''))}
              onKeyDown={addressKey}
              aria-describedby={`${id}-payee-hint`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <p className="line-hint" id={`${id}-payee-hint`}>Your address. The money goes straight here.</p>
          </div>
          <div className="line-pair">
            <div className="line">
              <label className="line-label" htmlFor={`${id}-due`}>Due <span className="line-optional">optional</span></label>
              <input id={`${id}-due`} className="ink-input ink-date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="line line-end">
              <p className="line-label">Network</p>
              <p className="line-value">{NETWORK}</p>
            </div>
          </div>
          <hr className="rule-double" />
          <div className="total">
            <label className="line-label" htmlFor={`${id}-amount`}>Total<span className="sr-only"> in BCH</span></label>
            <p className="total-figure">
              <input
                id={`${id}-amount`}
                className="ink-input ink-amount"
                inputMode="decimal"
                placeholder="0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-describedby={`${id}-amount-hint`}
                autoComplete="off"
              />
              <span className="total-unit" aria-hidden="true">BCH</span>
            </p>
          </div>
          <p className={`total-sats${parsed && 'error' in parsed ? ' is-bad' : ''}`} id={`${id}-amount-hint`} aria-live="polite">
            {parsed === null
              ? `In BCH. At least ${formatSatsAsBch(MIN_INVOICE_SATS)} (${formatSats(MIN_INVOICE_SATS)} sats).`
              : 'error' in parsed
                ? parsed.error
                : `${formatSats(parsed.sats)} sats`}
          </p>
          {errors.length > 0 && (
            <ErrorBox title="Fix these first">
              <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </ErrorBox>
          )}
          <button type="submit" className="btn btn-primary btn-wide">Print payment link</button>
        </form>
        <p className="paper-foot">Paid from the buyer’s own wallet. The same transaction gives them an NFT receipt.</p>
        <p className="paper-again"><a className="text-button" href={ledgerLink}>Your ledger: payments and paid invoices</a></p>
      </Slip>
    </Counter>
  );
}
