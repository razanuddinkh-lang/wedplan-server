# WedPlan Server

Express + TypeScript API for WedPlan. Uses the same MongoDB database as the Next.js Better Auth server.

## Setup

```powershell
Copy-Item .env.example .env
npm install
npm run seed:demo  # optional, local preview data
npm run dev
```

Set `MONGODB_URI`, `MONGODB_DB_NAME`, `BETTER_AUTH_URL`, `CLIENT_URL`, and `IMGBB_API_KEY`. Premium checkout additionally needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and optional amount/currency values. See the root README for Google OAuth, admin provisioning, Stripe CLI, and deployment steps.

## API routes

| Route | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | Health status |
| `GET /api/services` | Public | Approved and active service search/filter/sort |
| `GET /api/services/:id` | Signed in | Service details |
| `GET /api/services/mine` | Vendor | Vendor listings |
| `POST /api/services` | Vendor | Submit service for review |
| `PATCH /api/services/:id` | Owner vendor | Update own service; resubmits for review |
| `DELETE /api/services/:id` | Owner vendor or admin | Delete service |
| `POST /api/bookings` | Customer | Submit booking request |
| `GET /api/bookings/mine` | Customer or vendor | Own bookings / vendor requests |
| `PATCH /api/bookings/:id/respond` | Owning vendor | Accept or reject pending request |
| `PATCH /api/bookings/:id/cancel` | Owning customer | Cancel pending request |
| `GET /api/dashboard/stats` | Signed in | Role-specific dashboard statistics |
| `GET/PATCH /api/users/me` | Signed in | View/update safe profile fields |
| `POST /api/uploads/image` | Signed in | Upload image to ImgBB |
| `POST /api/payments/create-checkout-session` | Vendor | Create Premium subscription checkout |
| `POST /api/payments/webhook` | Stripe signature | Verified payment/subscription events |
| `GET /api/admin/users` | Admin | Search/filter accounts |
| `PATCH /api/admin/users/:id/block` | Admin | Block/unblock account |
| `GET /api/admin/services` | Admin | Review submitted listings |
| `PATCH /api/admin/services/:id/status` | Admin | Approve/reject service |
| `DELETE /api/admin/services/:id` | Admin | Remove inappropriate listing |
| `GET /api/admin/transactions` | Admin | Read verified transactions |

## JWT integration

The Next.js Better Auth app enables `jwt()`. The frontend obtains a JWT using `authClient.token()` and sends it as `Authorization: Bearer ...`. This API verifies the token signature using `${BETTER_AUTH_URL}/api/auth/jwks`, checks issuer/audience, then reloads the user from the `users` collection for current role and blocked status. Keep both Better Auth base URLs identical.

## Stripe

`/api/payments/webhook` is registered before the JSON body parser and uses `express.raw({ type: "application/json" })`. Do not move it below `express.json()`. Premium is only updated after a verified webhook event; do not add frontend-based activation logic.
