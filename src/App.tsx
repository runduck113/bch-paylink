import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { parseRoute } from './lib/routes';
import { Banner, DeadEnd, ErrorBox } from './components/ui';
import CreatePage from './pages/CreatePage';

// Wallet and Electrum code is heavy; load it only on the pages that need it.
const PayPage = lazy(() => import('./pages/PayPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));

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
  return (
    <>
      <Banner />
      <ErrorBoundary key={hash}>
        <Suspense fallback={<main className="counter counter-loading"><p className="working" role="status">Loading</p></main>}>
          {route.page === 'create' && <CreatePage />}
          {route.page === 'pay' && <PayPage key={route.encoded} encoded={route.encoded} />}
          {route.page === 'receipt' && <ReceiptPage key={route.txid} txid={route.txid} encoded={route.encoded} />}
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
