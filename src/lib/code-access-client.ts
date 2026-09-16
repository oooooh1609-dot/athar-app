import { validateAccessCode } from "./hybrid-access";

/** Browser calls for entering Athar with an administrator-issued code. */

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export const checkAccess = async () => {
  if (typeof window !== "undefined") {
    const admitted = localStorage.getItem("athar_local_admitted");
    if (admitted) {
      try {
        const parsed = JSON.parse(admitted) as { code?: string; label?: string };
        return { ok: true, signedIn: true, label: parsed.label ?? "ممارس ميداني" };
      } catch {
        // continue
      }
    }
  }
  return post<{ ok: boolean; signedIn: boolean; label: string | null }>({ action: "me" });
};

export const enterCode = async (code: string) => {
  const clean = code.trim().toUpperCase();
  const isValid = await validateAccessCode(clean);
  if (isValid) {
    if (typeof window !== "undefined") {
      try {
        const stored = JSON.parse(localStorage.getItem("athar_access_codes") || "[]") as Array<{
          code?: string;
          recipient?: string;
        }>;
        const match = stored.find((c) => c.code?.toUpperCase() === clean);
        localStorage.setItem(
          "athar_local_admitted",
          JSON.stringify({ code: clean, label: match?.recipient || "ممارس ميداني" }),
        );
      } catch {
        // continue
      }
    }
    void post({ action: "enter", code: clean }).catch(() => null);
    return { ok: true, label: "ممارس ميداني" };
  }
  return post<{ ok: boolean; label?: string | null; error?: string }>({
    action: "enter",
    code: clean,
  });
};

export const leaveAccess = async () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("athar_local_admitted");
  }
  return post<{ ok: boolean }>({ action: "leave" });
};
