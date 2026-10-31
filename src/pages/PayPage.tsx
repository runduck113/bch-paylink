import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { AlphanumericQRCode, useWizardConnect } from '@wizardconnect/react';
import { DAPP_NAME, EXPLORER_TX_URL, NETWORK, WALLET_ADDRESS_SCAN_COUNT } from '../config';
import { decodeInvoice, validateInvoice, type Invoice } from '../lib/invoice';
import { invoiceCommitment } from '../lib/receipt';
import { formatSats, formatSatsAsBch } from '../lib/amount';
import { absoluteLink, payHash, receiptHash } from '../lib/routes';
import { Address, CheckIcon, CopyButton, Counter, DeadEnd, ErrorBox, InvoiceLines, NftStub, PaperHead, Perforation, Slip } from '../components/ui';
import { loadWallet, nextStep, signAndBroadcast, type Next, type WalletSnapshot } from '../wallet/payment';
import { broadcast, BroadcastRejectedError, BroadcastUnknownError } from '../wallet/electrum';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const explorer = (txid: string) => EXPLORER_TX_URL[NETWORK] + txid;

/** Remember payments made from this browser, per invoice, to warn before paying the same invoice twice. */
const paidKey = (invoice: Invoice) => `bch-paylink:paid:${invoiceCommitment(invoice)}`;
function readPaid(invoice: Invoice): string | null {
  try {
    const v = localStorage.getItem(paidKey(invoice));
    return v && /^[0-9a-f]{64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
function rememberPaid(invoice: Invoice, txid: string) {
  try {
    localStorage.setItem(paidKey(invoice), txid);
  } catch {
    /* private mode: the warning is a convenience only */
  }
}

type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'ready'; wallet: WalletSnapshot; next: Next }
  | { k: 'signing'; what: 'pay' | 'prep' }
  | { k: 'prepSent'; txid: string }
  | { k: 'unknown'; what: 'pay' | 'prep'; txid: string; hex: string; category?: string; message: string }
  | { k: 'paid'; txid: string; category: string }
  | { k: 'error'; message: string };

/** `counter`: the seller just printed this invoice at the counter. The wallet QR shows at once, the link sits below. */
export default function PayPage({ encoded, counter = false }: { encoded: string; counter?: boolean }) {
  const decoded = useMemo(() => {
    try {
      return { invoice: decodeInvoice(encoded) };
    } catch (e) {
      return { error: errorText(e) };
    }
  }, [encoded]);

  if ('error' in decoded) {
    return (
      <DeadEnd title="This link doesn’t open an invoice">
        <ErrorBox title="The link could not be read">
          <p>{decoded.error}. Ask the sender to copy the whole link again.</p>
        </ErrorBox>
        <a className="btn btn-secondary" href="#/">Make your own invoice</a>
      </DeadEnd>
    );
  }
  return <PayInvoice invoice={decoded.invoice} encoded={encoded} counter={counter} />;
}

function PayInvoice({ invoice, encoded, counter }: { invoice: Invoice; encoded: string; counter: boolean }) {
  const problems = validateInvoice(invoice, NETWORK);
  const [paid, setPaidState] = useState<{ txid: string; category: string } | null>(null);
  const [earlier, setEarlier] = useState(() => readPaid(invoice));
  const setPaid = (p: { txid: string; category: string }) => {
    rememberPaid(invoice, p.txid);
    setPaidState(p);
  };
  const note = paid ? (
    <h1>Paid. Thank you.</h1>
  ) : problems.length > 0 ? (
    <h1>This invoice can’t be paid</h1>
  ) : counter ? (
    <>
      <h1>Ready to pay</h1>
      <p className="lede">Hold this screen up to the buyer. They scan the code with their BCH wallet. Or send them the link below.</p>
      <p className="lede">They check the amount in their wallet, pay, and keep an NFT receipt.</p>
    </>
  ) : (
    <>
      <h1>Pay this invoice</h1>
      <p className="lede">Check the amount and the address, then pay from your own wallet. You keep a receipt as an NFT.</p>
    </>
  );
  return (
    <Counter note={note} aside={paid ? <NftStub stub={{ commitment: invoiceCommitment(invoice), category: paid.category }} /> : undefined}>
      <Slip label="Invoice" stamp={paid ? 'paid' : problems.length > 0 ? 'void' : undefined}>
        <PaperHead kind="Invoice" />
        <InvoiceLines invoice={invoice} />
        <section className="paper-section" aria-label="Payment">
          <Perforation />
          {problems.length > 0 ? (
            <ErrorBox title="This invoice can’t be paid">
              <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              <p>Nothing was sent. Ask the sender for a corrected link.</p>
            </ErrorBox>
          ) : paid ? (
            <Paid txid={paid.txid} encoded={encoded} />
          ) : earlier ? (
            <div className="step-body">
              <ErrorBox title="You may have paid this invoice already">
                <p>This browser sent (or tried to send) a payment for it earlier. Check that transaction before paying again.</p>
                <p className="mono-small">{earlier}</p>
              </ErrorBox>
              <a className="btn btn-primary btn-wide" href={receiptHash(earlier, encoded)}>Check that transaction</a>
              <button type="button" className="text-button" onClick={() => setEarlier(null)}>Pay it again anyway</button>
            </div>
          ) : (
            <PayFlow invoice={invoice} onPaid={setPaid} autoConnect={counter} />
          )}
        </section>
        {counter && !paid && problems.length === 0 && <ShareLink link={absoluteLink(window.location.href, payHash(encoded))} />}
        {counter && (
          <p className="paper-again">
            <a className="text-button" href="#/">Print another invoice</a>
          </p>
        )}
      </Slip>
    </Counter>
  );
}

/** The shareable https link, for a buyer who isn't at the counter. Secondary: wallets can't scan it. */
export function ShareLink({ link }: { link: string }) {
  const id = useId();
  return (
    <section className="paper-section share-link" aria-labelledby={`${id}-head`}>
      <Perforation />
      <h2 className="paper-h3" id={`${id}-head`}>Or send the buyer this link</h2>
      <label className="sr-only" htmlFor={`${id}-link`}>Payment link</label>
      <input id={`${id}-link`} className="link-field" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <CopyButton text={link} />
      </div>
    </section>
  );
}

function PayFlow(props: { invoice: Invoice; onPaid: (p: { txid: string; category: string }) => void; autoConnect: boolean }) {
  const { invoice, onPaid, autoConnect } = props;
  const dappIcon = useMemo(() => new URL('icon.svg', document.baseURI).href, []);
  // Counter mode: every slip is a new buyer on the seller's device, so don't reconnect (or keep) the last buyer's
  // wallet session. With persistSession off the hook skips its own auto-reconnect, so connect() below is the only relay.
  const wc = useWizardConnect({ dappName: DAPP_NAME, dappIcon, persistSession: !autoConnect });

  // Counter mode: start pairing on mount so the wallet QR is on the slip without a click. Mount only, so Cancel
  // stays cancelled.
  const startPairing = useEffectEvent(() => {
    if (wc.state === 'idle') wc.connect();
  });
  useEffect(() => {
    if (autoConnect) startPairing();
  }, [autoConnect]);

  // Counter mode: once the wallet QR is drawn, bring it on screen (it sits below the invoice) and move focus to it.
  const pairHeadRef = useRef<HTMLHeadingElement>(null);
  const shownPairing = useRef(false);
  useEffect(() => {
    if (!autoConnect || !wc.qrUri || shownPairing.current || !pairHeadRef.current) return;
    shownPairing.current = true;
    pairHeadRef.current.scrollIntoView({ block: 'start' });
    pairHeadRef.current.focus({ preventScroll: true });
  }, [autoConnect, wc.qrUri]);
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
        // It may have gone out: remember it so a reload still warns before paying again.
        if (what === 'pay') rememberPaid(invoice, e.txid);
        setPhase({ k: 'unknown', what, txid: e.txid, hex: e.hex, category, message: e.message });
      } else if (e instanceof BroadcastRejectedError) {
        setPhase({ k: 'error', message: e.message });
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
      // A clear refusal means it was never accepted: starting over is safe. Otherwise stay in "unknown".
      if (e instanceof BroadcastRejectedError) setPhase({ k: 'error', message: e.message });
      else setPhase({ ...p, message: errorText(e) });
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
            <h3 className="pair-head" ref={pairHeadRef} tabIndex={-1}>Scan with your BCH wallet</h3>
            <div className="pair-hints">
              <p>Paytaca or any WizardConnect wallet.</p>
              <p>Wallet on this device? Tap Open wallet app.</p>
              <p>Scan not working? Copy the connect link, then in Paytaca open Apps → WizardConnect and paste it.</p>
            </div>
            {autoConnect && (
              <p className="pair-total">
                <span className="pair-total-memo" title={invoice.memo || undefined}>{invoice.memo || 'Payment'}</span>
                <span className="sr-only">, total </span>
                <span className="pair-total-amount">{formatSatsAsBch(invoice.sats)} BCH</span>
              </p>
            )}
            {wc.qrUri && (
              <div className="pair-qr">
                <AlphanumericQRCode value={wc.qrUri} size={256} quietZone={20} foreground="#000000" background="#ffffff" />
              </div>
            )}
            <div className="row">
              {wc.uri && <a className="btn btn-primary" href={wc.uri}>Open wallet app</a>}
              {wc.uri && <CopyButton text={wc.uri} label="Copy connect link" />}
              <button type="button" className="text-button" onClick={() => void wc.disconnect()}>Cancel connection</button>
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
              <p>Only the first {WALLET_ADDRESS_SCAN_COUNT} receive and change addresses of the wallet are checked.</p>
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
