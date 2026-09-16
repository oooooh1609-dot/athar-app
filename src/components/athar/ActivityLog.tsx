import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  Camera,
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  FolderCheck,
  PenLine,
  Play,
  RotateCcw,
  ScrollText,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  type ActivityItem,
  type ActivityType,
  useActivityLog,
  logActivity,
} from "@/lib/activity-log";
import { downloadBlob } from "@/lib/object-url";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ActivityLogProps {
  id?: string;
  className?: string;
  maxItems?: number;
  compact?: boolean;
}

export type ActivityTab = "all" | "photo" | "analysis" | "3d" | "saved";

interface TabDefinition {
  id: ActivityTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  predicate: (item: ActivityItem) => boolean;
  emptyTitle: string;
  emptyDescription: string;
  simulateType?: "photo" | "analysis" | "3d" | "saved";
}

function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 45) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "photo_taken":
      return <Camera className="size-4 text-amber-500" />;
    case "processing_started":
      return <Sparkles className="size-4 text-sky-500" />;
    case "processing_completed":
      return <Wand2 className="size-4 text-emerald-500" />;
    case "reading_requested":
    case "reading_completed":
      return <ScrollText className="size-4 text-indigo-500" />;
    case "reconstruction_started":
      return <Boxes className="size-4 text-violet-500" />;
    case "composition_saved":
      return <PenLine className="size-4 text-amber-600" />;
    case "project_saved":
      return <FolderCheck className="size-4 text-emerald-600" />;
    case "export_downloaded":
      return <Download className="size-4 text-blue-500" />;
    default:
      return <Activity className="size-4 text-primary" />;
  }
}

function getStatusBadge(status: ActivityItem["status"]) {
  switch (status) {
    case "success":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          Success
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          <Clock className="size-3 animate-spin" />
          In progress
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
          Error
        </span>
      );
    case "info":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Logged
        </span>
      );
  }
}

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: "all",
    label: "All logs",
    shortLabel: "All",
    icon: Activity,
    predicate: () => true,
    emptyTitle: "No recent actions recorded",
    emptyDescription:
      "Workflow operations across camera, analysis, 3D, and projects will appear here.",
  },
  {
    id: "photo",
    label: "Photos",
    shortLabel: "Photo",
    icon: Camera,
    predicate: (item) =>
      item.type === "photo_taken" ||
      item.type.includes("photo") ||
      item.title.toLowerCase().includes("photo"),
    emptyTitle: "No photo actions recorded",
    emptyDescription: "Snap field photographs or macro captures to log photo activities here.",
    simulateType: "photo",
  },
  {
    id: "analysis",
    label: "Analysis",
    shortLabel: "Analysis",
    icon: Sparkles,
    predicate: (item) =>
      item.type === "processing_started" ||
      item.type === "processing_completed" ||
      item.type === "reading_requested" ||
      item.type === "reading_completed" ||
      item.title.toLowerCase().includes("analysis") ||
      item.title.toLowerCase().includes("reading") ||
      item.title.toLowerCase().includes("processing"),
    emptyTitle: "No analysis actions recorded",
    emptyDescription: "Run inscription readings or image enhancement to see analysis history.",
    simulateType: "analysis",
  },
  {
    id: "3d",
    label: "3D Scans",
    shortLabel: "3D",
    icon: Boxes,
    predicate: (item) =>
      item.type === "reconstruction_started" ||
      item.title.toLowerCase().includes("3d") ||
      Boolean(item.details?.toLowerCase().includes("3d")) ||
      Boolean(item.details?.toLowerCase().includes("photogrammetry")),
    emptyTitle: "No 3D scan actions recorded",
    emptyDescription:
      "Submit multi-view photographs for 3D reconstruction to track photogrammetry jobs.",
    simulateType: "3d",
  },
  {
    id: "saved",
    label: "Saved & Exports",
    shortLabel: "Saved",
    icon: FolderCheck,
    predicate: (item) =>
      item.type === "project_saved" ||
      item.type === "composition_saved" ||
      item.type === "export_downloaded",
    emptyTitle: "No saved projects or exports recorded",
    emptyDescription:
      "Saved inscriptions, compositions, and exported images will be catalogued here.",
    simulateType: "saved",
  },
];

