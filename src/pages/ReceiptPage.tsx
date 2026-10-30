import { useEffect, useMemo, useState } from 'react';
import { EXPLORER_TX_URL, NETWORK } from '../config';
import { decodeInvoice, type Invoice } from '../lib/invoice';
import { checkTxAgainstInvoice, parseTx, type ParsedTx } from '../lib/txReceipt';
import { formatSats } from '../lib/amount';
import { Address, CheckIcon, CrossIcon, ErrorBox, ReceiptPaper } from '../components/ui';
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
        if (tx.txid !== txid) throw new Error('The server sent a different transaction.');
        if (live) setLoad({ k: 'ok', tx });
      })
      .catch((e) => {
        const raw = e instanceof Error ? e.message : String(e);
        const message = /no such mempool or blockchain transaction/i.test(raw) ? `There is no transaction with this ID on ${NETWORK}.` : raw;
        if (live) setLoad({ k: 'error', message });
      });
    return () => {
      live = false;
    };
  }, [txid]);

  const inv = invoice && !('error' in invoice) ? invoice : null;
  const tx = load.k === 'ok' ? load.tx : null;
  const check = tx && inv ? checkTxAgainstInvoice(tx, inv) : null;
  const nfts = tx ? tx.outputs.filter((o) => o.nft) : [];
  const shown = (check && nfts.find((o) => o.nft!.commitment === check.expectedCommitment)) || nfts[0];
  const verified = !!check && check.commitmentMatches && check.payeePaid;

  return (
    <main className={inv ? 'sheet' : 'sheet sheet-narrow'}>
      <div className="sheet-head">
        <h1>Receipt</h1>
        <p className="mono-small">Transaction {txid}</p>
      </div>
      {inv && (
        <div className="sheet-paper">
          <ReceiptPaper
            invoice={inv}
            stamp={check ? (verified ? 'paid' : 'mismatch') : undefined}
            stub={shown?.nft ? { commitment: shown.nft.commitment, category: shown.nft.category, txid } : undefined}
          />
        </div>
      )}
      <div className="sheet-flow">
        {load.k === 'loading' && <p className="working">Looking the transaction up on {NETWORK}…</p>}
        {load.k === 'error' && (
          <ErrorBox title="Transaction not found">
            <p>{load.message}</p>
            <p>Check the ID. If it was sent seconds ago, reload in a moment.</p>
          </ErrorBox>
        )}
        {invoice && 'error' in invoice && (
          <ErrorBox title="The invoice in this link can’t be read">
            <p>{invoice.error}. The transaction is shown without a comparison.</p>
          </ErrorBox>
        )}
        {check && (
          <ul className="checks">
            <li className={check.payeePaid ? 'is-ok' : 'is-bad'}>
              {check.payeePaid ? <CheckIcon /> : <CrossIcon />}
              {check.payeePaid ? 'An output pays the seller at least the invoice amount.' : 'No output pays the seller the invoice amount.'}
            </li>
            <li className={check.commitmentMatches ? 'is-ok' : 'is-bad'}>
              {check.commitmentMatches ? <CheckIcon /> : <CrossIcon />}
              {check.commitmentMatches ? 'An NFT in it carries this invoice’s fingerprint.' : 'No NFT in it carries this invoice’s fingerprint.'}
            </li>
          </ul>
        )}
        {tx && nfts.length === 0 && <p>This transaction has no NFT, so it isn’t a BCH Paylink payment.</p>}
        {shown?.nft && (
          <dl className="ledger ledger-stack">
            <div><dt>NFT held by</dt><dd>{shown.address ? <Address value={shown.address} /> : 'a non-standard script'}</dd></div>
            <div><dt>Output</dt><dd>#{shown.index}, {formatSats(shown.sats)} sats</dd></div>
            {!inv && <div><dt>Fingerprint</dt><dd><code className="wrap">{shown.nft.commitment}</code></dd></div>}
            {!inv && <div><dt>Token category</dt><dd><code className="wrap">{shown.nft.category}</code></dd></div>}
          </dl>
        )}
        {tx && (
          <p className="hint">
            {inv
              ? 'This shows the transaction as soon as the network sees it. The explorer shows confirmations.'
              : 'To compare with an invoice, open this receipt from the pay page after paying.'}
          </p>
        )}
        <a className="btn btn-quiet" href={EXPLORER_TX_URL[NETWORK] + txid} target="_blank" rel="noreferrer">See it on the explorer</a>
      </div>
    </main>
  );
}
