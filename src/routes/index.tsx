import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  Camera,
  FolderOpen,
  Home,
  Image as ImageIcon,
  PenLine,
  ScrollText,
  Settings,
  Sparkles,
  ChevronRight,
  LogOut,
  MessageSquare,
} from "lucide-react";

import { AskAthar } from "@/components/athar/AskAthar";
import { AuthGate, DevelopmentNotice } from "@/components/athar/AuthGate";
import { ConnectionBar } from "@/components/athar/ConnectionBar";
import { PanoramaViewer } from "@/components/athar/PanoramaViewer";
import { ContactFeedback } from "@/components/athar/ContactFeedback";
import { CorpusAnalysis } from "@/components/athar/CorpusAnalysis";
import { LangButton } from "@/components/athar/LangButton";
import { LanguageSelector } from "@/components/athar/LanguageSelector";
import { Workspace } from "@/components/athar/Workspace";
import { Capture3D } from "@/components/athar/Capture3D";
import { Projects } from "@/components/athar/Projects";
import { WriteInscription } from "@/components/athar/WriteInscription";
import { ActivityLog } from "@/components/athar/ActivityLog";
import heroAsset from "@/assets/athar-home-hero.jpg.asset.json";
import { recentProjects, type AtharProject } from "@/lib/athar-db";
import { useObjectUrl } from "@/lib/object-url";
import { leaveAccess } from "@/lib/code-access-client";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Athar — Enhance, Read & Write Ancient Inscriptions" },
      {
        name: "description",
        content:
          "Athar is a field toolkit for photographing archaeological objects, revealing faded pigments and carvings with real pixel processing, assisted script reading, ancient-letter writing, and multi-photo 3D capture. Interface available in Arabic, English, Simplified Chinese and French.",
      },
      {
        property: "og:title",
        content: "Athar — Enhance, Read & Write Ancient Inscriptions",
      },
      {
        property: "og:description",
        content:
          "Capture, reveal and understand: enhance rock art, request evidence-based readings, write with Musnad and Thamudic letters, and reconstruct objects in 3D.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AtharRoute,
});

type Tab = "home" | "capture" | "read" | "write" | "projects";

const TABS: { id: Tab; icon: React.ReactNode }[] = [
  { id: "home", icon: <Home className="size-5" /> },
  { id: "capture", icon: <Camera className="size-5" /> },
  { id: "read", icon: <ScrollText className="size-5" /> },
  { id: "write", icon: <PenLine className="size-5" /> },
  { id: "projects", icon: <FolderOpen className="size-5" /> },
];

/** Private entry: the app only renders once a valid access code was entered. */
function AtharRoute() {
  return <AuthGate>{() => <AtharApp />}</AuthGate>;
}

