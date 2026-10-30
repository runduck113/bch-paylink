import { lazy, Suspense, useEffect, useState } from 'react';
import { parseRoute } from './lib/routes';
import { Banner } from './components/ui';
import CreatePage from './pages/CreatePage';

// Wallet and Electrum code is heavy; load it only on the pages that need it.
const PayPage = lazy(() => import('./pages/PayPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));

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
      <Suspense fallback={<main className="page"><p className="pulse">Loading…</p></main>}>
        {route.page === 'create' && <CreatePage />}
        {route.page === 'pay' && <PayPage key={route.encoded} encoded={route.encoded} />}
        {route.page === 'receipt' && <ReceiptPage key={route.txid} txid={route.txid} encoded={route.encoded} />}
        {route.page === 'notFound' && (
          <main className="page">
            <h1>Page not found</h1>
            <p><a href="#/">Make a payment link</a></p>
          </main>
        )}
      </Suspense>
      <footer className="footer">
        <p>Non-custodial: your wallet signs, this static page never holds keys or funds. Built for BCH BLAZE 2026.</p>
      </footer>
    </>
  );
}
