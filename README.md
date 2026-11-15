# Fragrance Land

Full local e-commerce system for Fragrance Land.

## Run the production-like local app

```bash
npm install
npm run local
```

Open `http://localhost:3012`.

The local server serves the built React app and exposes the API on the same port. Products and orders are stored in `${DATA_DIR}/store.json`; uploaded product images are stored in `${DATA_DIR}/uploads/`.

## Admin login

Default local credentials:

- Email: `admin@fragranceland.local`
- Password: `admin123`

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env` before using the app beyond local testing.

## Stripe payments

The checkout uses Stripe Checkout in AED. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the environment. In Stripe Dashboard, create a webhook endpoint at `/api/stripe/webhook` and listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Orders are created in the admin area only after Stripe confirms payment.

## Production direction

The app is structured as a single Node service so it can be pushed to GitHub and deployed to Render. Before going live:

- Set `NODE_ENV=production`, strong `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
- Set the live Stripe secret and live webhook signing secret in Render; never commit them.
- Attach a Render persistent disk mounted at `/opt/render/project/src/storage` and set `DATA_DIR=/opt/render/project/src/storage`. Without persistent storage, products, orders, and uploaded images can disappear after a deploy or restart.
- Use HTTPS and verify the Stripe webhook delivery shows HTTP 200.

