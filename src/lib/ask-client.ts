/** Browser-side calls to the research assistant and its administrator endpoints. */

export type AskSource = {
  id: string;
  kind: "corpus" | "document" | "alphabet" | "web";
  title: string;
  authors: string | null;
  year: number | null;
  url: string | null;
  page: number | null;
  license: string | null;
  depth: "record" | "page_text" | "abstract" | "metadata_only";
  content: string;
};

export type AskAnswerView = {
  answer: string;
  visibleCharacters: string;
  proposedReading: string;
  meaningArabic: string;
  alternatives: string;
  missingEvidence: string;
  publishedEvidence: string;
  aiInference: string;
  usedSourceIds: string[];
  followUps: string[];
};

export type AskResponse = {
  ok: boolean;
  error?: string;
  answer?: AskAnswerView;
  sources?: AskSource[];
  notes?: string[];
  model?: string;
  mode?: "quick" | "detailed";
  externalSearched?: boolean;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ ok: false, error: "No response." }))) as T;
}

export const ask = (payload: {
  task: "question" | "image" | "reading";
  mode: "quick" | "detailed";
  lang: "ar" | "en" | "zh" | "fr";
  question: string;
  script: string;
  inscription?: string;
  images?: string[];
  projectContext?: string;
  history?: { role: "user" | "assistant"; text: string }[];
}) => post<AskResponse>("/api/ask", payload);

export type AiStatus = {
  ok: boolean;
  error?: string;
  provider?: string;
  credentialPresent?: boolean;
  externalSearch?: { name: string; keyRequired: boolean; available: boolean }[];
  settings?: {
    quickModel: string;
    detailedModel: string;
    monthlyCallLimit: number;
    enabled: boolean;
  };
  usage?: { callsThisMonth: number; limit: number };
  documents?: {
    id: string;
    title: string;
    authors: string | null;
    year: number | null;
    license: string;
    page_count: number;
    source_url: string | null;
  }[];
  recent?: { data?: { mode: string; model: string; status: string; created_at: string }[] };
};

export const aiStatus = () => post<AiStatus>("/api/admin/ai", { action: "status" });

export const aiUpdate = (settings: {
  quickModel: string;
  detailedModel: string;
  monthlyCallLimit: number;
  enabled: boolean;
}) => post<AiStatus>("/api/admin/ai", { action: "update", ...settings });

export type ResearchDoc = {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  license: string;
  page_count: number;
  source_url: string | null;
};

export const researchList = () =>
  post<{ ok: boolean; error?: string; documents?: ResearchDoc[] }>("/api/admin/research", {
    action: "list",
  });

export const researchAdd = (payload: {
  title: string;
  authors?: string;
  year?: number;
  publisher?: string;
  sourceUrl?: string;
  license: string;
  permissionNote?: string;
  pages: { page: number; text: string }[];
}) =>
  post<{ ok: boolean; error?: string; documents?: ResearchDoc[] }>("/api/admin/research", {
    action: "add",
    ...payload,
  });

export const researchDelete = (id: string) =>
  post<{ ok: boolean; error?: string; documents?: ResearchDoc[] }>("/api/admin/research", {
    action: "delete",
    id,
  });
