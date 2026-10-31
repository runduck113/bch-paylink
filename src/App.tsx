import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { parseRoute } from './lib/routes';
import { Banner, DeadEnd, ErrorBox } from './components/ui';
import CreatePage, { COUNTER_FLAG } from './pages/CreatePage';

// Wallet and Electrum code is heavy; load it only on the pages that need it.
const PayPage = lazy(() => import('./pages/PayPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const LedgerPage = lazy(() => import('./pages/LedgerPage'));

/** Last line of defence: a bad link or a library error shows a message instead of a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <DeadEnd title="Something on this page broke">
        <ErrorBox title="The page stopped">
          <p>{this.state.error.message}</p>
        </ErrorBox>
        <a className="btn btn-secondary" href="#/" onClick={() => this.setState({ error: null })}>Start over</a>
      </DeadEnd>
    );
  }
}

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const route = parseRoute(hash);
  // "?counter" after the pay route: the seller just printed this invoice at the counter, so the wallet QR shows at once.
  const counter = new URLSearchParams(hash.split('?')[1] ?? '').has(COUNTER_FLAG);
  return (
    <>
      <Banner />
      <ErrorBoundary key={hash}>
        <Suspense fallback={<main className="counter counter-loading"><p className="working" role="status">Loading</p></main>}>
          {route.page === 'create' && <CreatePage />}
          {route.page === 'pay' && <PayPage key={route.encoded} encoded={route.encoded} counter={counter} />}
          {route.page === 'receipt' && <ReceiptPage key={route.txid} txid={route.txid} encoded={route.encoded} />}
          {route.page === 'ledger' && <LedgerPage key={route.addr ?? ''} addr={route.addr} />}
          {route.page === 'notFound' && (
            <DeadEnd title="Nothing printed here">
              <p>This address doesn’t match a page.</p>
              <a className="btn btn-secondary" href="#/">Print an invoice</a>
            </DeadEnd>
          )}
        </Suspense>
      </ErrorBoundary>
      <footer className="footer">
        <p>Your wallet signs every payment. This page is static and never holds keys or money.</p>
        <p>Built for BCH BLAZE 2026</p>
      </footer>
    </>
  );
}
