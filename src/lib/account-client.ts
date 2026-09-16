/** Browser-side sign-in, invitation acceptance and access status. */

import { supabase } from "@/integrations/supabase/client";

export type AccountStatus = "pending" | "approved" | "suspended" | "revoked";

export type AccountView = {
  email: string;
  displayName: string | null;
  status: AccountStatus;
  emailVerified: boolean;
};

async function call(action: "me" | "accept") {
  const res = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return (await res.json()) as { ok: boolean; error?: string; account?: AccountView };
}

export const loadAccount = () => call("me");

/** Called right after an invited person sets their own password. */
export const confirmInvitation = () => call("accept");

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true as const };
  const banned = /banned|blocked/i.test(error.message);
  return {
    ok: false as const,
    error: banned ? "Your access to Athar has been withdrawn by the administrator." : error.message,
  };
}

/** Sets the password for the account behind an invitation link. */
export async function setOwnPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false as const, error: error.message };
  const accepted = await confirmInvitation();
  if (!accepted.ok) return { ok: false as const, error: accepted.error ?? "Invitation invalid." };
  return { ok: true as const, account: accepted.account };
}

export async function signOut() {
  await supabase.auth.signOut();
}
