# BCH Paylink

Make a Bitcoin Cash payment link. The buyer opens it, pays from their own wallet through WizardConnect (Paytaca), and the same transaction mints a CashTokens NFT to the buyer. The NFT commitment is a fingerprint of the invoice, so anyone can check which invoice a payment was for.

Static site, no backend, no custody. Invoice data lives in the link (base64url JSON).

## Pages

- `#/` print an invoice: payee address, amount in BCH, memo, optional due date. Gives a link and a QR code.
- `#/pay/<invoice>` shows the invoice, connects a wallet (WizardConnect), plans and builds the transaction, asks the wallet to sign, checks the wallet only added signatures, then broadcasts through Electrum.
- `#/receipt/<txid>?inv=<invoice>` reads the transaction from Electrum, shows the NFT (category, commitment) and whether it matches the invoice.

## Run

```sh
npm install
npm run dev        # chipnet by default
npm test           # vitest, pure logic in src/lib
npm run build      # mainnet by default; output in dist/
npm run preview
```

Network: set `VITE_NETWORK=mainnet` or `VITE_NETWORK=chipnet`. Unset means chipnet in `vite dev` and mainnet in `vite build`.

Banner links (slides, GitHub) and the project CashTokens address are in `src/config.ts`.

## How payment works

1. The wallet shares xpubs for its `receive` and `change` chains. The app derives the first 20 addresses of each and asks Electrum for their coins.
2. Input 0 must be a coin that was output 0 of its transaction (CashTokens genesis rule). If the wallet has none, the app offers a "Prepare wallet" self-send first.
3. Outputs: payee amount, receipt NFT to the buyer's receive/0 address, change to the same address.
4. Sign request: `inputPaths` = `[inputIndex, 'receive' | 'change', addressIndex]` per input. The app asks the wallet not to broadcast and broadcasts the signed hex itself. If the result of a broadcast is unclear, it offers to resend the same transaction, never a new one.
