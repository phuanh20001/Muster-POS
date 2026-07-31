# Square security & configuration

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `SQUARE_ACCESS_TOKEN` | API access token (`sq0atp-...` production, sandbox prefix for test) |
| `SQUARE_ENV` | `sandbox` (default) or `production` |
| `SQUARE_LOCATION_ID` | Location for orders and payment links (required online) |
| `SQUARE_DEVICE_ID` | Fallback Terminal device id if DB config missing |
| `SQUARE_CURRENCY` | ISO currency (default `AUD`; falls back to `STRIPE_CURRENCY`) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Webhook HMAC verification |

Never commit `.env` or tokens. Use sandbox tokens for dev scripts.

## Sandbox vs production

- `isSquareTestMode()` — true when `SQUARE_ENV` is not `production`
- `SquareClient` uses `SquareEnvironment.Sandbox` or `Production`
- Sandbox device: `9fa747a2-25ff-48ee-b078-04381f7c828f` (no physical reader pairing)

Switch Admin → Payments provider toggles only after both environments are configured and tested.

## Access tokens

- Prefer **restricted** application permissions where Square supports scoping
- Rotate tokens if exposed; update `.env` on shop PC only
- OAuth apps: use Square’s OAuth flow for multi-merchant apps — DreamyCafe is single-merchant and uses a static access token

## Public zone

Square webhook and online order APIs are internet-exposed only through the public allowlist. Staff terminal routes (`/api/terminal/*`) are **LAN-only**.

## PCI

Card data never touches DreamyCafe — Terminal readers and Payment Links are Square-hosted. Do not log full payment objects or card details.

## Official MCP (optional)

For exploratory API work in Cursor/Claude (not required for this app):

```bash
npx mcp-remote https://mcp.squareup.com/sse
```

Or local: `npx square-mcp-server start` with `ACCESS_TOKEN` and `SANDBOX=true`.

Use `DISALLOW_WRITES=true` when exploring production data read-only.
