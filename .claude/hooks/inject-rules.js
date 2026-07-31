const ctx = [
  "DreamyCafe rules (canonical: AGENTS.md — follow exactly):",
  "- JavaScript ONLY — never add .ts/.tsx, types, or JSDoc type annotations.",
  "- Money: use decimal.js via src/lib/money.js — never raw + - * / or comparison operators on money; wrap incoming API money with D() before math/compare/toFixed.",
  "- No native browser dialogs (window.confirm/alert/prompt) — use the in-app usePromptDialog/ConfirmDialog.",
  "- No new dependencies unless the task clearly needs them; reuse existing helpers/patterns first.",
  "- No comments unless the WHY is non-obvious; minimal scope, no drive-by refactors.",
  "- Never commit or push unless explicitly asked; never commit .env or secrets.",
  "- Update CHANGELOG.md on meaningful work.",
  "- Stripe/Square work: consult skills/stripe-best-practices/SKILL.md and skills/square-best-practices/SKILL.md.",
  "- Public zone paths: never trust client-supplied prices/discounts/stamps — recompute server-side.",
  "",
  "Agent-tooling restriction:",
  "- codegraph (code-index MCP): OK to use anywhere — it is read-only and reinforces the call-site rules above.",
  "- headroom (context compressor): do NOT run it while working on money/payment/auth/zone code — src/lib/money.js, src/app/api/orders/**, src/app/api/terminal/**, src/app/api/webhooks/**, src/proxy.js, src/lib/zone.js, src/lib/paymentProvider.js, src/lib/onlineCheckout.js, src/lib/fulfillment.js. Lossy compression there can drop a D()/toCents()/cmp() call site or a sibling call path and reintroduce float drift or an auth/zone gap. Fidelity beats tokens on these paths.",
  "- Superpowers (spec/plan/TDD methodology plugin), if installed: mirror image of the headroom rule — ON (use its spec-plan-review-TDD workflow) only for money/payment/auth/zone code, the same file set as the headroom restriction above. Everywhere else, default to this repo's lazy-senior-dev mode (AGENTS.md): shortest working diff, stop at the first rung that holds, no unrequested spec/plan ceremony for routine fixes.",
  "Read AGENTS.md for the full stack, auth, payments, zones, and workflow rules.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx },
  })
);
