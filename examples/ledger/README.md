# Ledger

A small billing API. Invoices are kept in cents, card payments go through a gateway that the caller provides, and the payment provider reports its events by webhook.

## Run

    npm start       # listens on PORT, 8090 by default
    npm test        # node --test
    npm run lint

## Endpoints

- `GET /api/invoices/:number` answers with the invoice number, its customer, its total and its balance, in cents.
- `POST /webhooks/provider` receives the provider's events. `payment.succeeded` records a payment on the invoice; `payment.failed` is acknowledged and changes nothing.

## Modules

- `src/money.js` formats cents and takes percentages, rounded half up to the cent.
- `src/invoices.js` holds invoices, their lines, VAT, totals and balances.
- `src/payments.js` records payments and charges a card through a gateway with a `charge({ amountCents, token, reference })` method.
- `src/webhooks.js` parses and handles the provider's events.
- `src/store.js` is the in-memory invoice store.
