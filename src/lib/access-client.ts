/** Browser calls for the administrator's Access Management page. */

export type Invitation = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  delivery: string;
  note: string | null;
  created_at: string;
};

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  status: "pending" | "approved" | "suspended" | "revoked";
  status_note: string | null;
  approved_at: string | null;
  created_at: string;
};

export type AuditRow = {
  action: string;
  actor: string;
  subject_email: string | null;
  detail: string | null;
  created_at: string;
};

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/admin/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export type AccessCode = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export const loadAccess = () =>
  post<{
    ok: boolean;
    codes?: AccessCode[];
    invitations?: Invitation[];
    users?: UserRow[];
    audit?: AuditRow[];
    error?: string;
  }>({ action: "list" });

export const inviteUser = (email: string) =>
  post<{ ok: boolean; expiresAt?: string; error?: string }>({ action: "invite", email });

export const cancelInvite = (id: string) =>
  post<{ ok: boolean; error?: string }>({ action: "cancel", id });

export const decide = (
  userId: string,
  decision: "approve" | "reject" | "suspend" | "restore" | "revoke",
  note?: string,
) => post<{ ok: boolean; error?: string }>({ action: "decide", userId, decision, note });

export const createCode = (label: string, maxUses: number, days: number) =>
  post<{ ok: boolean; row?: AccessCode; error?: string }>({
    action: "newCode",
    label,
    maxUses,
    days,
  });

export const revokeCode = (id: string) =>
  post<{ ok: boolean; error?: string }>({ action: "revokeCode", id });
