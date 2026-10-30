# BCH Paylink — spec (BCH BLAZE 2026, Mainnet Track)

Goal: a merchant/freelancer makes a payment link for an invoice; the buyer opens it, pays in BCH (later PUSD) from their own wallet via WizardConnect (Paytaca), and the same transaction mints a CashTokens NFT receipt to the buyer. Judges understand it in 30 seconds and can pay a real mainnet invoice of a few thousand sats.

## Must (hackathon rules)
- Static web app (Vite + React), deploy to Cloudflare Pages; judges click and use, no backend.
- WizardConnect integration (@wizardconnect/react / dapp) for wallet connect + signing.
- At least one real BCH mainnet transaction: the invoice payment.
- Banner at top of homepage: slide link, repo link, project CashTokens address (placeholders until known).
- Public GitHub repo with README; commits spread across the hackathon.

## Flow
1. Create invoice page: merchant enters payee BCH address (cashaddr), amount (BCH or sats), memo, optional due date → app builds a shareable URL; all invoice data lives in the URL (base64url JSON, versioned), no server.
2. Pay page (opened from link): shows invoice, validates it (address network, amount ≥ dust 546 sats, memo length), "Connect wallet" via WizardConnect, then builds an unsigned tx: buyer inputs → payee output (amount) + NFT receipt output to buyer (genesis from buyer's input 0, commitment = short hash of invoice) + change; asks wallet to sign; shows txid + explorer link.
3. Receipt page: given txid, show the receipt NFT and invoice hash so anyone can verify payment ↔ invoice.

## Non-goals v1
PUSD payments (stretch), escrow, accounts, storing keys, any custody of funds.

## Quality
- Pure logic (invoice encode/decode/validate, commitment hash, tx output planning, fee estimate) in src/lib with node --test / vitest tests; mock network for tx building.
- Never hold private keys of users. No secrets in repo.
- Mainnet by default, testnet/chipnet toggle via env for development.

## Project addresses (owner's Paytaca wallet, public)
- BCH: bitcoincash:qz8l22vpcx037klsqha3jzqq8lsnx4jkry9ru9e4pd
- CashTokens (banner): bitcoincash:zz8l22vpcx037klsqha3jzqq8lsnx4jkryzf0mhn77