function AtharApp() {
  const { t, d } = useI18n();
  const [contact, setContact] = useState(false);
  const [settings, setSettings] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>("home");
  const [captureMode, setCaptureMode] = useState<"photo" | "object" | "panorama">("photo");
  const [openComposition, setOpenComposition] = useState<AtharProject | null>(null);
  const [recent, setRecent] = useState<AtharProject[]>([]);
  const [recentError, setRecentError] = useState(false);

  const loadRecent = useCallback(async () => {
    try {
      setRecent(await recentProjects(3));
    } catch {
      setRecentError(true);
    }
  }, []);

  useEffect(() => {
    if (tab === "home") void loadRecent();
  }, [tab, loadRecent]);

  const overlay = contact || settings;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
            >
              <span className="font-display text-base leading-none">A</span>
            </span>
            <span className="truncate font-display text-lg font-bold tracking-[0.18em] text-primary uppercase">
              {t(`title.${tab}`)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <DevelopmentNotice compact />
            <LangButton />
            <button
              onClick={() => {
                setSettings(false);
                setContact(true);
              }}
              aria-label={t("header.contact")}
              className="relative grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              <MessageSquare className="size-5" />
              {unread > 0 && (
                <span className="absolute top-2 right-2 size-2.5 rounded-full bg-accent" />
              )}
            </button>
            <button
              onClick={() => {
                setContact(false);
                setSettings((v) => !v);
              }}
              aria-label={t("header.settings")}
              aria-pressed={settings}
              className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              <Settings className="size-5" />
            </button>
            <button
              onClick={async () => {
                await leaveAccess();
                window.location.reload();
              }}
              aria-label={t("header.leave")}
              className="grid size-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
        <ConnectionBar />
      </header>

      {/* Every tab stays mounted so unfinished work survives tab and language switching. */}
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <section hidden={!settings}>
          <h2 className="text-lg font-bold">{t("settings.title")}</h2>
          <div className="panel mt-3 p-4">
            <LanguageSelector />
            <p className="mt-2 text-xs text-muted-foreground">{t("settings.languageNote")}</p>
          </div>
          <a
            href="/admin"
            className="panel mt-3 flex items-center justify-between gap-3 p-4 text-sm font-semibold hover:border-primary"
          >
            {t("settings.admin")}
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </a>
          <button
            onClick={() => setSettings(false)}
            className="mt-3 text-sm font-semibold text-primary"
          >
            {t("settings.back")}
          </button>
        </section>

        <section hidden={overlay || tab !== "home"}>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
            {t("home.eyebrow")}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-primary">{t("home.h1")}</h1>
          <p className="mt-1 text-muted-foreground">{t("home.tagline")}</p>
          <div className="mt-3">
            <DevelopmentNotice />
          </div>

          <div className="relative mt-4 overflow-hidden rounded-2xl border border-border">
            <img
              src={heroAsset.url}
              alt={t("home.heroAlt")}
              width={1200}
              height={700}
              className="h-44 w-full object-cover"
            />
            <span className="absolute bottom-3 left-3 rounded-lg bg-primary/85 px-3 py-1 text-sm font-semibold text-primary-foreground">
              {t("home.heroBadge")}
            </span>
          </div>

          <h2 className="mt-6 text-lg font-bold">{t("home.start")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <ActionTile
              icon={<ImageIcon className="size-5" />}
              title={t("tile.enhance.title")}
              body={t("tile.enhance.body")}
              onClick={() => {
                setCaptureMode("photo");
                setTab("capture");
              }}
            />
            <ActionTile
              icon={<ScrollText className="size-5" />}
              title={t("tile.read.title")}
              body={t("tile.read.body")}
              onClick={() => setTab("read")}
            />
            <ActionTile
              icon={<PenLine className="size-5" />}
              title={t("tile.write.title")}
              body={t("tile.write.body")}
              onClick={() => {
                setOpenComposition(null);
                setTab("write");
              }}
            />
            <ActionTile
              icon={<Boxes className="size-5" />}
              title={t("tile.object.title")}
              body={t("tile.object.body")}
              onClick={() => {
                setCaptureMode("object");
                setTab("capture");
              }}
            />
            <ActionTile
              icon={<MessageSquare className="size-5" />}
              title={t("tile.contact.title")}
              body={t("tile.contact.body")}
              onClick={() => setContact(true)}
            />
            <ActionTile
              icon={<Sparkles className="size-5" />}
              title={t("tile.ask.title")}
              body={t("tile.ask.body")}
              onClick={() => {
                setTab("read");
                requestAnimationFrame(() =>
                  document.getElementById("ask-athar")?.scrollIntoView({ behavior: "smooth" }),
                );
              }}
            />
          </div>

          <h2 className="mt-6 text-lg font-bold">{t("home.recent")}</h2>
          {recentError && (
            <p className="panel mt-3 p-4 text-sm text-muted-foreground">
              {t("home.storageUnavailable")}
            </p>
          )}
          {!recentError && recent.length === 0 && (
            <div className="panel mt-3 p-4">
              <p className="text-sm text-muted-foreground">{t("home.nothingSaved")}</p>
            </div>
          )}
          {!recentError &&
            recent.map((p) => (
              <button
                key={p.id}
                onClick={() => setTab("projects")}
                className="panel mt-3 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 text-start hover:border-primary"
              >
                <RecentThumb project={p} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.serverSide ? t("projects.reconstructionJob") : t("projects.savedOnDevice")} ·{" "}
                    {d(p.createdAt, { dateStyle: "medium" })}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            ))}

          <ActivityLog className="mt-6" />
        </section>

        <section hidden={!contact}>
          <button
            onClick={() => setContact(false)}
            className="mb-3 text-sm font-semibold text-primary"
          >
            {t("home.backToAthar")}
          </button>
          <ContactFeedback onUnreadChange={setUnread} />
        </section>

        <section hidden={overlay || tab !== "capture"}>
          <div
            role="tablist"
            aria-label={t("capture.mode")}
            className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1"
          >
            {(
              [
                ["photo", "capture.photo"],
                ["object", "capture.object"],
                ["panorama", "pv.title"],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                role="tab"
                aria-selected={captureMode === id}
                onClick={() => setCaptureMode(id)}
                className={`min-h-11 rounded-lg text-sm font-semibold transition ${
                  captureMode === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div hidden={captureMode !== "photo"}>
            <Workspace intent="enhance" />
          </div>
          <div hidden={captureMode !== "object"}>
            <Capture3D />
          </div>
          <div hidden={captureMode !== "panorama"}>
            <PanoramaViewer />
          </div>
        </section>

        <section hidden={overlay || tab !== "read"}>
          <Workspace intent="read" />
          <div className="mt-6">
            <CorpusAnalysis />
          </div>
          <div id="ask-athar" className="mt-6 scroll-mt-20">
            <AskAthar />
          </div>
        </section>

        <section hidden={overlay || tab !== "write"}>
          <WriteInscription
            key={openComposition?.id ?? "new"}
            {...(openComposition ? { initial: openComposition } : {})}
          />
        </section>

        <section hidden={overlay || tab !== "projects"}>
          <Projects
            onOpenComposition={(p) => {
              setOpenComposition(p);
              setTab("write");
            }}
          />
        </section>
      </main>

      <nav
        aria-label={t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch justify-between gap-1 px-3 py-2">
          {TABS.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => {
                  setSettings(false);
                  setContact(false);
                  setTab(item.id);
                }}
                aria-current={tab === item.id && !overlay ? "page" : undefined}
                className={`tab-item ${tab === item.id && !overlay ? "tab-item-active" : ""}`}
              >
                {item.icon}
                {t(`nav.${item.id}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Thumbnail for one recent project.
 *
 * Its own component so the blob URL can live in a hook and be revoked when the
 * row unmounts. Building the URL inline in the list made a new one on every
 * render and freed none of them.
 */
function RecentThumb({ project }: { project: AtharProject }) {
  const url = useObjectUrl(project.enhanced ?? project.original);
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {url ? (
        <img src={url} alt="" className="size-12 object-cover" />
      ) : project.kind === "composition" ? (
        <PenLine className="size-5" />
      ) : (
        <Boxes className="size-5" />
      )}
    </span>
  );
}

function ActionTile({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="panel min-h-28 w-full p-4 text-start transition hover:border-primary active:scale-[0.99]"
    >
      <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-primary">
          {icon}
        </span>
        <ChevronRight className="size-5 justify-self-end text-muted-foreground" />
      </span>
      <span className="mt-2 block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
    </button>
  );
}
