# Fragrance Land

Full local e-commerce system for Fragrance Land.

## Run the production-like local app

```bash
npm install
npm run local
```

Open `http://localhost:3012`.

The local server serves the built React app and exposes the API on the same port. Without Supabase variables, local development falls back to `${DATA_DIR}/store.json` and `${DATA_DIR}/uploads/`. In production, Supabase stores the catalog, categories, orders, pending checkouts, and uploaded product images so they survive Render restarts and deploys.

## Admin login

Default local credentials:

- Email: `admin@fragranceland.local`
- Password: `admin123`

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env` before using the app beyond local testing.

## Stripe payments

The checkout uses Stripe Checkout in AED. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the environment. In Stripe Dashboard, create a webhook endpoint at `/api/stripe/webhook` and listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Orders are created in the admin area only after Stripe confirms payment.

## Supabase persistence

The project uses a server-side Supabase state table and a public product-image bucket. The migration is in `supabase/migrations/20261119000000_fragrance_land_state.sql`.

Set these variables in Render. `SUPABASE_SECRET_KEY` is a server-only secret; never put it in React/Vite variables or commit it to GitHub. If your project still shows the older key format, `SUPABASE_SERVICE_ROLE_KEY` is also accepted by the server.

```text
SUPABASE_URL=https://abswgdopccgxmykgwqsx.supabase.co
SUPABASE_SECRET_KEY=your-server-only-supabase-secret-key
SUPABASE_STORAGE_BUCKET=fragrance-products
```

## Production direction

The app is structured as a single Node service so it can be pushed to GitHub and deployed to Render. Before going live:

- Set `NODE_ENV=production`, strong `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters.
- Set the live Stripe secret and live webhook signing secret in Render; never commit them.
- Do not rely on Render's local filesystem for shop data. Set the Supabase variables above; products, categories, orders, checkout drafts, and uploaded images will then be stored in Supabase.
- Use HTTPS and verify the Stripe webhook delivery shows HTTP 200.

