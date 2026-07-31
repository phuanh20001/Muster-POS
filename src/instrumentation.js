// Runs once at server startup, before any request is handled. Used to pin the
// process timezone on hosts that force UTC (Vercel/AWS Lambda), where the
// reserved `TZ` env var can't be set in the dashboard.
//
// Day-boundary logic in the app (report ranges, cash sessions, "clocked in
// today", reservation days) is computed in the *server's* local timezone; on a
// UTC host that disagrees with the shop's calendar day. Setting process.env.TZ
// before the app boots makes new Date()/setHours()/getHours() reason in the
// shop timezone. On the LAN deployment APP_TZ is unset and the OS local time is
// already correct, so this is a no-op there.
export function register() {
  const tz = process.env.APP_TZ
  if (tz) process.env.TZ = tz
}
