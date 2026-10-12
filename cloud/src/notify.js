// Emails the moderator when new posts are waiting in /admin.
//
// A cron trigger runs checkPending every 15 minutes. It sends one email when
// posts have arrived since the last email, and never more than one per
// NOTIFY_EVERY_MINUTES, so a flood of posts becomes a single note.
//
// Needs the NOTIFY send_email binding, a NOTIFY_TO secret holding an address
// verified in Cloudflare Email Routing, and NOTIFY_FROM on the wall's domain.
// Without them it does nothing.

import { EmailMessage } from "cloudflare:email";

export function pendingEmail({ from, to, fresh, waiting, adminUrl, now = Date.now() }) {
  const subject = fresh === 1 ? "1 new post waiting on the wall" : `${fresh} new posts waiting on the wall`;
  const body = [
    fresh === 1 ? "A new post is waiting for approval." : `${fresh} new posts are waiting for approval.`,
    `${waiting} waiting in total.`,
    "",
    `Review them at ${adminUrl}`,
    "",
  ].join("\r\n");
  const domain = from.split("@")[1] || "localhost";
  return [
    `From: Slop Stamp <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
}

export async function checkPending(env, now = Date.now()) {
  if (!env.NOTIFY || !env.NOTIFY_TO || !env.NOTIFY_FROM) return;

  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'notified_at'").first();
  const lastSent = Number(row?.value) || 0;
  const gap = Math.max(1, Number(env.NOTIFY_EVERY_MINUTES) || 60) * 60_000;
  if (now - lastSent < gap) return;

  const counts = await env.DB.prepare(
    "SELECT SUM(posted_at > ?) AS fresh, COUNT(*) AS waiting FROM stamps WHERE status = 'pending'"
  )
    .bind(lastSent)
    .first();
  const fresh = counts?.fresh || 0;
  if (!fresh) return;

  const origin = env.SITE_ORIGIN || "https://slopstamp.xyz";
  const raw = pendingEmail({
    from: env.NOTIFY_FROM,
    to: env.NOTIFY_TO,
    fresh,
    waiting: counts.waiting,
    adminUrl: `${origin}/admin`,
    now,
  });
  await env.NOTIFY.send(new EmailMessage(env.NOTIFY_FROM, env.NOTIFY_TO, raw));
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('notified_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(String(now))
    .run();
}
