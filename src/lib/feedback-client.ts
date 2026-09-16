/** Browser calls for Contact & Feedback and the administrator inbox. */

export type FeedbackCategory = "contact_admin" | "problem" | "improvement";
export type FeedbackStatus = "new" | "in_review" | "planned" | "resolved" | "closed";

export type ThreadSummary = {
  id: string;
  email?: string;
  category: FeedbackCategory;
  subject: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
  last_admin_reply_at: string | null;
  user_seen_at?: string | null;
};

export type ThreadMessage = {
  id: string;
  sender: "user" | "admin";
  body: string;
  createdAt: string;
  screenshotUrl: string | null;
};

export type StatusEvent = {
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export const myThreads = () =>
  post<{ ok: boolean; threads?: ThreadSummary[]; unread?: number; error?: string }>(
    "/api/feedback",
    { action: "list" },
  );

export const submitFeedback = (input: {
  category: FeedbackCategory;
  subject: string;
  message: string;
  screenshot?: string;
}) =>
  post<{ ok: boolean; id?: string; screenshotSkipped?: boolean; error?: string }>("/api/feedback", {
    action: "create",
    ...input,
  });

export const myThread = (id: string) =>
  post<{
    ok: boolean;
    thread?: ThreadSummary;
    messages?: ThreadMessage[];
    history?: StatusEvent[];
    error?: string;
  }>("/api/feedback", { action: "thread", id });

export const replyToThread = (id: string, message: string) =>
  post<{ ok: boolean; error?: string }>("/api/feedback", { action: "reply", id, message });

/* administrator */

export const adminInbox = (status?: FeedbackStatus) =>
  post<{
    ok: boolean;
    threads?: ThreadSummary[];
    counts?: Record<string, number>;
    error?: string;
  }>("/api/admin/feedback", { action: "list", status });

export const adminThread = (id: string) =>
  post<{
    ok: boolean;
    thread?: ThreadSummary;
    messages?: ThreadMessage[];
    history?: StatusEvent[];
    error?: string;
  }>("/api/admin/feedback", { action: "thread", id });

export const adminReply = (id: string, message: string) =>
  post<{ ok: boolean; error?: string }>("/api/admin/feedback", { action: "reply", id, message });

export const adminSetStatus = (id: string, status: FeedbackStatus, note?: string) =>
  post<{ ok: boolean; error?: string }>("/api/admin/feedback", {
    action: "status",
    id,
    status,
    note,
  });
