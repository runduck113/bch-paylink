import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlphanumericQRCode, useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react';
import { DAPP_NAME, EXPLORER_TX_URL, NETWORK } from '../config';
import { decodeInvoice, validateInvoice, type Invoice } from '../lib/invoice';
import { formatSats, formatSatsAsBch } from '../lib/amount';
import { receiptHash } from '../lib/routes';
import { Address, ErrorBox, InvoiceSlip } from '../components/ui';
import { loadWallet, nextStep, signAndBroadcast, type Next, type WalletSnapshot } from '../wallet/payment';

const dappIcon = () => `${window.location.origin}${import.meta.env.BASE_URL}icon.svg`;
/** Phones get the QR inline plus an "open wallet" button; a modal would cover that button. */
const useWideScreen = () => {
  const query = '(min-width: 640px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
};
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const QR_THEME = {
  backdropColor: 'rgba(18, 26, 36, 0.55)',
  dialogBackground: '#ffffff',
  headerBackground: '#ffffff',
  titleColor: '#121a24',
  subtitleColor: '#4d5966',
  uriRowBackground: '#f1f4f2',
  uriTextColor: '#4d5966',
  borderColor: '#d9e0da',
  closeButtonColor: '#4d5966',
  copyButtonColor: '#0b6e4f',
};

type Phase =
  | { k: 'idle' }
  | { k: 'loading' }
  | { k: 'ready'; wallet: WalletSnapshot; next: Next }
  | { k: 'signing'; what: 'pay' | 'prep' }
  | { k: 'prepSent'; txid: string }
  | { k: 'paid'; txid: string }
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
      <main className="page">
        <h1>This payment link does not work</h1>
        <ErrorBox title="The link could not be read">
          <p>{decoded.error}. Ask the sender for the link again, copied in full.</p>
        </ErrorBox>
        <a className="btn btn-ghost" href="#/">Make your own invoice</a>
      </main>
    );
  }
  return <PayInvoice invoice={decoded.invoice} encoded={encoded} />;
}

function PayInvoice({ invoice, encoded }: { invoice: Invoice; encoded: string }) {
  const problems = validateInvoice(invoice, NETWORK);
  return (
    <main className="page">
      <h1>Pay this invoice</h1>
      <InvoiceSlip invoice={invoice} />
      {problems.length > 0 ? (
        <ErrorBox title="This invoice cannot be paid">
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          <p>Nothing was sent. Ask the sender for a corrected link.</p>
        </ErrorBox>
      ) : (
        <PayFlow invoice={invoice} encoded={encoded} />
      )}
    </main>
  );
}

function PayFlow({ invoice, encoded }: { invoice: Invoice; encoded: string }) {
  const wc = useWizardConnect({ dappName: DAPP_NAME, dappIcon: dappIcon() });
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const connected = wc.state === 'connected' && wc.manager !== null;
  const wide = useWideScreen();

  const refresh = useCallback(async () => {
    if (!wc.manager) return;
    setPhase({ k: 'loading' });
    try {
      const wallet = await loadWallet(wc.manager);
      setPhase({ k: 'ready', wallet, next: nextStep(invoice, wallet) });
    } catch (e) {
      setPhase({ k: 'error', message: `Could not read your wallet's coins: ${errorText(e)}` });
    }
  }, [wc.manager, invoice]);

  useEffect(() => {
    if (connected) void refresh();
    else setPhase((p) => (p.k === 'paid' ? p : { k: 'idle' }));
  }, [connected, refresh]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const sign = async (what: 'pay' | 'prep') => {
    if (phase.k !== 'ready' || !wc.manager || phase.next.kind === 'blocked') return;
    const { wallet, next } = phase;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ k: 'signing', what });
    try {
      const prompt = what === 'pay' ? `Pay invoice: ${invoice.memo || 'payment'}` : 'Prepare wallet for BCH Paylink';
      const txid = await signAndBroadcast(wc.manager, next.plan, wallet, prompt, ctrl.signal);
      setPhase(what === 'pay' ? { k: 'paid', txid } : { k: 'prepSent', txid });
    } catch (e) {
      if (ctrl.signal.aborted) setPhase({ k: 'ready', wallet, next });
      else setPhase({ k: 'error', message: errorText(e) });
    } finally {
      abortRef.current = null;
    }
  };

  if (phase.k === 'paid') return <Paid txid={phase.txid} encoded={encoded} />;

  return (
    <ol className="steps">
      <li className={`step ${connected ? 'step-done' : 'step-active'}`}>
        <h2 className="step-title">Connect your wallet</h2>
        {connected ? (
          <p className="step-text">
            Connected to {wc.walletName ?? 'your wallet'}.{' '}
            <button type="button" className="link-button" onClick={() => void wc.disconnect()}>Disconnect</button>
          </p>
        ) : wc.state === 'connecting' ? (
          <div className="step-text">
            <p>Wallet on this phone? Open it directly. Otherwise scan the code with Paytaca or another WizardConnect wallet.</p>
            {wc.uri && <a className="btn btn-primary" href={wc.uri}>Open in wallet app</a>}
            {!wide && wc.qrUri && (
              <div className="qr" aria-label="WizardConnect pairing QR code">
                <AlphanumericQRCode value={wc.qrUri} size={220} foreground="#121a24" background="#ffffff" />
              </div>
            )}
            <button type="button" className="link-button" onClick={() => void wc.disconnect()}>Cancel</button>
          </div>
        ) : wc.state === 'reconnecting' ? (
          <p className="step-text">Reconnecting to your wallet…</p>
        ) : (
          <div className="step-text">
            <p>Your wallet signs the payment. Keys never leave it and this page never holds funds.</p>
            <button type="button" className="btn btn-primary" onClick={() => wc.connect()}>Connect wallet</button>
            {wc.error && <p className="error-text">{wc.error}</p>}
          </div>
        )}
      </li>
      <li className={`step ${connected ? 'step-active' : 'step-waiting'}`}>
        <h2 className="step-title">Review and pay</h2>
        {connected && <PayStep phase={phase} invoice={invoice} onSign={sign} onRefresh={refresh} onCancel={() => abortRef.current?.abort()} />}
      </li>
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={wide && wc.state === 'connecting'}
          onClose={() => void wc.disconnect()}
          uri={wc.uri}
          qrUri={wc.qrUri}
          title="Connect wallet"
          subtitle="Scan with Paytaca or another WizardConnect wallet"
          theme={QR_THEME}
        />
      )}
    </ol>
  );
}

