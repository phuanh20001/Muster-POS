const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const agentsPath = path.join(root, "AGENTS.md");
const claudePath = path.join(root, "CLAUDE.md");
const cursorRulePath = path.join(root, ".cursor", "rules", "dreamycafe.mdc");

// CLAUDE.md is a thin pointer: Claude Code auto-reads AGENTS.md via it.
const claudeExpected = [
  "# DreamyCafe — Agent Rules",
  "",
  "> **Canonical instructions:** [AGENTS.md](AGENTS.md)",
  "> This file exists for tools that load `CLAUDE.md` by convention (e.g. Claude Code).",
  "> Keep this file in sync by running `npm run claude:sync` (or validate with `npm run claude:check`).",
  "",
  "Open **AGENTS.md** for the full project rules, stack, auth, payments, deployment, and workflow guidance.",
  "",
  "For Stripe payment work, also see `skills/stripe-best-practices/SKILL.md`.",
  "For Square payment work, also see `skills/square-best-practices/SKILL.md`.",
  "",
].join("\n");

// Cursor's always-on rule needs the full guidance inline (it doesn't auto-open
// AGENTS.md like Claude Code does), so we regenerate it = frontmatter + the
// verbatim AGENTS.md body. This keeps a single canonical source (AGENTS.md)
// while giving Cursor complete rules with zero drift.
const cursorFrontmatter = [
  "---",
  "description: DreamyCafe POS — stack, conventions, auth, payments, and Cursor agent workflow",
  "alwaysApply: true",
  "---",
  "",
  "<!-- GENERATED FROM AGENTS.md by scripts/sync-claude-md.js — do not edit by hand. Run: npm run claude:sync -->",
  "",
  "",
].join("\n");

function cursorExpected() {
  const agents = fs.readFileSync(agentsPath, "utf8");
  return cursorFrontmatter + agents;
}

const checkMode = process.argv.includes("--check");

const targets = [
  { name: "CLAUDE.md", filePath: claudePath, expected: claudeExpected },
  { name: ".cursor/rules/dreamycafe.mdc", filePath: cursorRulePath, expected: cursorExpected() },
];

let outOfSync = false;
let wrote = false;

for (const t of targets) {
  const current = fs.existsSync(t.filePath) ? fs.readFileSync(t.filePath, "utf8") : "";
  if (current === t.expected) {
    console.log(`${t.name} ${checkMode ? "is in sync." : "already in sync."}`);
    continue;
  }
  if (checkMode) {
    console.error(`${t.name} is out of sync. Run: npm run claude:sync`);
    outOfSync = true;
    continue;
  }
  fs.mkdirSync(path.dirname(t.filePath), { recursive: true });
  fs.writeFileSync(t.filePath, t.expected, "utf8");
  console.log(`${t.name} synced.`);
  wrote = true;
}

if (checkMode && outOfSync) process.exit(1);
if (!checkMode && !wrote) process.exit(0);
