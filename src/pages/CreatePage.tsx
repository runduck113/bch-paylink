import { useId, useState, type FormEvent } from 'react';
import { NETWORK } from '../config';
import { encodeInvoice, validateInvoice, MAX_MEMO_CHARS, MIN_INVOICE_SATS, type Invoice } from '../lib/invoice';
import { cashAddrPrefix } from '../lib/network';
import { formatSats, formatSatsAsBch, parseBchToSats } from '../lib/amount';
import { absoluteLink, payHash } from '../lib/routes';
import { CopyButton, ErrorBox, QrCode, ReceiptPaper } from '../components/ui';

export default function CreatePage() {
  const id = useId();
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [made, setMade] = useState<{ invoice: Invoice; link: string; hash: string } | null>(null);

  const parsed = amount.trim() ? parseBchToSats(amount) : null;
  const previewSats = parsed && 'sats' in parsed && parsed.sats <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed.sats) : 0;
  const prefix = cashAddrPrefix(NETWORK);
  const preview: Invoice = { v: 1, payee: payee.trim(), sats: previewSats, memo: memo.trim(), currency: 'BCH', ...(due && { due }) };

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

  if (made) {
    return (
      <main className="sheet">
        <div className="sheet-head">
          <h1>Your invoice is printed</h1>
          <p className="lede">Send the link, or let the buyer scan the code on the receipt. They pay from their own wallet.</p>
        </div>
        <div className="sheet-paper">
          <ReceiptPaper invoice={made.invoice} qr={<QrCode value={made.link} label="QR code of the payment link" />} />
        </div>
        <div className="sheet-flow">
          <label className="field-label" htmlFor={`${id}-link`}>Payment link</label>
          <input id={`${id}-link`} className="input input-mono" readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <CopyButton text={made.link} />
            <a className="btn btn-quiet" href={made.hash}>Open the pay page</a>
          </div>
          <p className="hint">Everything on the invoice lives in the link. No server stores it.</p>
          <button type="button" className="text-button" onClick={() => setMade(null)}>Print another invoice</button>
        </div>
      </main>
    );
  }

  return (
    <main className="sheet">
      <div className="sheet-head">
        <h1>Print a Bitcoin Cash invoice</h1>
        <p className="lede">
          Fill in what you’re owed and share the link. The buyer pays from their wallet and gets an NFT receipt that names this exact invoice.
        </p>
      </div>
      <div className="sheet-paper">
        <ReceiptPaper invoice={preview} draft />
      </div>
      <form className="sheet-flow form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-payee`}>Your BCH address</label>
          <input
            id={`${id}-payee`}
            className="input input-mono"
            placeholder={`${prefix}:q…`}
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="hint">The money goes straight here. It starts with “{prefix}:”.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-amount`}>Amount in BCH</label>
          <input
            id={`${id}-amount`}
            className="input input-mono input-amount"
            inputMode="decimal"
            placeholder="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="hint" aria-live="polite">
            {parsed === null
              ? `At least ${formatSats(MIN_INVOICE_SATS)} sats (${formatSatsAsBch(MIN_INVOICE_SATS)} BCH).`
              : 'error' in parsed
                ? parsed.error
                : `${formatSats(parsed.sats)} sats`}
          </p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-memo`}>What it’s for</label>
          <input
            id={`${id}-memo`}
            className="input"
            placeholder="Logo design, October"
            maxLength={MAX_MEMO_CHARS}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <p className="hint">{[...memo].length} of {MAX_MEMO_CHARS} characters. Printed on the invoice and sealed into the receipt.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-due`}>Due date <span className="optional">optional</span></label>
          <input id={`${id}-due`} className="input input-date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {errors.length > 0 && (
          <ErrorBox title="Fix these first">
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </ErrorBox>
        )}
        <button type="submit" className="btn btn-primary btn-wide">Print payment link</button>
      </form>
    </main>
  );
}
