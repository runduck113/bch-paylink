import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlphanumericQRCode, useWizardConnect } from '@wizardconnect/react';
import { DAPP_NAME, EXPLORER_TX_URL, NETWORK } from '../config';
import { decodeInvoice, validateInvoice, type Invoice } from '../lib/invoice';
import { invoiceCommitment } from '../lib/receipt';
import { formatSats, formatSatsAsBch } from '../lib/amount';
import { receiptHash } from '../lib/routes';
import { Address, CheckIcon, ErrorBox, ReceiptPaper } from '../components/ui';
import { loadWallet, nextStep, signAndBroadcast, type Next, type WalletSnapshot } from '../wallet/payment';
import { broadcast, BroadcastUnknownError } from '../wallet/electrum';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const explorer = (txid: string) => EXPLORER_TX_URL[NETWORK] + txid;

type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'ready'; wallet: WalletSnapshot; next: Next }
  | { k: 'signing'; what: 'pay' | 'prep' }
  | { k: 'prepSent'; txid: string }
  | { k: 'unknown'; what: 'pay' | 'prep'; txid: string; hex: string; category?: string; message: string }
  | { k: 'paid'; txid: string; category: string }
  | { k: 'error'; message: string };

export default function PayPage({ encoded }: { encoded: string }) {
  const decoded = useMemo(() => {
    try {
      return { invoice: decodeInvoice(encoded) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [encoded]);

  if ('error' in decoded) {
    return (
      <main className="sheet sheet-narrow">
        <div className="sheet-head">
          <h1>This link doesn’t open an invoice</h1>
        </div>
        <div className="sheet-flow">
          <ErrorBox title="The link could not be read">
            <p>{decoded.error}. Ask the sender to copy the whole link again.</p>
          </ErrorBox>
          <a className="btn btn-quiet" href="#/">Make your own invoice</a>
        </div>
      </main>
    );
  }
  return <PayInvoice invoice={decoded.invoice} encoded={encoded} />;
}

function PayInvoice({ invoice, encoded }: { invoice: Invoice; encoded: string }) {
  const problems = validateInvoice(invoice, NETWORK);
  const [paid, setPaid] = useState<{ txid: string; category: string } | null>(null);
  return (
    <main className="sheet">
      <div className="sheet-head">
        <h1>{paid ? 'Paid. Thank you.' : 'Pay this invoice'}</h1>
        {!paid && <p className="lede">Check the amount and the address, then pay from your own wallet. You keep a receipt as an NFT.</p>}
      </div>
      <div className="sheet-paper">
        <ReceiptPaper
          invoice={invoice}
          stamp={paid ? 'paid' : undefined}
          stub={paid ? { commitment: invoiceCommitment(invoice), category: paid.category, txid: paid.txid } : undefined}
        />
      </div>
      <div className="sheet-flow">
        {problems.length > 0 ? (
          <ErrorBox title="This invoice can’t be paid">
            <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            <p>Nothing was sent. Ask the sender for a corrected link.</p>
          </ErrorBox>
        ) : paid ? (
          <Paid txid={paid.txid} encoded={encoded} />
        ) : (
          <PayFlow invoice={invoice} onPaid={setPaid} />
        )}
      </div>
    </main>
  );
}

function PayFlow({ invoice, onPaid }: { invoice: Invoice; onPaid: (p: { txid: string; category: string }) => void }) {
  const dappIcon = useMemo(() => new URL('icon.svg', document.baseURI).href, []);
  const wc = useWizardConnect({ dappName: DAPP_NAME, dappIcon });
  const [phase, setPhaseState] = useState<Phase>({ k: 'idle' });
  const phaseRef = useRef<Phase>(phase);
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const refreshSeq = useRef(0);
  const connected = wc.state === 'connected' && wc.manager !== null;

  /** Re-read the wallet. Never while a sign request is open or a signed tx's fate is unknown (double-pay guard). */
  const refresh = useCallback(async () => {
    const cur = phaseRef.current.k;
    if (!wc.manager || cur === 'signing' || cur === 'unknown') return;
    const seq = ++refreshSeq.current;
    setPhase({ k: 'loading' });
    try {
      const wallet = await loadWallet(wc.manager);
      if (seq === refreshSeq.current) setPhase({ k: 'ready', wallet, next: nextStep(invoice, wallet) });
    } catch (e) {
      if (seq === refreshSeq.current) setPhase({ k: 'error', message: `Couldn’t read your wallet’s coins: ${errorText(e)}` });
    }
  }, [wc.manager, invoice, setPhase]);

  useEffect(() => {
    if (connected) {
      if (phaseRef.current.k === 'idle') void refresh();
      return;
    }
    // A short reconnect keeps pending sign requests (the library re-sends them), so leave the phase alone.
    if (wc.state === 'reconnecting') return;
    // Wallet went away. An open sign request can't finish: cancel it so the page doesn't wait forever.
    if (phaseRef.current.k === 'signing') abortRef.current?.abort();
    if (phaseRef.current.k !== 'unknown') setPhase({ k: 'idle' });
  }, [connected, wc.state, refresh, setPhase]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const settle = (what: 'pay' | 'prep', txid: string, category: string | undefined) => {
    if (what === 'pay' && category) onPaid({ txid, category });
    else setPhase({ k: 'prepSent', txid });
  };

  const sign = async (what: 'pay' | 'prep') => {
    const p = phaseRef.current;
    if (p.k !== 'ready' || !wc.manager || p.next.kind === 'blocked') return;
    const { wallet, next } = p;
    const category = next.kind === 'pay' ? next.plan.category : undefined;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ k: 'signing', what });
    try {
      const prompt = what === 'pay' ? `Pay invoice: ${invoice.memo || 'payment'}` : 'Prepare wallet for BCH Paylink';
      const txid = await signAndBroadcast(wc.manager, next.plan, wallet, prompt, ctrl.signal);
      settle(what, txid, category);
    } catch (e) {
      if (e instanceof BroadcastUnknownError) {
        setPhase({ k: 'unknown', what, txid: e.txid, hex: e.hex, category, message: e.message });
      } else if (ctrl.signal.aborted) {
        setPhase({ k: 'error', message: 'The request was cancelled. This page sent nothing.' });
      } else {
        setPhase({ k: 'error', message: errorText(e) });
      }
    } finally {
      abortRef.current = null;
    }
  };

  const resend = async () => {
    const p = phaseRef.current;
    if (p.k !== 'unknown') return;
    try {
      const txid = await broadcast(p.hex);
      settle(p.what, txid, p.category);
    } catch (e) {
      setPhase({ ...p, message: errorText(e) });
    }
  };

  return (
    <ol className="steps">
      <li className={`step ${connected ? 'is-done' : 'is-current'}`}>
        <span className="step-mark" aria-hidden="true">{connected ? <CheckIcon /> : '1'}</span>
        <h2 className="step-title">Connect your wallet</h2>
        {connected ? (
          <p className="step-body">
            Connected to {wc.walletName ?? 'your wallet'}.{' '}
            <button type="button" className="text-button" onClick={() => void wc.disconnect()}>Disconnect</button>
          </p>
        ) : wc.state === 'connecting' ? (
          <div className="step-body">
            <p>Scan this with Paytaca or another WizardConnect wallet. Wallet on this phone? Open it instead.</p>
            {wc.qrUri && (
              <div className="pair-qr">
                <AlphanumericQRCode value={wc.qrUri} size={196} foreground="#16150f" background="#ffffff" />
              </div>
            )}
            <div className="row">
              {wc.uri && <a className="btn btn-primary" href={wc.uri}>Open wallet app</a>}
              <button type="button" className="text-button" onClick={() => void wc.disconnect()}>Cancel</button>
            </div>
          </div>
        ) : wc.state === 'reconnecting' ? (
          <div className="step-body">
            <p className="working">Reconnecting to {wc.walletName ?? 'your wallet'}…</p>
            <button type="button" className="text-button" onClick={() => void wc.disconnect()}>Forget this wallet</button>
          </div>
        ) : (
          <div className="step-body">
            <p>Your wallet signs. Your keys never leave it, and this page never holds money.</p>
            <button type="button" className="btn btn-primary" onClick={() => wc.connect()}>Connect wallet</button>
            {wc.error && <p className="error-text">{wc.error}</p>}
          </div>
        )}
      </li>
      <li className={`step ${connected || phase.k === 'unknown' ? 'is-current' : 'is-later'}`}>
        <span className="step-mark" aria-hidden="true">2</span>
        <h2 className="step-title">Check and pay</h2>
        {(connected || phase.k === 'unknown') && (
          <PayStep phase={phase} invoice={invoice} onSign={sign} onRefresh={refresh} onResend={resend} onCancel={() => abortRef.current?.abort()} />
        )}
      </li>
    </ol>
  );
}

function PayStep(props: {
  phase: Phase;
  invoice: Invoice;
  onSign: (what: 'pay' | 'prep') => void;
  onRefresh: () => void;
  onResend: () => void;
  onCancel: () => void;
}) {
  const { phase, invoice, onSign, onRefresh, onResend, onCancel } = props;
  switch (phase.k) {
    case 'idle':
    case 'loading':
      return <p className="step-body working">Reading your wallet’s coins…</p>;
    case 'signing':
      return (
        <div className="step-body">
          <p className="working">Approve the {phase.what === 'pay' ? 'payment' : 'preparation'} in your wallet.</p>
          <button type="button" className="text-button" onClick={onCancel}>Cancel request</button>
        </div>
      );
    case 'prepSent':
      return (
        <div className="step-body">
          <p>Wallet ready (<a href={explorer(phase.txid)} target="_blank" rel="noreferrer">see transaction</a>). Now you can pay.</p>
          <button type="button" className="btn btn-primary" onClick={onRefresh}>Continue to payment</button>
        </div>
      );
    case 'unknown':
      return (
        <div className="step-body">
          <ErrorBox title="Signed, but not confirmed as sent">
            <p>{phase.message} Don’t pay again until you have checked this transaction.</p>
            <p className="mono-small">{phase.txid}</p>
          </ErrorBox>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={onResend}>Send the same transaction again</button>
            <a className="btn btn-quiet" href={explorer(phase.txid)} target="_blank" rel="noreferrer">Check on explorer</a>
          </div>
        </div>
      );
    case 'error':
      return (
        <div className="step-body">
          <ErrorBox title="Nothing was paid">
            <p>{phase.message}</p>
          </ErrorBox>
          <button type="button" className="btn btn-quiet" onClick={onRefresh}>Try again</button>
        </div>
      );
    case 'paid':
      return null;
    case 'ready': {
      const { next } = phase;
      if (next.kind === 'blocked') {
        return (
          <div className="step-body">
            <ErrorBox title="This wallet can’t pay yet">
              <p>{next.reason}</p>
            </ErrorBox>
            <button type="button" className="btn btn-quiet" onClick={onRefresh}>Check again</button>
          </div>
        );
      }
      if (next.kind === 'prep') {
        const out = next.plan.outputs[0];
        return (
          <div className="step-body">
            <p>
              One small step first. The NFT receipt must be made from a coin that was the first output of its
              transaction, and your wallet has none. Sending your balance to yourself fixes that.
            </p>
            <dl className="ledger">
              <div><dt>Back to yourself</dt><dd>{formatSatsAsBch(out.sats)} BCH</dd></div>
              <div><dt>Network fee</dt><dd>{formatSats(next.plan.fee)} sats</dd></div>
            </dl>
            <button type="button" className="btn btn-primary" onClick={() => onSign('prep')}>Prepare wallet</button>
          </div>
        );
      }
      const { plan } = next;
      const receipt = plan.outputs.find((o) => o.role === 'receipt');
      return (
        <div className="step-body">
          <dl className="ledger">
            <div><dt>To the seller</dt><dd>{formatSatsAsBch(invoice.sats)} BCH</dd></div>
            <div><dt>Network fee</dt><dd>{formatSats(plan.fee)} sats</dd></div>
            {receipt && <div><dt>NFT receipt, kept by you</dt><dd>{formatSats(receipt.sats)} sats</dd></div>}
            {receipt && <div className="ledger-wide"><dt>Receipt goes to</dt><dd><Address value={receipt.to} /></dd></div>}
          </dl>
          <button type="button" className="btn btn-primary btn-wide" onClick={() => onSign('pay')}>
            Pay {formatSatsAsBch(invoice.sats)} BCH
          </button>
        </div>
      );
    }
  }
}

function Paid({ txid, encoded }: { txid: string; encoded: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <section className="done">
      <h2 ref={ref} tabIndex={-1}>Payment sent</h2>
      <p>The payment and your NFT receipt went out in one transaction.</p>
      <p className="mono-small">{txid}</p>
      <div className="row">
        <a className="btn btn-primary" href={receiptHash(txid, encoded)}>Open the receipt</a>
        <a className="btn btn-quiet" href={explorer(txid)} target="_blank" rel="noreferrer">See it on the explorer</a>
      </div>
    </section>
  );
}
