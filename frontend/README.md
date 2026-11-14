# VORTIX frontend

## Run locally

Install dependencies and start the frontend:

```sh
npm install
npm run dev
```

The API defaults to `http://localhost:5000`. To use another backend, set
`VITE_API_URL` in `frontend/.env.local`, for example:

```env
VITE_API_URL=https://api.example.com
```

Configure the backend's `FRONTEND_URL` with the frontend origin. Multiple
comma-separated origins are supported. For local development, use
`http://localhost:5173`. Production cookies are HTTP-only, secure, and use
`SameSite=None` by default to support a separately hosted frontend; non-GET
requests are also restricted to configured origins. Set `COOKIE_SAME_SITE`
to `strict` or `lax` if deploying under a same-site origin.

## Checks

```sh
npm run lint
npm run build
```