function PayStep(props: {
  phase: Phase;
  invoice: Invoice;
  onSign: (what: 'pay' | 'prep') => void;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const { phase, invoice, onSign, onRefresh, onCancel } = props;
  switch (phase.k) {
    case 'idle':
    case 'loading':
      return <p className="step-text">Reading your wallet's coins…</p>;
    case 'signing':
      return (
        <div className="step-text">
          <p className="pulse">Approve the {phase.what === 'pay' ? 'payment' : 'preparation'} in your wallet.</p>
          <button type="button" className="link-button" onClick={onCancel}>Cancel request</button>
        </div>
      );
    case 'prepSent':
      return (
        <div className="step-text">
          <p>Wallet prepared (<a href={EXPLORER_TX_URL[NETWORK] + phase.txid} target="_blank" rel="noreferrer">view transaction</a>). Now you can pay.</p>
          <button type="button" className="btn btn-primary" onClick={onRefresh}>Continue to payment</button>
        </div>
      );
    case 'error':
      return (
        <div className="step-text">
          <ErrorBox title="Payment not sent">
            <p>{phase.message}</p>
          </ErrorBox>
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>Try again</button>
        </div>
      );
    case 'paid':
      return null;
    case 'ready': {
      const { next } = phase;
      if (next.kind === 'blocked') {
        return (
          <div className="step-text">
            <ErrorBox title="Can't pay from this wallet yet">
              <p>{next.reason}</p>
            </ErrorBox>
            <button type="button" className="btn btn-secondary" onClick={onRefresh}>Check again</button>
          </div>
        );
      }
      if (next.kind === 'prep') {
        const out = next.plan.outputs[0];
        return (
          <div className="step-text">
            <p>
              One short step first. The receipt NFT has to be created from a coin that was the first output of its transaction, and your wallet has none.
              Sending your balance to yourself fixes that; it costs a network fee of {formatSats(next.plan.fee)} sats.
            </p>
            <dl className="summary">
              <div><dt>Send to yourself</dt><dd>{formatSatsAsBch(out.sats)} BCH</dd></div>
              <div><dt>Network fee</dt><dd>{formatSats(next.plan.fee)} sats</dd></div>
            </dl>
            <button type="button" className="btn btn-primary" onClick={() => onSign('prep')}>Prepare wallet</button>
          </div>
        );
      }
      const { plan } = next;
      const receipt = plan.outputs.find((o) => o.role === 'receipt');
      return (
        <div className="step-text">
          <dl className="summary">
            <div><dt>To the seller</dt><dd>{formatSatsAsBch(invoice.sats)} BCH</dd></div>
            <div><dt>Network fee</dt><dd>{formatSats(plan.fee)} sats</dd></div>
            {receipt && (
              <div>
                <dt>Receipt NFT to you</dt>
                <dd>{formatSats(receipt.sats)} sats, stays yours</dd>
              </div>
            )}
            {receipt && <div><dt>Receipt goes to</dt><dd><Address value={receipt.to} /></dd></div>}
          </dl>
          <button type="button" className="btn btn-primary btn-pay" onClick={() => onSign('pay')}>
            Pay {formatSatsAsBch(invoice.sats)} BCH
          </button>
        </div>
      );
    }
  }
}

function Paid({ txid, encoded }: { txid: string; encoded: string }) {
  return (
    <section className="paid" aria-live="polite">
      <h2>Paid</h2>
      <p>The payment and your NFT receipt are in one transaction.</p>
      <p className="txid"><span className="field-label">Transaction ID</span><code>{txid}</code></p>
      <div className="row">
        <a className="btn btn-primary" href={receiptHash(txid, encoded)}>See the receipt</a>
        <a className="btn btn-ghost" href={EXPLORER_TX_URL[NETWORK] + txid} target="_blank" rel="noreferrer">View on explorer</a>
      </div>
    </section>
  );
}
