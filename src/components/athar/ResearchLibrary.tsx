/**
 * Administrator upload of permitted research PDFs.
 *
 * Text is extracted page by page in this browser and stored with its licence
 * note, so the assistant can cite a real page number. Image-only scans yield no
 * text and are rejected rather than silently stored.
 */

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { researchAdd, researchDelete, researchList, type ResearchDoc } from "@/lib/ask-client";

export function ResearchLibrary() {
  const [docs, setDocs] = useState<ResearchDoc[]>([]);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [year, setYear] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void researchList().then((r) => setDocs(r.documents ?? []));
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!title.trim() || !license.trim()) {
      toast.error("Title and licence/permission are required before uploading.");
      return;
    }
    setBusy(true);
    setProgress("Reading PDF…");
    try {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      const pages: { page: number; text: string }[] = [];
      for (let i = 1; i <= doc.numPages; i += 1) {
        setProgress(`Extracting page ${i} of ${doc.numPages}…`);
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((it) => ("str" in it ? it.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 20) pages.push({ page: i, text });
      }

      if (pages.length === 0) {
        toast.error(
          "No selectable text in that PDF — it is an image-only scan, so it cannot be cited by page.",
        );
        return;
      }

      setProgress(`Saving ${pages.length} page(s)…`);
      const res = await researchAdd({
        title: title.trim(),
        ...(authors.trim() ? { authors: authors.trim() } : {}),
        ...(year.trim() ? { year: Number(year) } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        license: license.trim(),
        pages,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Upload failed.");
        return;
      }
      setDocs(res.documents ?? []);
      setTitle("");
      setAuthors("");
      setYear("");
      setSourceUrl("");
      setLicense("");
      toast.success(`Stored ${pages.length} searchable page(s).`);
    } catch (err) {
      console.error(err);
      toast.error("That PDF could not be read in this browser.");
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    const res = await researchDelete(id);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed.");
      return;
    }
    setDocs(res.documents ?? []);
  };

  return (
    <section className="panel space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <FileText className="size-5" /> Research library
      </h2>
      <p className="text-sm text-muted-foreground">
        Upload only documents you are permitted to store and quote. Pages become searchable evidence
        the assistant can cite with a page number. Record the licence or permission for each file.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="doc-title" className="text-xs">
            Title (required)
          </Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="doc-authors" className="text-xs">
            Author(s)
          </Label>
          <Input id="doc-authors" value={authors} onChange={(e) => setAuthors(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="doc-year" className="text-xs">
            Year
          </Label>
          <Input
            id="doc-year"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="doc-url" className="text-xs">
            Source URL
          </Label>
          <Input id="doc-url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="doc-license" className="text-xs">
            Licence / permission (required)
          </Label>
          <Input
            id="doc-license"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="e.g. CC BY 4.0, or written permission from the publisher"
          />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        {busy ? (progress ?? "Working…") : "Choose PDF and extract pages"}
      </Button>

      <ul className="space-y-2">
        {docs.map((d) => (
          <li
            key={d.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border pt-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{d.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[d.authors, d.year, `${d.page_count} pages`, d.license]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${d.title}`}
              onClick={() => void remove(d.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
        {docs.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No documents yet, so no page-level evidence is available to the assistant.
          </li>
        )}
      </ul>
    </section>
  );
}
