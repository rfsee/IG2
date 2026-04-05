# IG2 Deployment Guide

This repo is ready for a free internal test deployment using a split architecture:

- Frontend: Cloudflare Pages or Render Static Site
- Backend: Render Web Service from `backend/`
- Database: Neon Postgres

## Repo structure

- Root static frontend: `index.html`, `app.js`, `styles.css`
- Backend API: `backend/`
- Backend blueprint: `render.yaml`
- Frontend runtime config: `config.js`
- Frontend config example: `config.example.js`

## Frontend deployment

Deploy the repo root as a static site.

Recommended settings:
- Build command: none
- Publish directory: `.`

Cloudflare Pages suggested setup:
- Framework preset: `None`
- Build command: *(leave empty)*
- Build output directory: `.`
- Root directory: `/`

Set `config.js` to your backend URL:

```js
window.__IG2_RUNTIME_CONFIG__ = {
  BACKEND_API_BASE: "https://your-render-backend.onrender.com",
  ALLOW_PUBLIC_API_BASE_OVERRIDE: false
};
```

Frontend backend API base resolution order:
1. `window.__IG2_RUNTIME_CONFIG__.BACKEND_API_BASE`
2. `http://127.0.0.1:8793`

For public deployments, `ALLOW_PUBLIC_API_BASE_OVERRIDE` should stay `false` so the frontend does not send auth tokens to arbitrary backend URLs.

## Backend deployment

Deploy `backend/` as a Node web service.

Required env vars for persistent internal testing:

```env
DATA_PROVIDER=postgres
AUTH_PROVIDER=local
AUTH_REGISTER_ENABLED=true
AUTH_REGISTER_EMAIL_ALLOWLIST=tester1@example.com,tester2@example.com
AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX=@yourcompany\\.com$
CORS_ALLOWED_ORIGINS=https://rfsee.github.io
AUTH_SESSION_TTL_DAYS=3
AUTH_PASSWORD_MIN_LENGTH=10
DATABASE_URL=postgres://...
```

Recommended first rollout:
1. Deploy backend with `DATA_PROVIDER=memory`
2. Deploy frontend static site
3. Point `config.js` to backend public URL
4. Verify `/health`, login, posts, products, brand strategy

### Registration modes

- **Closed / internal pilot**

```env
AUTH_REGISTER_ENABLED=false
```

- **Small external whitelist**

```env
AUTH_REGISTER_ENABLED=true
AUTH_REGISTER_EMAIL_ALLOWLIST=tester1@example.com,tester2@example.com
AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX=
```

- **Broader public registration**

```env
AUTH_REGISTER_ENABLED=true
AUTH_REGISTER_EMAIL_ALLOWLIST=
AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX=
AUTH_PROVIDER=local
CORS_ALLOWED_ORIGINS=https://rfsee.github.io
AUTH_SESSION_TTL_DAYS=3
AUTH_PASSWORD_MIN_LENGTH=10
```

The backend now issues opaque `ig2_...` session tokens in `AUTH_PROVIDER=local` mode and also sets an `HttpOnly` secure cookie for browser sessions.
Public auth is additionally protected by persistent auth throttling, server-side logout revocation, minimized `/health`, request body size limits, and browser-side CSP/referrer policy.

Render service settings (from this repo):
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm run start`
- Health Check Path: `/health`

## Neon Postgres rollout

After the first successful online test:

```bash
cd backend
npm install
npm run migrate
npm run seed:dev
```

Then switch backend to `DATA_PROVIDER=postgres` and set `DATABASE_URL`.

Legacy seeded users should not be used for public testing. Prefer freshly created accounts with the current password policy.

## Internal-only registration

Keep self-registration restricted to company users:

```env
AUTH_REGISTER_ENABLED=true
AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX=@yourcompany\\.com$
```

Temporarily close registration if needed:

```env
AUTH_REGISTER_ENABLED=false
```

## Free-tier notes

- Render free web service may sleep when idle and cold-start on the next request
- Neon free is suitable for internal testing, not long-term production scale
- Public deployments should keep frontend API-base override disabled and avoid publishing any legacy shared credentials

## Executable rollout checklist

1. **Deploy backend first (Render)**
   - Create Web Service from this repo
   - Apply Render settings above
   - Set env vars from `backend/.env.deploy.example`
   - For quick bring-up: start with `DATA_PROVIDER=memory`

2. **Switch backend to Postgres (Neon)**
   - Create Neon project and copy connection string
   - Set `DATABASE_URL`
   - Set `DATA_PROVIDER=postgres`
   - Run once in backend workspace:
     - `npm install`
     - `npm run migrate`
     - `npm run seed:dev`

3. **Deploy frontend (Cloudflare Pages)**
   - Deploy repo root as static site
   - Configure runtime backend URL:
     - edit `config.js`, or
     - run `deploy/set-backend-base.ps1`

4. **Internal registration safety**
   - Keep:
     - `AUTH_REGISTER_ENABLED=true`
     - `AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX=@yourcompany\\.com$`

5. **Verify online environment**
   - Run:
     - `deploy/verify-deployment.ps1`
   - Confirm backend `/health` = 200 and frontend index = 200
