/**
 * Interface language for Athar: Arabic, English, Simplified Chinese, French.
 *
 * The chosen language changes the interface only. It never touches inscription
 * data: saved tokens, glyph images, transliterations and writing direction of an
 * inscription are stored per inscription and are independent of this setting.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DICT } from "./i18n-dict";

export const LANGS = [
  { id: "ar", native: "العربية", english: "Arabic", dir: "rtl", locale: "ar" },
  { id: "en", native: "English", english: "English", dir: "ltr", locale: "en" },
  { id: "zh", native: "简体中文", english: "Simplified Chinese", dir: "ltr", locale: "zh-Hans" },
  { id: "fr", native: "Français", english: "French", dir: "ltr", locale: "fr" },
] as const;

export type UiLang = (typeof LANGS)[number]["id"];
export type Dir = "rtl" | "ltr";

const STORAGE_KEY = "athar.uiLang";

export const langInfo = (l: UiLang) => LANGS.find((x) => x.id === l)!;

function detect(): UiLang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS.some((l) => l.id === saved)) return saved as UiLang;
  } catch {
    /* private mode: fall through to the browser language */
  }
  const nav = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  if (nav.startsWith("ar")) return "ar";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("fr")) return "fr";
  return "en";
}

type Vars = Record<string, string | number>;

type Ctx = {
  lang: UiLang;
  dir: Dir;
  locale: string;
  setLang: (l: UiLang) => void;
  t: (key: string, vars?: Vars) => string;
  n: (value: number) => string;
  d: (value: Date | number | string, opts?: Intl.DateTimeFormatOptions) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR renders English; the stored choice is applied on hydration so the
  // markup never mismatches.
  const [lang, setLangState] = useState<UiLang>("en");

  useEffect(() => {
    setLangState(detect());
  }, []);

  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* choice still applies for this session */
    }
  }, []);

  const info = langInfo(lang);

  useEffect(() => {
    const el = document.documentElement;
    el.lang = info.locale;
    el.dir = info.dir;
  }, [info.locale, info.dir]);

  const value = useMemo<Ctx>(() => {
    const t = (key: string, vars?: Vars) => {
      const table = DICT[lang] as Record<string, string> | undefined;
      const fallback = DICT["en"] as Record<string, string>;
      return interpolate(table?.[key] ?? fallback[key] ?? key, vars);
    };
    return {
      lang,
      dir: info.dir,
      locale: info.locale,
      setLang,
      t,
      n: (v: number) => new Intl.NumberFormat(info.locale).format(v),
      d: (v: Date | number | string, opts?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(
          info.locale,
          opts ?? { dateStyle: "medium", timeStyle: "short" },
        ).format(new Date(v)),
    };
  }, [lang, info.dir, info.locale, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Safe default so a component rendered outside the provider still renders.
  const en = langInfo("en");
  return {
    lang: "en",
    dir: "ltr",
    locale: en.locale,
    setLang: () => {},
    t: (key, vars) => interpolate((DICT["en"] as Record<string, string>)[key] ?? key, vars),
    n: (v) => new Intl.NumberFormat("en").format(v),
    d: (v, opts) =>
      new Intl.DateTimeFormat("en", opts ?? { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(v),
      ),
  };
}
