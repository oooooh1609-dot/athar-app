/**
 * Messages & feedback: contact the administrator, report a problem, suggest an
 * improvement.
 *
 * Conversations are private to their owner and the administrator. Suggestions
 * are stored for human review only — nothing here changes application code or
 * trains any model.
 */

import type { Account } from "@/lib/access.server";

const BUCKET = "feedback-screenshots";
const MAX_PER_HOUR = 8;
const STATUSES = ["new", "in_review", "planned", "resolved", "closed"] as const;
export type FeedbackStatus = (typeof STATUSES)[number];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Server-side submission rate limit, counted from stored rows. */
async function overLimit(userId: string) {
  const db = await admin();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const res = await db
    .from("feedback_messages")
    .select("id, feedback_threads!inner(user_id)", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("feedback_threads.user_id", userId);
  return (res.count ?? 0) >= MAX_PER_HOUR;
}

async function storeScreenshot(threadId: string, dataUrl: string) {
  const match = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[3]!), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 5 * 1024 * 1024) return null;
  const ext = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  const path = `${threadId}/${crypto.randomUUID()}.${ext}`;
  const db = await admin();
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: match[1]! });
  return up.error ? null : path;
}

/** Signed link for a stored screenshot; expires so it cannot be shared widely. */
export async function screenshotUrl(path: string | null) {
  if (!path) return null;
  const db = await admin();
  const res = await db.storage.from(BUCKET).createSignedUrl(path, 600);
  return res.data?.signedUrl ?? null;
}

export async function createThread(
  account: Account,
  input: {
    category: "contact_admin" | "problem" | "improvement";
    subject: string;
    message: string;
    screenshot?: string | undefined;
  },
) {
  // People awaiting approval may only use the contact form.
  if (account.status !== "approved" && input.category !== "contact_admin")
    return { ok: false as const, error: "Only the contact form is available before approval." };
  if (await overLimit(account.userId))
    return { ok: false as const, error: "Too many messages in the last hour. Try again later." };

  const db = await admin();
  const thread = await db
    .from("feedback_threads")
    .insert({
      user_id: account.userId,
      email: account.email,
      category: input.category,
      subject: input.subject.slice(0, 160),
      status: "new",
    })
    .select("id")
    .single();
  if (thread.error || !thread.data)
    return { ok: false as const, error: thread.error?.message ?? "Could not save the message." };

  const path = input.screenshot ? await storeScreenshot(thread.data.id, input.screenshot) : null;
  const msg = await db.from("feedback_messages").insert({
    thread_id: thread.data.id,
    sender: "user",
    body: input.message.slice(0, 4000),
    screenshot_path: path,
  });
  if (msg.error) {
    await db.from("feedback_threads").delete().eq("id", thread.data.id);
    return { ok: false as const, error: msg.error.message };
  }
  await db.from("feedback_status_history").insert({
    thread_id: thread.data.id,
    to_status: "new",
    note: "Submitted",
  });
  return {
    ok: true as const,
    id: thread.data.id,
    screenshotStored: Boolean(path),
    screenshotSkipped: Boolean(input.screenshot) && !path,
  };
}

export async function userReply(account: Account, threadId: string, body: string) {
  const db = await admin();
  const own = await db
    .from("feedback_threads")
    .select("id, status")
    .eq("id", threadId)
    .eq("user_id", account.userId)
    .maybeSingle();
  if (!own.data) return { ok: false as const, error: "Conversation not found." };
  if (own.data.status === "closed")
    return { ok: false as const, error: "This conversation is closed." };
  if (await overLimit(account.userId))
    return { ok: false as const, error: "Too many messages in the last hour. Try again later." };

  const res = await db
    .from("feedback_messages")
    .insert({ thread_id: threadId, sender: "user", body: body.slice(0, 4000) });
  if (res.error) return { ok: false as const, error: res.error.message };
  await db
    .from("feedback_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);
  return { ok: true as const };
}

export async function listMine(account: Account) {
  const db = await admin();
  const threads = await db
    .from("feedback_threads")
    .select(
      "id, category, subject, status, created_at, updated_at, last_admin_reply_at, user_seen_at",
    )
    .eq("user_id", account.userId)
    .order("updated_at", { ascending: false })
    .limit(80);
  const items = threads.data ?? [];
  const unread = items.filter(
    (t) =>
      t.last_admin_reply_at &&
      (!t.user_seen_at || new Date(t.user_seen_at) < new Date(t.last_admin_reply_at)),
  ).length;
  return { threads: items, unread };
}

export async function threadDetail(threadId: string, account: Account | null) {
  const db = await admin();
  let q = db.from("feedback_threads").select("*").eq("id", threadId);
  if (account) q = q.eq("user_id", account.userId);
  const thread = await q.maybeSingle();
  if (!thread.data) return null;

  const [messages, history] = await Promise.all([
    db
      .from("feedback_messages")
      .select("id, sender, body, screenshot_path, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    db
      .from("feedback_status_history")
      .select("from_status, to_status, note, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
  ]);

  const withUrls = await Promise.all(
    (messages.data ?? []).map(async (m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.created_at,
      screenshotUrl: await screenshotUrl(m.screenshot_path),
    })),
  );

  if (account) {
    await db
      .from("feedback_threads")
      .update({ user_seen_at: new Date().toISOString() })
      .eq("id", threadId);
  }
  return { thread: thread.data, messages: withUrls, history: history.data ?? [] };
}

/* ————————————————— administrator inbox ————————————————— */

export async function inbox(status?: string) {
  const db = await admin();
  let q = db
    .from("feedback_threads")
    .select("id, email, category, subject, status, created_at, updated_at, last_admin_reply_at")
    .order("updated_at", { ascending: false })
    .limit(120);
  if (status) q = q.eq("status", status);
  const res = await q;
  const counts = await db.from("feedback_threads").select("status");
  const tally: Record<string, number> = {};
  for (const r of counts.data ?? []) tally[r.status] = (tally[r.status] ?? 0) + 1;
  return { threads: res.data ?? [], counts: tally };
}

export async function adminReply(threadId: string, body: string) {
  const db = await admin();
  const res = await db
    .from("feedback_messages")
    .insert({ thread_id: threadId, sender: "admin", body: body.slice(0, 4000) });
  if (res.error) return { ok: false as const, error: res.error.message };
  await db
    .from("feedback_threads")
    .update({ last_admin_reply_at: new Date().toISOString() })
    .eq("id", threadId);
  return { ok: true as const };
}

export async function setStatus(threadId: string, next: FeedbackStatus, note?: string) {
  if (!STATUSES.includes(next)) return { ok: false as const, error: "Unknown status." };
  const db = await admin();
  const cur = await db.from("feedback_threads").select("status").eq("id", threadId).maybeSingle();
  if (!cur.data) return { ok: false as const, error: "Conversation not found." };
  const res = await db.from("feedback_threads").update({ status: next }).eq("id", threadId);
  if (res.error) return { ok: false as const, error: res.error.message };
  await db.from("feedback_status_history").insert({
    thread_id: threadId,
    from_status: cur.data.status,
    to_status: next,
    note: note ?? null,
  });
  return { ok: true as const };
}