export function ActivityLog({
  id = "activity-log-component",
  className = "",
  maxItems = 20,
}: ActivityLogProps) {
  const { activities, clear, remove } = useActivityLog();
  const { d } = useI18n();
  const [activeTab, setActiveTab] = useState<ActivityTab>("all");
  const [showSimulate, setShowSimulate] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 15_000);
    return () => clearInterval(timer);
  }, []);

  // Tab counts for all categories
  const tabCounts = useMemo(() => {
    const counts: Record<ActivityTab, number> = {
      all: activities.length,
      photo: 0,
      analysis: 0,
      "3d": 0,
      saved: 0,
    };
    for (const def of TAB_DEFINITIONS) {
      if (def.id === "all") continue;
      counts[def.id] = activities.filter(def.predicate).length;
    }
    return counts;
  }, [activities]);

  // Current tab definition
  const currentTabDef = useMemo(() => {
    return TAB_DEFINITIONS.find((t) => t.id === activeTab) || TAB_DEFINITIONS[0];
  }, [activeTab]);

  // Filtered list based on active tab
  const filtered = useMemo(() => {
    return activities.filter(currentTabDef.predicate);
  }, [activities, currentTabDef]);

  const displayed = useMemo(() => {
    return filtered.slice(0, maxItems);
  }, [filtered, maxItems]);

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  };

  const handleSelectAllInView = () => {
    const currentViewIds = displayed.map((item) => item.id);
    const allSelected =
      currentViewIds.length > 0 && currentViewIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentViewIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentViewIds])));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
    setIsSelectionMode(false);
  };

  const confirmDeleteSelected = () => {
    const count = selectedIds.length;
    if (count === 0) return;
    remove(selectedIds);
    setSelectedIds([]);
    setShowDeleteConfirm(false);
    setIsSelectionMode(false);
    toast.success(`Deleted ${count} activity log ${count === 1 ? "entry" : "entries"}`);
  };

  const handleSimulateAction = (type: "photo" | "analysis" | "3d" | "saved") => {
    if (type === "photo") {
      logActivity({
        type: "photo_taken",
        title: "Photo taken",
        details: "Field camera captured rock face at 1× optical zoom",
        status: "success",
      });
      toast.success("Logged: Photo taken");
    } else if (type === "analysis") {
      logActivity({
        type: "reading_requested",
        title: "Inscription analysis started",
        details: "Musnad script decipherment request queued",
        status: "pending",
      });
      toast.info("Logged: Inscription analysis started");
    } else if (type === "3d") {
      logActivity({
        type: "reconstruction_started",
        title: "3D Reconstruction started",
        details: "Photogrammetry job queued with 16 viewpoint frames",
        status: "pending",
      });
      toast.info("Logged: 3D Reconstruction started");
    } else if (type === "saved") {
      logActivity({
        type: "project_saved",
        title: "Project saved",
        details: "Musnad Stone Relief (Saved locally to IndexedDB)",
        status: "success",
      });
      toast.success("Logged: Project saved");
    }
    setShowSimulate(false);
  };

  const handleExportJson = () => {
    if (filtered.length === 0) {
      toast.error("No actions to export in the current view.");
      return;
    }

    const payload = {
      application: "Athar — Inscription Field Toolkit",
      exportedAt: new Date().toISOString(),
      viewCategory: activeTab,
      categoryLabel: currentTabDef.label,
      totalEntries: filtered.length,
      activities: filtered.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        details: item.details ?? null,
        status: item.status,
        timestamp: item.timestamp,
        isoTimestamp: new Date(item.timestamp).toISOString(),
      })),
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `athar-activity-${activeTab}-${dateStamp}.json`;
    downloadBlob(blob, filename);
    toast.success(`Exported ${filtered.length} log entry(s) as JSON`);
  };

  const handleClear = () => {
    clear();
    setSelectedIds([]);
    setIsSelectionMode(false);
    toast.success("Activity log cleared");
  };

  return (
    <div
      id={id}
      className={`rounded-2xl border border-border bg-card p-4 shadow-xs transition-all ${className}`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Activity className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-foreground">Activity Log</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Filter workflow events by type or view full session history
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {activities.length > 0 && (
            <button
              type="button"
              id={`${id}-select-mode-btn`}
              onClick={() => {
                setIsSelectionMode((prev) => !prev);
                if (isSelectionMode) setSelectedIds([]);
              }}
              title={isSelectionMode ? "Exit bulk select mode" : "Select multiple logs to delete"}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
                isSelectionMode || selectedIds.length > 0
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <CheckSquare className="size-3.5" />
              <span>{isSelectionMode ? "Done" : "Select"}</span>
            </button>
          )}

          <button
            type="button"
            id={`${id}-export-json-btn`}
            onClick={handleExportJson}
            disabled={filtered.length === 0}
            title={`Export current view (${currentTabDef.label}) as JSON`}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition"
          >
            <Download className="size-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            id={`${id}-simulate-btn`}
            onClick={() => setShowSimulate((prev) => !prev)}
            title="Log a test action"
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <Play className="size-3.5" />
            <span>Test Action</span>
          </button>

          {activities.length > 0 && (
            <button
              type="button"
              id={`${id}-clear-btn`}
              onClick={handleClear}
              title="Clear all logged activities"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            >
              <Trash2 className="size-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Test Action Panel */}
      {showSimulate && (
        <div className="mb-3 rounded-xl border border-border/80 bg-muted/40 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Trigger a sample workflow action:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleSimulateAction("photo")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 text-xs font-medium border border-border text-foreground hover:bg-muted transition"
            >
              <Camera className="size-3 text-amber-500" />
              Photo taken
            </button>
            <button
              type="button"
              onClick={() => handleSimulateAction("analysis")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 text-xs font-medium border border-border text-foreground hover:bg-muted transition"
            >
              <Sparkles className="size-3 text-sky-500" />
              Analysis started
            </button>
            <button
              type="button"
              onClick={() => handleSimulateAction("3d")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 text-xs font-medium border border-border text-foreground hover:bg-muted transition"
            >
              <Boxes className="size-3 text-violet-500" />
              3D Scan started
            </button>
            <button
              type="button"
              onClick={() => handleSimulateAction("saved")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1 text-xs font-medium border border-border text-foreground hover:bg-muted transition"
            >
              <FolderCheck className="size-3 text-emerald-600" />
              Project saved
            </button>
          </div>
        </div>
      )}

      {/* Tabbed Filtering Interface */}
      <div className="mb-3 border-b border-border/60 pb-2.5">
        <div
          role="tablist"
          aria-label="Filter activity by type"
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5"
        >
          {TAB_DEFINITIONS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            const count = tabCounts[tab.id];

            return (
              <button
                key={tab.id}
                role="tab"
                id={`activity-tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`activity-tabpanel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isSelected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {(isSelectionMode || selectedIds.length > 0) && displayed.length > 0 && (
        <div
          id={`${id}-bulk-action-bar`}
          className="mb-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs transition"
        >
          <div className="flex items-center gap-2.5">
            <Checkbox
              id={`${id}-select-all-checkbox`}
              checked={
                displayed.length > 0 && displayed.every((item) => selectedIds.includes(item.id))
              }
              onCheckedChange={handleSelectAllInView}
              aria-label="Select all logs in view"
            />
            <label
              htmlFor={`${id}-select-all-checkbox`}
              className="cursor-pointer font-medium text-foreground select-none"
            >
              Select all in view ({displayed.length})
            </label>
            {selectedIds.length > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-bold text-primary">
                {selectedIds.length} selected
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id={`${id}-delete-selected-btn`}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.length === 0}
              className="flex h-7 items-center gap-1.5 rounded-lg bg-destructive px-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none transition shadow-xs"
            >
              <Trash2 className="size-3.5" />
              <span>Delete ({selectedIds.length})</span>
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="flex h-7 items-center rounded-lg border border-border px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Tab Content Panel */}
      <div
        role="tabpanel"
        id={`activity-tabpanel-${activeTab}`}
        aria-labelledby={`activity-tab-${activeTab}`}
        className="space-y-2"
      >
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center px-4">
            <div className="grid size-10 place-items-center rounded-full bg-muted">
              {(() => {
                const EmptyIcon = currentTabDef.icon;
                return <EmptyIcon className="size-5 text-muted-foreground/70" />;
              })()}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{currentTabDef.emptyTitle}</p>
            <p className="max-w-xs text-xs text-muted-foreground mt-0.5">
              {currentTabDef.emptyDescription}
            </p>
            {currentTabDef.simulateType && (
              <button
                type="button"
                onClick={() => handleSimulateAction(currentTabDef.simulateType!)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                <RotateCcw className="size-3.5" />
                Log sample {currentTabDef.shortLabel.toLowerCase()} action
              </button>
            )}
          </div>
        ) : (
          displayed.map((item) => {
            const isSelected = selectedIds.includes(item.id);

            return (
              <div
                key={item.id}
                id={`${id}-item-${item.id}`}
                onClick={() => {
                  if (isSelectionMode || selectedIds.length > 0) {
                    toggleSelect(item.id);
                  }
                }}
                className={`group flex items-start justify-between gap-3 rounded-xl border p-3 transition ${
                  isSelected
                    ? "border-primary/60 bg-primary/10 shadow-xs"
                    : "border-border/50 bg-background/60 hover:border-border hover:bg-background"
                } ${isSelectionMode || selectedIds.length > 0 ? "cursor-pointer select-none" : ""}`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  {(isSelectionMode || selectedIds.length > 0) && (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        id={`${id}-checkbox-${item.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(item.id)}
                        aria-label={`Select ${item.title}`}
                      />
                    </div>
                  )}

                  <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted/80">
                    {getActivityIcon(item.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">
                        {item.title}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>
                    {item.details && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {item.details}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-end">
                  <time
                    dateTime={new Date(item.timestamp).toISOString()}
                    title={d(item.timestamp, { dateStyle: "short", timeStyle: "medium" })}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 text-xs font-semibold text-foreground tracking-tight"
                  >
                    <Clock className="size-3 text-muted-foreground" />
                    <span>{formatRelativeTime(item.timestamp, now)}</span>
                  </time>
                  <span className="block mt-0.5 text-[10px] text-muted-foreground">
                    {d(item.timestamp, { timeStyle: "short" })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer count indicator if truncated */}
      {filtered.length > maxItems && (
        <div className="mt-3 pt-2 text-center text-xs text-muted-foreground border-t border-border/50">
          Showing {maxItems} of {filtered.length} actions in {currentTabDef.label}
        </div>
      )}

      {/* Confirmation Dialog for Bulk Delete */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent id={`${id}-delete-confirm-dialog`}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedIds.length}{" "}
              {selectedIds.length === 1 ? "Activity Log" : "Activity Logs"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete {selectedIds.length} selected{" "}
              {selectedIds.length === 1 ? "activity log entry" : "activity log entries"} from your
              workflow history? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              id={`${id}-cancel-delete-btn`}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              id={`${id}-confirm-delete-btn`}
              onClick={confirmDeleteSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedIds.length} {selectedIds.length === 1 ? "Log" : "Logs"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default ActivityLog;
