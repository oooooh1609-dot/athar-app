/**
 * Blob URL lifetime helpers.
 *
 * `URL.createObjectURL` pins the blob in memory until the URL is revoked or
 * the document goes away. Calling it inside a component body — which several
 * screens did — mints a fresh URL on *every* render and never frees any of
 * them, so a projects list holding a few dozen full-resolution photographs
 * grows without limit while the user scrolls.
 */

import { useEffect, useMemo } from "react";

/** A blob URL tied to the component's lifetime; revoked on unmount or change. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * Saves a blob to the user's device and releases the URL afterwards.
 *
 * The revoke is deferred rather than immediate: Safari cancels a download
 * whose object URL disappears in the same tick as the click.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
