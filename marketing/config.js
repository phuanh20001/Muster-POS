// App host (Cloudflare Tunnel) — order, loyalty, webhooks.
// PLACEHOLDER until the real Dreamy Cafe domain is registered. It is deliberately a reserved
// .invalid TLD (RFC 2606) rather than the old dreamy-cafe.com: every "Order Online" button on
// the public page is built from this value, so a stale domain the shop does not own would send
// real customers to whoever registers it next, with our page as the referrer. A dead link is a
// visible bug; a live link to someone else's site is not. .invalid can never be registered.
// The variable NAME stays as-is (docs/rebrand-checklist.md §4) — only this value changes.
window.DREAMYCAFE_ORDER_ORIGIN = 'https://CHANGE_ME.invalid'

function dcUrl(path) {
  return window.DREAMYCAFE_ORDER_ORIGIN.replace(/\/$/, '') + path
}
