# DTR – Daily Time Record

```
dtr-app/
├─ backend/   Node + Express + TypeScript + MySQL
└─ frontend/  React + TypeScript + Vite + Tailwind + shadcn/ui
```

## Run
```bash
npm install          # installs both workspaces
npm run dev          # API on :4000, web on :5173
```
Tables are created automatically on first start. Config lives in `backend/.env`.

## Notes
- **OTP**: in development the code is shown on the login screen and printed in the API console. For production set `NODE_ENV=production` and `SMTP_*` for email; phone/SMS needs a provider wired into `backend/src/otp.ts`.
- **Admins**: emails/phones listed in `ADMIN_IDENTIFIERS` become admins when they register.
- **Leave**: 25 credits each for vacation and sick leave; credits are deducted when an admin approves.
- **Location**: browser GPS is reverse-geocoded on the server (OpenStreetMap Nominatim) and stored with the client IP.
- Rotate the DB password and `JWT_SECRET` before deploying; `.env` is git-ignored.
