/**
 * Administrator side of invitation-only access.
 *
 * Invitations are created only here. Delivery uses the backend auth invitation
 * email; the stored record keeps the email, a 48-hour expiry and single-use
 * state — never a token or a link. An invitation is only reported as sent when
 * delivery actually succeeded.
 */

import { audit } from "@/lib/access.server";

const INVITE_HOURS = 48;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type InvitationRow = {
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

/** Marks overdue invitations expired so the lists stay truthful. */
async function expireOverdue() {
  const db = await admin();
  await db
    .from("invitations")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

export async function listAccess(origin: string) {
  await expireOverdue();
  const db = await admin();
  const [invites, users, log] = await Promise.all([
    db.from("invitations").select("*").order("created_at", { ascending: false }).limit(100),
    db
      .from("profiles")
      .select("id, email, display_name, status, status_note, approved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("access_audit")
      .select("action, actor, subject_email, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  return {
    invitations: (invites.data ?? []) as InvitationRow[],
    users: users.data ?? [],
    audit: log.data ?? [],
    inviteRedirect: `${origin}/auth`,
  };
}

/**
 * Sends one invitation. Returns `delivered: false` with the provider's own
 * message when the email could not be handed over — the caller must not claim
 * an invitation was sent in that case.
 */
export async function sendInvitation(email: string, origin: string) {
  const db = await admin();
  const clean = email.trim().toLowerCase();
  await expireOverdue();

  const existingUser = await db
    .from("profiles")
    .select("id, status")
    .eq("email", clean)
    .maybeSingle();
  if (existingUser.data) return { ok: false as const, error: "That email already has an account." };

  const open = await db
    .from("invitations")
    .select("id")
    .eq("status", "pending")
    .ilike("email", clean)
    .maybeSingle();
  if (open.data)
    return { ok: false as const, error: "An invitation for that email is still open." };

  const invite = await db.auth.admin.inviteUserByEmail(clean, {
    redirectTo: `${origin}/auth`,
  });

  const expires = new Date(Date.now() + INVITE_HOURS * 3600_000).toISOString();
  if (invite.error) {
    await db.from("invitations").insert({
      email: clean,
      status: "failed",
      expires_at: expires,
      delivery: "failed",
      note: invite.error.message.slice(0, 300),
    });
    await audit({
      action: "invitation_failed",
      subjectEmail: clean,
      detail: invite.error.message.slice(0, 300),
    });
    return { ok: false as const, error: `Email delivery failed: ${invite.error.message}` };
  }

  const row = await db
    .from("invitations")
    .insert({ email: clean, status: "pending", expires_at: expires, delivery: "sent" })
    .select("id")
    .single();
  await audit({
    action: "invitation_sent",
    subjectEmail: clean,
    subjectUser: invite.data.user?.id ?? null,
    detail: `expires ${expires}`,
  });
  return { ok: true as const, id: row.data?.id ?? null, expiresAt: expires };
}

/** Cancels an open invitation and removes the not-yet-used account behind it. */
export async function cancelInvitation(id: string) {
  const db = await admin();
  const inv = await db.from("invitations").select("*").eq("id", id).maybeSingle();
  if (!inv.data) return { ok: false as const, error: "Invitation not found." };
  if (inv.data.status !== "pending")
    return { ok: false as const, error: "Only an open invitation can be cancelled." };

  const prof = await db
    .from("profiles")
    .select("id, status")
    .eq("email", inv.data.email)
    .maybeSingle();
  if (prof.data && prof.data.status === "pending") {
    // The invited person never set a password, so the account is removed and
    // the emailed link stops working immediately.
    await db.auth.admin.deleteUser(prof.data.id).catch(() => undefined);
  }
  await db
    .from("invitations")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  await audit({ action: "invitation_cancelled", subjectEmail: inv.data.email });
  return { ok: true as const };
}

/** Records that the invited person set their own password. */
export async function markInvitationAccepted(email: string, userId: string) {
  const db = await admin();
  const clean = email.trim().toLowerCase();
  const inv = await db
    .from("invitations")
    .select("id, status, expires_at")
    .ilike("email", clean)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!inv.data) return { ok: true as const, note: "No invitation record found." };
  if (inv.data.status === "cancelled")
    return { ok: false as const, error: "That invitation was cancelled." };
  if (inv.data.status === "pending" && new Date(inv.data.expires_at).getTime() < Date.now()) {
    await db.from("invitations").update({ status: "expired" }).eq("id", inv.data.id);
    return { ok: false as const, error: "That invitation has expired." };
  }
  if (inv.data.status === "pending") {
    await db
      .from("invitations")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", inv.data.id);
    await audit({ action: "invitation_accepted", subjectEmail: clean, subjectUser: userId });
  }
  return { ok: true as const };
}

const DECISIONS = {
  approve: { status: "approved", action: "access_approved" },
  reject: { status: "revoked", action: "access_rejected" },
  suspend: { status: "suspended", action: "access_suspended" },
  restore: { status: "approved", action: "access_restored" },
  revoke: { status: "revoked", action: "access_revoked" },
} as const;

export type Decision = keyof typeof DECISIONS;

/**
 * Applies an administrator decision. Suspension and revocation also end the
 * person's current sessions, so access stops at once rather than at expiry.
 */
export async function decideAccess(userId: string, decision: Decision, note?: string) {
  const db = await admin();
  const target = DECISIONS[decision];
  const prof = await db.from("profiles").select("email, status").eq("id", userId).maybeSingle();
  if (!prof.data) return { ok: false as const, error: "User not found." };

  const res = await db
    .from("profiles")
    .update({
      status: target.status,
      status_note: note ?? null,
      approved_at: target.status === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", userId);
  if (res.error) return { ok: false as const, error: res.error.message };

  // Suspended and revoked accounts are banned in the auth service, which
  // invalidates their existing tokens; every request also re-reads the status
  // from the database, so access stops at once either way.
  await db.auth.admin
    .updateUserById(userId, {
      ban_duration: target.status === "approved" ? "none" : "876000h",
    })
    .catch(() => undefined);
  await audit({
    action: target.action,
    subjectEmail: prof.data.email,
    subjectUser: userId,
    detail: note ?? null,
  });
  return { ok: true as const };
}

/* ————————————————— access codes ————————————————— */

import type { AccessCodeRow } from "@/lib/access.server";

/** Unambiguous alphabet: no O/0, I/1, so a code is easy to read out loud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export async function listAccessCodes() {
  const db = await admin();
  const res = await db
    .from("access_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (res.data ?? []) as AccessCodeRow[];
}

/**
 * Creates one browsing code. `maxUses` of 0 means unlimited; `days` of 0 means
 * it never expires. The code is shown to the administrator so it can be passed
 * on; it is never emailed from here.
 */
export async function createAccessCode(input: {
  label?: string | undefined;
  maxUses: number;
  days: number;
}) {
  const db = await admin();
  const code = newCode();
  const expires =
    input.days > 0 ? new Date(Date.now() + input.days * 24 * 60 * 60 * 1000).toISOString() : null;
  const res = await db
    .from("access_codes")
    .insert({
      code,
      label: input.label?.trim() || null,
      max_uses: Math.max(0, Math.floor(input.maxUses)),
      expires_at: expires,
    })
    .select("*")
    .single();
  if (res.error) return { ok: false as const, error: res.error.message };
  await audit({
    action: "access_code_created",
    subjectEmail: input.label?.trim() || null,
    detail: `${input.maxUses === 0 ? "unlimited uses" : `${input.maxUses} use(s)`}, ${
      expires ? `expires ${expires}` : "no expiry"
    }`,
  });
  return { ok: true as const, row: res.data as AccessCodeRow };
}

/** Revokes a code. Everyone who entered it loses access on the next request. */
export async function revokeAccessCode(id: string) {
  const db = await admin();
  const res = await db
    .from("access_codes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("label")
    .maybeSingle();
  if (res.error) return { ok: false as const, error: res.error.message };
  await audit({ action: "access_code_revoked", subjectEmail: res.data?.label ?? null });
  return { ok: true as const };
}
