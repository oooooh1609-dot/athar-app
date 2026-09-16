import { useCallback, useEffect, useState } from "react";

export type ActivityType =
  | "photo_taken"
  | "processing_started"
  | "processing_completed"
  | "reading_requested"
  | "reading_completed"
  | "reconstruction_started"
  | "composition_saved"
  | "project_saved"
  | "export_downloaded"
  | "action";

export type ActivityStatus = "success" | "pending" | "info" | "error";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  details?: string;
  timestamp: number;
  status: ActivityStatus;
}

const STORAGE_KEY = "athar_activity_log";
const MAX_ENTRIES = 50;
const EVENT_NAME = "athar:activity";

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: "act-demo-1",
    type: "processing_completed",
    title: "Analysis & enhancement completed",
    details: "D-Stretch contrast filter applied to rock inscription",
    timestamp: Date.now() - 5 * 60 * 1000,
    status: "success",
  },
  {
    id: "act-demo-2",
    type: "photo_taken",
    title: "Photo taken",
    details: "Macro viewpoint captured in high resolution (1× zoom)",
    timestamp: Date.now() - 12 * 60 * 1000,
    status: "success",
  },
  {
    id: "act-demo-3",
    type: "reconstruction_started",
    title: "3D Reconstruction started",
    details: "Photogrammetry job queued with 16 viewpoint frames",
    timestamp: Date.now() - 25 * 60 * 1000,
    status: "pending",
  },
  {
    id: "act-demo-4",
    type: "reading_requested",
    title: "Inscription analysis requested",
    details: "Musnad script decipherment request queued",
    timestamp: Date.now() - 40 * 60 * 1000,
    status: "info",
  },
];

export function getActivities(): ActivityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_ACTIVITIES));
      return INITIAL_ACTIVITIES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export function logActivity(
  entry: Omit<ActivityItem, "id" | "timestamp"> & { id?: string; timestamp?: number },
): ActivityItem {
  const generatedId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const item: ActivityItem = {
    id: entry.id || generatedId,
    type: entry.type,
    title: entry.title,
    details: entry.details,
    timestamp: entry.timestamp || Date.now(),
    status: entry.status || "info",
  };

  if (typeof window !== "undefined") {
    try {
      const current = getActivities();
      const updated = [item, ...current].slice(0, MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: item }));
    } catch (err) {
      console.warn("[Athar] Could not persist activity item:", err);
    }
  }

  return item;
}

export function clearActivities(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
  } catch {
    // Ignored
  }
}

export function deleteActivities(ids: string[]): void {
  if (typeof window === "undefined" || !ids.length) return;
  try {
    const idSet = new Set(ids);
    const current = getActivities();
    const updated = current.filter((item) => !idSet.has(item.id));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: null }));
  } catch (err) {
    console.warn("[Athar] Could not delete activity items:", err);
  }
}

export function useActivityLog() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(() => {
    setActivities(getActivities());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    refresh();

    const handleUpdate = () => {
      refresh();
    };

    window.addEventListener(EVENT_NAME, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(EVENT_NAME, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refresh]);

  const log = useCallback(
    (entry: Omit<ActivityItem, "id" | "timestamp"> & { id?: string; timestamp?: number }) => {
      return logActivity(entry);
    },
    [],
  );

  const clear = useCallback(() => {
    clearActivities();
  }, []);

  const remove = useCallback((ids: string[]) => {
    deleteActivities(ids);
  }, []);

  return { activities, log, clear, remove, isLoaded, refresh };
}
