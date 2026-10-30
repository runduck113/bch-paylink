import { useEffect, useMemo, useState } from 'react';
import { EXPLORER_TX_URL, NETWORK } from '../config';
import { decodeInvoice, type Invoice } from '../lib/invoice';
import { checkTxAgainstInvoice, parseTx, type ParsedTx } from '../lib/txReceipt';
import { formatSats } from '../lib/amount';
import { Address, ErrorBox, InvoiceSlip } from '../components/ui';
import { fetchRawTx } from '../wallet/electrum';

type Load = { k: 'loading' } | { k: 'ok'; tx: ParsedTx } | { k: 'error'; message: string };

export default function ReceiptPage({ txid, encoded }: { txid: string; encoded?: string }) {
  const [load, setLoad] = useState<Load>({ k: 'loading' });
  const invoice = useMemo((): Invoice | { error: string } | null => {
    if (!encoded) return null;
    try {
      return decodeInvoice(encoded);
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [encoded]);

  useEffect(() => {
    let live = true;
    setLoad({ k: 'loading' });
    fetchRawTx(txid)
      .then((hex) => {
        const tx = parseTx(hex, NETWORK);
        if (tx.txid !== txid) throw new Error('The server returned a different transaction.');
        if (live) setLoad({ k: 'ok', tx });
      })
      .catch((e) => {
        const raw = e instanceof Error ? e.message : String(e);
        const message = /no such mempool or blockchain transaction/i.test(raw) ? `No transaction with this ID on ${NETWORK}.` : raw;
        if (live) setLoad({ k: 'error', message });
      });
    return () => {
      live = false;
    };
  }, [txid]);

  const explorer = EXPLORER_TX_URL[NETWORK] + txid;

  return (
    <main className="page">
      <h1>Payment receipt</h1>
      <p className="txid"><span className="field-label">Transaction ID</span><code>{txid}</code></p>
      {load.k === 'loading' && <p className="pulse">Looking up the transaction on {NETWORK}…</p>}
      {load.k === 'error' && (
        <ErrorBox title="Transaction not found">
          <p>{load.message}</p>
          <p>Check the ID, or wait a few seconds if it was just sent. This page reads {NETWORK}.</p>
        </ErrorBox>
      )}
      {load.k === 'ok' && <ReceiptBody tx={load.tx} invoice={invoice} />}
      <p><a href={explorer} target="_blank" rel="noreferrer">View on explorer</a></p>
    </main>
  );
}

function ReceiptBody({ tx, invoice }: { tx: ParsedTx; invoice: Invoice | { error: string } | null }) {
  const nfts = tx.outputs.filter((o) => o.nft);
  const inv = invoice && !('error' in invoice) ? invoice : null;
  const check = inv ? checkTxAgainstInvoice(tx, inv) : null;
  const verified = check?.commitmentMatches && check.payeePaid;

  return (
    <>
      {inv && check && (
        <InvoiceSlip
          invoice={inv}
          stamp={
            <div className={`stamp ${verified ? 'stamp-ok' : 'stamp-bad'}`} role="status">
              {verified ? 'Paid and matches this invoice' : 'Does not match this invoice'}
            </div>
          }
        />
      )}
      {invoice && 'error' in invoice && (
        <ErrorBox title="The invoice in this link could not be read">
          <p>{invoice.error}. The transaction is shown below without a comparison.</p>
        </ErrorBox>
      )}
      {check && (
        <ul className="checks">
          <li className={check.payeePaid ? 'ok' : 'bad'}>
            {check.payeePaid ? 'The seller received at least the invoice amount.' : 'No output pays the invoice amount to the seller.'}
          </li>
          <li className={check.commitmentMatches ? 'ok' : 'bad'}>
            {check.commitmentMatches
              ? 'The receipt NFT carries this invoice’s fingerprint.'
              : 'No receipt NFT in this transaction carries this invoice’s fingerprint.'}
          </li>
        </ul>
      )}
      <section aria-label="Receipt NFT">
        <h2>Receipt NFT</h2>
        {nfts.length === 0 && <p>This transaction has no NFT output, so it is not a BCH Paylink payment.</p>}
        {nfts.map((o) => (
          <dl className="summary nft" key={o.index}>
            <div><dt>Category</dt><dd><code className="wrap">{o.nft!.category}</code></dd></div>
            <div>
              <dt>Commitment</dt>
              <dd>
                <code className="wrap">{o.nft!.commitment || '(empty)'}</code>
                {check && <span className={check.expectedCommitment === o.nft!.commitment ? 'tag tag-ok' : 'tag tag-bad'}>
                  {check.expectedCommitment === o.nft!.commitment ? 'matches invoice' : 'different invoice'}
                </span>}
              </dd>
            </div>
            <div><dt>Held by</dt><dd>{o.address ? <Address value={o.address} /> : 'non-standard script'}</dd></div>
            <div><dt>Output</dt><dd>#{o.index}, {formatSats(o.sats)} sats</dd></div>
          </dl>
        ))}
        {!inv && nfts.length > 0 && (
          <p className="hint">To check this receipt against an invoice, open it from the invoice’s pay page, or add <code>?inv=</code> with the invoice link code.</p>
        )}
      </section>
    </>
  );
}
