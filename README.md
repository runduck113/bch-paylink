# BCH Paylink

Bitcoin Cash invoices as links. The buyer pays from their own wallet, and the same mainnet transaction mints them a CashTokens NFT receipt that names the exact invoice.

- Live app: https://runduck113.github.io/bch-paylink/
- Verified mainnet payment, checked live in the app (no wallet needed): [open the receipt](https://runduck113.github.io/bch-paylink/#/receipt/d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f?inv=eyJ2IjoxLCJwYXllZSI6ImJpdGNvaW5jYXNoOnF6OGwyMnZwY3gwMzdrbHNxaGEzanpxcThsc254NGprcnk5cnU5ZTRwZCIsInNhdHMiOjEwMDAwLCJtZW1vIjoiVGVzdCIsImN1cnJlbmN5IjoiQkNIIn0)
- Same transaction on an explorer: [d4d54134…74184f on Blockchair](https://blockchair.com/bitcoin-cash/transaction/d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f)
- Slides: [BCH BLAZE 2026 deck](https://docs.google.com/presentation/d/1b6KO1aTGUeWA0oWCafc7ZTAp0i3hFmOKYymTJ6YXZTI/edit?usp=sharing)
- Built for BCH BLAZE 2026, Mainnet Track. Project CashTokens address: `bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77`

| Seller fills in the slip | Buyer scans with their wallet | Anyone checks the receipt |
| --- | --- | --- |
| ![The invoice slip on the create page](docs/screenshots/1-create.jpg) | <img src="docs/screenshots/2-counter-wallet-qr-mobile.jpg" alt="After Print, the slip shows the WizardConnect QR for the buyer's wallet" width="260"> | ![The receipt page for the real mainnet payment, both checks passed](docs/screenshots/3-receipt-mainnet.jpg) |

## Try it in 60 seconds

1. Open https://runduck113.github.io/bch-paylink/.
2. No wallet at hand: click **See a real paid receipt** under the intro. The page fetches the real mainnet transaction, recomputes the invoice fingerprint, and shows two green checks and a PAID stamp. Then click **that seller’s ledger**: every payment to the seller’s address, with the Paylink receipt picked out from the plain payments. Paste the [demo pay link](https://runduck113.github.io/bch-paylink/#/pay/eyJ2IjoxLCJwYXllZSI6ImJpdGNvaW5jYXNoOnF6OGwyMnZwY3gwMzdrbHNxaGEzanpxcThsc254NGprcnk5cnU5ZTRwZCIsInNhdHMiOjEwMDAwLCJtZW1vIjoiVGVzdCIsImN1cnJlbmN5IjoiQkNIIn0) into its Invoices box and the "Test" invoice shows as PAID.
3. With a wallet: fill in the slip (your own `bitcoincash:` address, an amount such as `0.0001`, a memo) and press **Print payment link**. The slip shows a WizardConnect QR at once.
4. Scan it with Paytaca (or paste the connect link into Paytaca under Apps, WizardConnect). Check the amount, approve in the wallet, then open the receipt.

Paying yourself costs only the network fee (a few hundred sats) plus 711 sats that stay with you in the NFT output.

## Business case

**Who it's for.** Freelancers and small sellers who get paid in BCH remotely: by chat, email or a shop page, not at a counter. This is our assumption about the first users, not a measured market; we have no user numbers yet.

**The pain.** A bare address tells the seller that money arrived, not what it was for. Two customers paying the same amount on the same day look identical, and a memo in a chat message is not on chain. The seller reconciles by hand, and the buyer has nothing to show later except a txid. With a Paylink invoice, each payment carries an NFT whose commitment is a hash of that exact invoice. The seller gets a ledger that matches payments to invoices without a backend, and the buyer keeps a proof of payment.

**Why now.**
- People already pay merchants in BCH, and the number is growing. Paytaca, a non-custodial BCH wallet and POS from the Philippines, went from about 80 merchants (BitPinas, Aug 2024) to over 122 in the Visayas (SunStar, Dec 2024) to more than 300 (NewsBytes, Mar 2026). Paytaca's own site lists 300+ merchant partners in 20+ countries and 50K+ wallets.
- A major general processor stepped back. In Feb 2024 Coinbase Commerce dropped native Bitcoin and other UTXO coins, BCH included; paying with them now needs a Coinbase account (Cointelegraph).
- The tools are new. CashTokens went live on mainnet on 15 May 2023, which is what makes an NFT receipt inside the payment transaction possible. WizardConnect lets a web page ask a wallet such as Paytaca to sign without the page holding keys.

**Competitors.**

| | Who holds the money | Account needed | Fee | Proof for the buyer |
| --- | --- | --- | --- | --- |
| BitPay | BitPay, then it settles to the merchant's bank | Merchant account | 2% + 25¢ per payment under $500k a month | Invoice in BitPay's system |
| Coinbase Commerce | Native BCH dropped in Feb 2024 | Payer needs a Coinbase account | n/a | n/a |
| Prompt.cash | Merchant's own wallet (non-custodial) | Merchant registers | Free tier; Standard listed at $20/month + $0.01 per transaction (first year currently free) | Record in Prompt.cash's dashboard |
| Paytaca POS | Merchant's own wallet (non-custodial) | Paytaca wallet | Free to merchants | Wallet history |
| BCH Paylink | Seller's own wallet (non-custodial) | None, for seller or buyer | Network fee only | NFT receipt on chain, checkable by anyone with the invoice link |

What Paylink does that the others don't: no account on either side, no service of ours in the payment path (it is a static page), a receipt NFT that names the exact invoice and can be checked against the chain, and a ledger with CSV export built only from public chain data. What the others do that Paylink doesn't yet: Prompt.cash has a hosted merchant dashboard and a WordPress/WooCommerce plugin; Paytaca has a POS for in-person sales and a working merchant network. Paylink is meant to sit next to wallets like Paytaca and Selene, not replace them.

**Sustainability without custody.** The free core stays a static, open-source page: invoices, payment, receipts, ledger. Money would come only from things a static page cannot do, and none of them touch funds:
- An optional hosted merchant dashboard: invoice history across devices, reminders for unpaid invoices, branded invoice and receipt pages, recurring invoices, accounting exports beyond CSV. Prompt.cash's listed $20/month tier (first year currently free) shows that hosted non-custodial BCH tooling can be priced.
- A receipt-verification API, so shops, marketplaces or accountants can ask "was invoice X paid?" without running an Electrum client.
- White-label receipt minting for wallets and POS apps that want NFT receipts in their own payment flow.
- BCH ecosystem funding for the open-source core, such as Flipstarter crowdfunding (Prompt.cash had raised 206 BCH toward a 390 BCH goal by March 2021).

These are plans; none of them is built.

**Go-to-market.**
- BCH channels where builders and merchants already are: the BLAZE and BCH builder Telegram groups, r/btc, the Bitcoin Cash Podcast.
- Wallet teams: a short integration note for Paytaca (WizardConnect) and Selene (WalletConnect) on how a pay link and receipt fit their flow.
- Sellers directly: a "send a BCH invoice" guide for freelancers, shared in the communities where Paytaca already onboards merchants.

**Next 90 days.**
1. Days 1-30: a merchant view that rebuilds the invoice list from the seller's receipts on chain, so a second browser no longer starts empty. Test with a second wallet, e.g. Cashonize.
2. Days 31-60: stablecoin invoices (ParyonUSD or another CashTokens stablecoin) so prices hold in fiat terms; a public receipt-check endpoint as a first version of the API.
3. Days 61-90: run 10 real invoices with named sellers, write up what broke, then decide between a Flipstarter and charging for the hosted dashboard.

**Sources** (read 2 Nov 2026):
- BCH BLAZE 2026 judging criteria: https://dorahacks.io/hackathon/bchblaze2026/detail
- Paytaca, about 80 merchants (Aug 2024): https://bitpinas.com/feature/paytaca-expansion-interview/
- Paytaca, over 122 merchants in the Visayas (Dec 2024): https://www.sunstar.com.ph/tacloban/paytaca-partners-with-cebus-biggest-night-club-apex-super-club
- Paytaca, more than 300 merchants (Mar 2026): https://newsbytes.ph/2026/03/26/leyte-based-crypto-wallet-firm-expands-network-pushes-use-controlled-model/
- Paytaca's own figures: https://www.paytaca.com/
- Coinbase Commerce drops native BTC and UTXO coins (Feb 2024): https://cointelegraph.com/news/coinbase-drops-bitcoin-payments-merchants-platform
- BitPay fees (archived 7 Feb 2026): https://web.archive.org/web/20260207052153/https://bitpay.com/pricing/
- Prompt.cash pricing: https://prompt.cash/ and its 2021 launch and Flipstarter: https://news.bitcoin.com/developers-launch-first-hosted-noncustodial-payment-processor-bitcoin-cash
- CashTokens activation, 15 May 2023: https://upgradespecs.bitcoincashnode.org/2023-05-15-upgrade/

## How it works

**One transaction does both jobs.** The buyer's transaction has three outputs: the payment to the seller, a new CashTokens NFT to the buyer's first receive address, and change. The NFT is a genesis in that same transaction, so its token category is the txid of the coin spent as input 0. CashTokens only allows genesis from a coin that was output 0 of its own transaction; if the wallet has none, the app first offers a small self-send ("Prepare wallet").

**The NFT commitment is the invoice fingerprint.** The commitment is the first 20 bytes of sha256 over a canonical JSON form of the invoice (fixed key order, lowercase payee, `sats` as a string, `due` only when set). See `src/lib/receipt.ts`. Anyone holding the invoice link can recompute it and compare it with the NFT on chain.

**The invoice lives in the link.** The pay link is `#/pay/<base64url JSON>`. Nothing is stored anywhere. Links are size-capped and validated when opened (address network, dust limit, memo length, date).

**WizardConnect pairing, the wallet signs.** The page shows a WizardConnect QR and an open-in-wallet link. The wallet shares the xpubs of its receive and change chains; the app derives the first 20 addresses of each, reads their coins from a public Electrum server, builds the transaction, and sends it to the wallet unsigned with `inputPaths` so the wallet knows which key signs which input. The app asks the wallet not to broadcast, checks that the wallet only added signatures, then broadcasts the signed transaction itself. If a broadcast result is unclear, it only ever resends the same transaction, never a new one.

**The seller’s ledger.** `#/ledger?addr=<seller address>` reads the address history from Electrum, then each transaction. A transaction counts as a Paylink payment when one of its outputs is an NFT with a 20-byte commitment whose token category equals the txid of input 0, which is how the app mints receipts. Invoices printed in this browser are remembered in localStorage; any other invoice can be pasted as a pay link. For each known invoice the page computes the fingerprint and marks it PAID (a receipt carries it and the same transaction pays the seller at least the amount) or UNPAID. Receipts for invoices this browser doesn’t know are listed too. Totals at the top, 50 transactions at a time with "load more", and a CSV export for accounting. The logic is in `src/lib/ledger.ts`.

![The ledger for the demo seller: one Paylink receipt matched to the "Test" invoice, one plain payment](docs/screenshots/4-ledger.jpg)

**Static site, no custody.** No backend of ours, no accounts, no keys. The page never holds funds.

## Verify the mainnet payment yourself

Transaction `d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f` (block 975291, paid with Paytaca over WizardConnect). Outputs: #0 pays 10,000 sats to the seller `bitcoincash:qz8l22vpcx037klsqha3jzqq8lsnx4jkry9ru9e4pd`, #1 is the 711-sat NFT receipt to the buyer, #2 is change. Fee 315 sats.

1. In the app: open the [receipt link](https://runduck113.github.io/bch-paylink/#/receipt/d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f?inv=eyJ2IjoxLCJwYXllZSI6ImJpdGNvaW5jYXNoOnF6OGwyMnZwY3gwMzdrbHNxaGEzanpxcThsc254NGprcnk5cnU5ZTRwZCIsInNhdHMiOjEwMDAwLCJtZW1vIjoiVGVzdCIsImN1cnJlbmN5IjoiQkNIIn0). The page reads the raw transaction from Electrum, parses it in the browser and checks it against the invoice in the link.
2. By hand, without the app. The invoice in that link, in canonical form, hashes to the commitment:

   ```sh
   printf '%s' '{"v":1,"payee":"bitcoincash:qz8l22vpcx037klsqha3jzqq8lsnx4jkry9ru9e4pd","sats":"10000","memo":"Test","currency":"BCH"}' | sha256sum | cut -c1-40
   # 44070b18c23b01f7789316ff7ad8ffc4ee710e16
   ```

3. The same 20 bytes are in the NFT output of the raw transaction:

   ```sh
   curl -s https://api.blockchair.com/bitcoin-cash/raw/transaction/d4d54134624c5fa42e72833d268559ec24ff57385a1d49727d5ee254d874184f | grep -o 44070b18c23b01f7789316ff7ad8ffc4ee710e16
   ```

   The token category is `70327658aac6516b8437b009fe3c4b45900cec1e517cf2e22d664a9ddbb83410`, the txid of the coin spent as input 0.

## Tech stack

- TypeScript, React 19, Vite. Static build on GitHub Pages, hash routing.
- `@wizardconnect/react` and `@wizardconnect/dapp` for wallet pairing and signing requests.
- `@bitauth/libauth` for HD derivation, transaction building, CashTokens encoding and verification.
- `cashscript`'s `ElectrumNetworkProvider` for reading coins and broadcasting (no contracts).
- Vitest: 175 tests over the pure logic (invoice codec and validation, commitment, output planning and fees, HD paths, receipt parsing, broadcast error classification, ledger receipt detection, invoice matching, CSV).

## Limitations

- Paying needs a WizardConnect wallet; it was tested with Paytaca only.
- "No backend" does not mean no third parties: pairing goes through the WizardConnect relay, and coin lookups and broadcasts go through public Electrum servers.
- The receipt proves that an output paid the seller at least the invoice amount and that an NFT in the same transaction carries the invoice fingerprint. It does not prove who paid, and anyone holding the link could make a matching NFT in another transaction (which would still have to pay the seller).
- Only the first 20 receive and 20 change addresses of the wallet are scanned.
- First-time buyers may need the extra "Prepare wallet" self-send before the NFT can be minted.
- Amounts are in BCH only; there is no fiat price or stablecoin invoice yet.
- The ledger only knows invoices printed in this browser or pasted into it; another browser starts with an empty list. It reads public chain data for one address at a time. It trusts the Electrum server for the history and block heights (no SPV proof), and a server could leave transactions out.
- The "already paid" warning on the pay page lives in the buyer's browser only.
- Hackathon build, not audited. One real mainnet payment so far. Do not use it for amounts you care about.

## Roadmap

- Stablecoin invoices (PUSD or another CashTokens stablecoin).
- Recurring and partial payments against one invoice.
- Accounting formats beyond CSV and receipts as proof of purchase for refunds and warranties.

## Run locally

```sh
npm install
npm run dev        # chipnet by default
npm test           # vitest
npm run build      # mainnet by default; output in dist/
npm run preview
```

Set `VITE_NETWORK=mainnet` or `VITE_NETWORK=chipnet` to choose the network. Unset means chipnet in `vite dev` and mainnet in `vite build`. The production build uses the base path `/bch-paylink/`; `.github/workflows/pages.yml` runs the tests, builds and deploys on every push to `master`. Banner links and the project CashTokens address are in `src/config.ts`.

## License

MIT, see [LICENSE](LICENSE).
