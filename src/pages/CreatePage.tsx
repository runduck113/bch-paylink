import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NETWORK } from '../config';
import { encodeInvoice, validateInvoice, MAX_MEMO_CHARS, MIN_INVOICE_SATS, type Invoice } from '../lib/invoice';
import { cashAddrPrefix } from '../lib/network';
import { formatSats, formatSatsAsBch, parseBchToSats } from '../lib/amount';
import { absoluteLink, payHash } from '../lib/routes';
import { Counter, CopyButton, ErrorBox, InvoiceLines, PaperHead, Perforation, QrCode, Slip } from '../components/ui';

/**
 * The slip is the form: the seller types straight onto the paper. "Print payment link" swaps the fields
 * for printed text, tears the slip off the printer and prints the link and its QR code at the foot.
 */
export default function CreatePage() {
  const id = useId();
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [made, setMade] = useState<{ invoice: Invoice; link: string; hash: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const linkHeadRef = useRef<HTMLHeadingElement>(null);
  const wasMade = useRef(false);

  // Move focus to what just appeared: the printed link, or back to the first field after "Print another".
  useEffect(() => {
    if (made) linkHeadRef.current?.focus();
    else if (wasMade.current) memoRef.current?.focus();
    wasMade.current = made !== null;
  }, [made]);

  const parsed = amount.trim() ? parseBchToSats(amount) : null;
  const prefix = cashAddrPrefix(NETWORK);
  const memoChars = [...memo].length;

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
    const hash = payHash(encodeInvoice(invoice));
    setMade({ invoice, hash, link: absoluteLink(window.location.href, hash) });
  };

  // The address is a textarea so it can wrap on the paper; Enter still submits, like a single-line field.
  const addressKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const note = made ? (
    <>
      <h1>Printed. Send it.</h1>
      <p className="lede">Share the link, or let the buyer scan the code. They pay from their own wallet and keep an NFT receipt.</p>
    </>
  ) : (
    <>
      <h1>Print a Bitcoin Cash invoice</h1>
      <p className="lede">Fill in the slip. You get a link and a QR code. The buyer pays from their own wallet and gets an NFT receipt that names this exact invoice.</p>
      <p className="lede lede-quiet">No account, no server. The whole invoice lives in the link.</p>
    </>
  );

  return (
    <Counter note={note}>
      <Slip label="Invoice" printer torn={made !== null}>
        <PaperHead kind="Invoice" />
        {made ? (
          <InvoiceLines invoice={made.invoice} />
        ) : (
          <form ref={formRef} className="slip-form" onSubmit={submit} noValidate>
            <div className="line">
              <div className="line-label-row">
                <label className="line-label" htmlFor={`${id}-memo`}>For</label>
                <span className="line-count" id={`${id}-memo-hint`}>
                  {memoChars}/{MAX_MEMO_CHARS}<span className="sr-only"> characters</span>
                </span>
              </div>
              <input
                ref={memoRef}
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
        )}
        {made && (
          <section className="paper-section tear-in" aria-labelledby={`${id}-link-head`}>
            <Perforation />
            <h2 className="paper-h2" id={`${id}-link-head`} ref={linkHeadRef} tabIndex={-1}>Scan to pay</h2>
            <div className="paper-qr">
              <QrCode value={made.link} label="QR code of the payment link" />
            </div>
            <label className="line-label" htmlFor={`${id}-link`}>Payment link</label>
            <input id={`${id}-link`} className="link-field" readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <CopyButton text={made.link} />
              <a className="btn btn-secondary" href={made.hash}>Open the pay page</a>
            </div>
            <button type="button" className="text-button" onClick={() => setMade(null)}>Print another invoice</button>
          </section>
        )}
        {!made && <p className="paper-foot">Paid from the buyer’s own wallet. The same transaction gives them an NFT receipt.</p>}
      </Slip>
    </Counter>
  );
}
