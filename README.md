# BCH Paylink

A payment link for Bitcoin Cash. The seller fills in an invoice and gets a link and a QR code. The buyer opens the link, pays from their own wallet over WizardConnect, and the same transaction mints a CashTokens NFT to the buyer as a receipt. The NFT commitment is a hash of the invoice, so anyone can check which invoice a payment was for.

It is a static site: no backend, no accounts, no custody. The app never sees a private key.

Live: https://runduck113.github.io/bch-paylink/

**Status:** hackathon build. Verified end-to-end on mainnet with Paytaca over WizardConnect: [transaction d4d54134…74184f](https://blockchair.com/bitcoin-cash/transaction/d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f) pays the invoice (10,000 sats) and mints the NFT receipt to the buyer in one transaction. Still a hackathon build: do not use it for amounts you care about.

## How to use

1. Open `#/` and fill in the payee address, the amount in BCH, a memo and an optional due date. You get a link and a QR code.
2. Send the link to the buyer. On `#/pay/<invoice>` they connect a wallet (Paytaca, via WizardConnect), review the transaction and sign it.
3. After the payment, `#/receipt/<txid>?inv=<invoice>` shows the receipt NFT and whether it matches the invoice.

## How it works

- **Invoice in the URL.** The invoice is base64url-encoded JSON inside the link (`#/pay/<invoice>`), so nothing is stored on a server. Links are capped at 4096 characters and validated when decoded.
- **WizardConnect signing.** The wallet shares xpubs for its `receive` and `change` chains. The app derives the first 20 addresses of each, asks Electrum for their coins, builds the transaction, and sends it to the wallet with `inputPaths` so the wallet knows which key signs which input. The app asks the wallet not to broadcast, checks that the wallet only added signatures, then broadcasts the signed hex itself. If a broadcast result is unclear, it offers to resend the same transaction, never a new one.
- **NFT receipt in the same transaction.** CashTokens genesis needs input 0 to spend an output 0 of its parent transaction; that parent txid becomes the token category. The outputs are the payment to the payee, the receipt NFT to the buyer's receive/0 address, and change. The NFT commitment is the first 20 bytes of sha256 over a canonical JSON form of the invoice. If the wallet has no suitable coin, the app offers a small self-send first ("Prepare wallet").

## Run locally

```sh
npm install
npm run dev        # chipnet by default
npm test           # vitest, pure logic in src/lib
npm run build      # mainnet by default; output in dist/
npm run preview
```

Network: set `VITE_NETWORK=mainnet` or `VITE_NETWORK=chipnet`. Unset means chipnet in `vite dev` and mainnet in `vite build`.

The production build uses the base path `/bch-paylink/` for GitHub Pages. Routing is hash-based, so deep links work without server rewrites. `.github/workflows/pages.yml` runs the tests, builds and deploys on every push to `master`.

Banner links (slides, GitHub) and the project CashTokens address are in `src/config.ts`.

## License

MIT, see [LICENSE](LICENSE).
