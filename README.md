# VORTIX

VORTIX is a full-stack shopping application with a React frontend and an Express/MongoDB API.

## Requirements

- Node.js and npm
- MongoDB Atlas or a local MongoDB replica set. The API uses database transactions; a standalone local MongoDB server is not sufficient.

## Local setup

1. Copy `backend/.env.example` to `backend/.env` and set the values for your local environment. At minimum, configure `MONGO_URI`, `JWT_SECRET`, and `OTP_HASH_SECRET`.
2. Copy `frontend/.env.example` to `frontend/.env`. Set `VITE_API_URL` if the API is not running at `http://localhost:5000`. Set `VITE_GOOGLE_CLIENT_ID` only if Google sign-in is configured.
3. Install and start the API:

   ```sh
   cd backend
   npm ci
   npm run dev
   ```

4. In a separate terminal, install and start the frontend:

   ```sh
   cd frontend
   npm ci
   npm run dev
   ```

The frontend is served at `http://localhost:5173` by default. Configure `FRONTEND_URL` in the backend environment to match the frontend origin. See `backend/.env.example` for additional optional and production settings.

## Checks

Run these commands from their respective directories:

```sh
# backend
npm test

# frontend
npm test
npm run lint
npm run build
```

## Environment variables and credentials

Never commit `.env` files or put private credentials in frontend variables. Frontend variables such as `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` are included in browser code. Use the `.env.example` files as templates and configure production secrets in your hosting provider.
