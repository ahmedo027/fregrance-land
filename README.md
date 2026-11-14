# Fragrance Land

Full local e-commerce system for Fragrance Land.

## Run the production-like local app

```bash
npm install
npm run local
```

Open `http://localhost:3012`.

The local server serves the built React app and exposes the API on the same port. Products and orders are stored in `data/store.json`; uploaded product images are stored in `public/uploads/`.

## Admin login

Default local credentials:

- Email: `admin@fragranceland.local`
- Password: `admin123`

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env` before using the app beyond local testing.

## Production direction

The app is structured as a single Node service so it can be pushed to GitHub and deployed to Render. Before going live, configure environment secrets, attach persistent storage or move the store to managed Postgres/object storage, add a real payment provider, and use HTTPS.

