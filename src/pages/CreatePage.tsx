import { useId, useState, type FormEvent } from 'react';
import { NETWORK } from '../config';
import { encodeInvoice, validateInvoice, MAX_MEMO_CHARS, type Invoice } from '../lib/invoice';
import { cashAddrPrefix } from '../lib/network';
import { formatSats, parseBchToSats } from '../lib/amount';
import { absoluteLink, payHash } from '../lib/routes';
import { CopyButton, ErrorBox, InvoiceSlip, QrCode } from '../components/ui';

export default function CreatePage() {
  const id = useId();
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [made, setMade] = useState<{ invoice: Invoice; link: string; hash: string } | null>(null);

  const parsed = amount.trim() ? parseBchToSats(amount) : null;
  const prefix = cashAddrPrefix(NETWORK);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountResult = parseBchToSats(amount);
    if ('error' in amountResult) return setErrors([amountResult.error]);
    if (amountResult.sats > BigInt(Number.MAX_SAFE_INTEGER)) return setErrors(['Amount is too large.']);
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
      <main className="page">
        <h1>Your payment link is ready</h1>
        <p className="lede">Send the link or let the buyer scan the code. They pay from their own wallet and get an NFT receipt in the same transaction.</p>
        <InvoiceSlip invoice={made.invoice} />
        <section className="share" aria-label="Share">
          <QrCode value={made.link} size={184} label="QR code of the payment link" />
          <div className="share-side">
            <label className="field-label" htmlFor={`${id}-link`}>Payment link</label>
            <input id={`${id}-link`} className="input mono" readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <CopyButton text={made.link} />
              <a className="btn btn-ghost" href={made.hash}>Open pay page</a>
            </div>
            <p className="hint">All invoice details live in the link itself. Nothing is stored on a server.</p>
          </div>
        </section>
        <button type="button" className="btn btn-ghost" onClick={() => setMade(null)}>Make another invoice</button>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Get paid in Bitcoin Cash with one link</h1>
      <p className="lede">
        Fill in what you are owed. The buyer opens the link, pays with their wallet, and receives a CashTokens NFT that proves which invoice they paid.
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-payee`}>Your BCH address</label>
          <input
            id={`${id}-payee`}
            className="input mono"
            placeholder={`${prefix}:q…`}
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <p className="hint">The payment goes straight here. Starts with “{prefix}:”.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-amount`}>Amount (BCH)</label>
          <input
            id={`${id}-amount`}
            className="input amount-input"
            inputMode="decimal"
            placeholder="0.0001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <p className="hint" aria-live="polite">
            {parsed === null ? 'Minimum 546 sats (0.00000546 BCH).' : 'error' in parsed ? parsed.error : `= ${formatSats(parsed.sats)} sats`}
          </p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-memo`}>What it is for</label>
          <input
            id={`${id}-memo`}
            className="input"
            placeholder="Logo design, October"
            maxLength={MAX_MEMO_CHARS}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <p className="hint">{[...memo].length}/{MAX_MEMO_CHARS} characters. Shown to the buyer and sealed into the receipt.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-due`}>Due date <span className="optional">(optional)</span></label>
          <input id={`${id}-due`} className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {errors.length > 0 && (
          <ErrorBox title="Fix these before creating the link">
            <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </ErrorBox>
        )}
        <button type="submit" className="btn btn-primary">Create payment link</button>
      </form>
    </main>
  );
}
