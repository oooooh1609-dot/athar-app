/**
 * Administrator-only Access Management.
 *
 * Invitations, pending approvals, active users and the decision log. Every
 * action here is checked again on the server before it takes effect.
 */

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Sparkles, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createAccessCode } from "@/lib/hybrid-access";

import {
  cancelInvite,
  createCode,
  decide,
  inviteUser,
  loadAccess,
  revokeCode,
  type AccessCode,
  type AuditRow,
  type Invitation,
  type UserRow,
} from "@/lib/access-client";

export type LocalAccessCode = {
  id: string;
  code: string;
  recipient: string;
  uses: number;
  days: number;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending approval",
  approved: "Active",
  suspended: "Suspended",
  revoked: "Access revoked",
};

export function AccessManagement() {
  const [recipientInput, setRecipientInput] = useState("");
  const [usesCount, setUsesCount] = useState(1);
  const [daysCount, setDaysCount] = useState(30);
  const [accessCodes, setAccessCodes] = useState<LocalAccessCode[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("athar_access_codes");
      if (stored) {
        setAccessCodes(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [codeLabel, setCodeLabel] = useState("");
  const [codeUses, setCodeUses] = useState(1);
  const [codeDays, setCodeDays] = useState(30);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // دالة توليد المفاتيح الميدانية (هجين: سحابياً إن كان متصلاً أو محلياً)
  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await createAccessCode({
      recipient: recipientInput,
      uses: usesCount,
      days: daysCount,
    });

    const updated = JSON.parse(localStorage.getItem("athar_access_codes") || "[]");
    setAccessCodes(updated);

    if (res.mode === "cloud") {
      toast.success(`تم إنشاء المفتاح سحابياً بنجاح: ${res.code}`);
    } else {
      toast.success(`تم إنشاء المفتاح بنجاح: ${res.code}`);
    }
    setRecipientInput("");
  };

  const handleDeleteLocalCode = (id: string) => {
    const updated = accessCodes.filter((c) => c.id !== id);
    localStorage.setItem("athar_access_codes", JSON.stringify(updated));
    setAccessCodes(updated);
    toast.success("تم حذف المفتاح بنجاح");
  };

  const load = useCallback(async () => {
    const res = await loadAccess();
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Could not load access data.");
      return;
    }
    setInvitations(res.invitations ?? []);
    setUsers(res.users ?? []);
    setAudit(res.audit ?? []);
    setCodes(res.codes ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Request failed.");
    else setNotice(done);
    await load();
  };

  const pending = users.filter((u) => u.status === "pending");
  const active = users.filter((u) => u.status === "approved");
  const stopped = users.filter((u) => u.status === "suspended" || u.status === "revoked");

  return (
    <section className="grid gap-4">
      <div className="panel p-4">
        <h2 className="text-lg font-bold">Access Management</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Athar is invitation-only. There is no public sign-up: you invite a person by email, they
          confirm the email and choose a password, then you approve their access.
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            const target = email.trim();
            void act(async () => {
              const res = await inviteUser(target);
              if (res.ok) setEmail("");
              return res;
            }, `Invitation email sent to ${target}. It can be used once and expires in 48 hours.`);
          }}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address to invite"
            className="min-h-11 rounded-lg border border-input bg-background px-3"
          />
          <button
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
          >
            <UserPlus className="size-4" /> Send Invitation
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {notice && <p className="mt-2 text-sm font-semibold text-primary">{notice}</p>}
      </div>

      {loading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}

      <div className="panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-amber-500">
              <Sparkles className="size-4" /> المفاتيح الميدانية السريعة (توليد محلي فوري)
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              توليد مفاتيح بصيغة ATHAR-XXXX محلياً بدون الحاجة لتسجيل دخول أو الاتصال بالخادم، وتعمل
              فوراً للممارسين الميدانيين.
            </p>
          </div>
        </div>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          onSubmit={handleCreateCode}
        >
          <input
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="اسم المستلم / الممارس الميداني (اختياري)"
            className="min-h-11 rounded-lg border border-input bg-background px-3"
          />
          <label className="grid text-xs text-muted-foreground">
            مرات الاستخدام
            <input
              type="number"
              min={1}
              max={500}
              value={usesCount}
              onChange={(e) => setUsesCount(Number(e.target.value))}
              className="min-h-11 w-24 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid text-xs text-muted-foreground">
            الصلاحية (أيام)
            <input
              type="number"
              min={1}
              max={365}
              value={daysCount}
              onChange={(e) => setDaysCount(Number(e.target.value))}
              className="min-h-11 w-24 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <button
            type="submit"
            className="flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-amber-600 px-4 font-semibold text-white hover:bg-amber-700"
          >
            <KeyRound className="size-4" /> توليد المفتاح
          </button>
        </form>
        <div className="mt-3 grid gap-2">
          {accessCodes.length === 0 && <Empty>لا توجد مفاتيح ميدانية محلية بعد.</Empty>}
          {accessCodes.map((c) => (
            <Row
              key={c.id}
              title={c.code}
              sub={`${c.recipient} · ${c.uses} استخدام · ${c.days} يوم · أُنشئ ${new Date(c.created_at).toLocaleDateString()}`}
            >
              <Action
                onClick={() => {
                  void navigator.clipboard?.writeText(c.code);
                  toast.success(`تم نسخ المفتاح: ${c.code}`);
                }}
              >
                نسخ
              </Action>
              <Action tone="danger" onClick={() => handleDeleteLocalCode(c.id)}>
                حذف
              </Action>
            </Row>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <h3 className="font-bold">Access Codes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a code and give it to the person yourself. They type it once to open Athar. Revoke
          a code and everyone using it loses access immediately.
        </p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              setError(null);
              setNotice(null);
              const res = await createCode(codeLabel.trim(), codeUses, codeDays);
              setBusy(false);
              if (!res.ok) setError(res.error ?? "Could not create the code.");
              else {
                setCodeLabel("");
                setNotice(`New access code: ${res.row?.code} — give this to the person.`);
              }
              await load();
            })();
          }}
        >
          <input
            value={codeLabel}
            onChange={(e) => setCodeLabel(e.target.value)}
            placeholder="Who is this code for? (optional)"
            className="min-h-11 rounded-lg border border-input bg-background px-3"
          />
          <label className="grid text-xs text-muted-foreground">
            Uses (0 = unlimited)
            <input
              type="number"
              min={0}
              max={500}
              value={codeUses}
              onChange={(e) => setCodeUses(Number(e.target.value))}
              className="min-h-11 w-24 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <label className="grid text-xs text-muted-foreground">
            Days (0 = never)
            <input
              type="number"
              min={0}
              max={365}
              value={codeDays}
              onChange={(e) => setCodeDays(Number(e.target.value))}
              className="min-h-11 w-24 rounded-lg border border-input bg-background px-3"
            />
          </label>
          <button
            disabled={busy}
            className="flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
          >
            <KeyRound className="size-4" /> Create Code
          </button>
        </form>
        <div className="mt-3 grid gap-2">
          {codes.length === 0 && <Empty>No access codes yet.</Empty>}
          {codes.map((c) => {
            const expired =
              Boolean(c.expires_at) && new Date(c.expires_at as string).getTime() < Date.now();
            const spent = c.max_uses > 0 && c.uses >= c.max_uses;
            const state = c.revoked_at
              ? "revoked"
              : expired
                ? "expired"
                : spent
                  ? "used up"
                  : "active";
            return (
              <Row
                key={c.id}
                title={c.code}
                sub={`${c.label ?? "no label"} · ${state} · ${c.uses}/${
                  c.max_uses === 0 ? "∞" : c.max_uses
                } uses${c.expires_at ? ` · expires ${new Date(c.expires_at).toLocaleDateString()}` : ""}`}
              >
                <Action onClick={() => void navigator.clipboard?.writeText(c.code)}>Copy</Action>
                {!c.revoked_at && (
                  <Action
                    tone="danger"
                    onClick={() => void act(() => revokeCode(c.id), "Code revoked.")}
                  >
                    Revoke
                  </Action>
                )}
              </Row>
            );
          })}
        </div>
      </div>

      <Group title={`Pending Approvals (${pending.length})`}>
        {pending.length === 0 && <Empty>Nobody is waiting for approval.</Empty>}
        {pending.map((u) => (
          <Row key={u.id} title={u.email} sub={`Joined ${new Date(u.created_at).toLocaleString()}`}>
            <Action onClick={() => void act(() => decide(u.id, "approve"), "Access approved.")}>
              Approve
            </Action>
            <Action
              tone="danger"
              onClick={() => void act(() => decide(u.id, "reject"), "Request rejected.")}
            >
              Reject
            </Action>
          </Row>
        ))}
      </Group>

      <Group title={`Active Users (${active.length})`}>
        {active.length === 0 && <Empty>No approved users yet.</Empty>}
        {active.map((u) => (
          <Row
            key={u.id}
            title={u.email}
            sub={u.approved_at ? `Approved ${new Date(u.approved_at).toLocaleDateString()}` : ""}
          >
            <Action onClick={() => void act(() => decide(u.id, "suspend"), "Access suspended.")}>
              Suspend
            </Action>
            <Action
              tone="danger"
              onClick={() => void act(() => decide(u.id, "revoke"), "Access revoked.")}
            >
              Revoke Access
            </Action>
          </Row>
        ))}
      </Group>

      {stopped.length > 0 && (
        <Group title="Suspended & revoked">
          {stopped.map((u) => (
            <Row key={u.id} title={u.email} sub={STATUS_LABEL[u.status] ?? u.status}>
              <Action onClick={() => void act(() => decide(u.id, "restore"), "Access restored.")}>
                Restore
              </Action>
            </Row>
          ))}
        </Group>
      )}

      <Group title="Invitations">
        {invitations.length === 0 && <Empty>No invitations sent yet.</Empty>}
        {invitations.map((i) => (
          <Row
            key={i.id}
            title={i.email}
            sub={`${i.status}${i.status === "pending" ? ` · expires ${new Date(i.expires_at).toLocaleString()}` : ""}${
              i.note ? ` · ${i.note}` : ""
            }`}
          >
            {i.status === "pending" && (
              <Action
                tone="danger"
                onClick={() => void act(() => cancelInvite(i.id), "Invitation cancelled.")}
              >
                Cancel Invitation
              </Action>
            )}
          </Row>
        ))}
      </Group>

      <Group title="Decision log">
        {audit.length === 0 && <Empty>No decisions recorded yet.</Empty>}
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {audit.map((a, idx) => (
            <li key={idx}>
              {new Date(a.created_at).toLocaleString()} — {a.action.replaceAll("_", " ")}
              {a.subject_email ? ` · ${a.subject_email}` : ""}
              {a.detail ? ` · ${a.detail}` : ""}
            </li>
          ))}
        </ul>
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <h3 className="font-bold">{title}</h3>
      <div className="mt-2 grid gap-2">{children}</div>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

function Row({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Action({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
        tone === "danger"
          ? "border border-destructive/50 text-destructive"
          : "bg-primary text-primary-foreground"
      }`}
    >
      {children}
    </button>
  );
}
