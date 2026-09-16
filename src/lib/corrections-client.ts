/** Browser calls for shared reading corrections. */

export type SharedCorrectionView = {
  id: string;
  script: string;
  machineReading: string | null;
  correctedReading: string;
  word: string | null;
  meaningAr: string | null;
  reason: string | null;
  siglum: string | null;
  sourceNote: string | null;
  createdAt: string;
  permissionNote?: string | null;
  reviewStatus?: string;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export function shareCorrection(input: {
  script: string;
  machineReading?: string | undefined;
  correctedReading: string;
  reason?: string | undefined;
  siglum?: string | undefined;
  sourceNote?: string | undefined;
  permissionNote?: string | undefined;
  word?: string | undefined;
  meaningAr?: string | undefined;
}) {
  return post<{ ok: boolean; error?: string; note?: string }>("/api/corrections", {
    action: "submit",
    consent: true,
    ...input,
  });
}

export function approvedCorrections(script?: string) {
  return post<{ ok: boolean; items?: SharedCorrectionView[] }>("/api/corrections", {
    action: "approved",
    script,
  });
}

export function adminCorrections(status: "pending" | "approved" | "rejected") {
  return post<{
    ok: boolean;
    items?: SharedCorrectionView[];
    counts?: Record<string, number>;
    error?: string;
  }>("/api/admin/corrections", { action: "list", status });
}

export function reviewCorrection(
  id: string,
  decision: "approved" | "rejected",
  reviewerNote?: string,
) {
  return post<{ ok: boolean; counts?: Record<string, number>; error?: string }>(
    "/api/admin/corrections",
    { action: "review", id, decision, reviewerNote },
  );
}
