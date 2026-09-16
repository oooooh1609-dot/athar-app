/** Browser calls for entering Athar with an administrator-issued code. */

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export const checkAccess = () =>
  post<{ ok: boolean; signedIn: boolean; label: string | null }>({ action: "me" });

export const enterCode = (code: string) =>
  post<{ ok: boolean; label?: string | null; error?: string }>({ action: "enter", code });

export const leaveAccess = () => post<{ ok: boolean }>({ action: "leave" });
