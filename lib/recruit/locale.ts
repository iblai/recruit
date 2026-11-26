/**
 * The language of a public page's own words: the first of the visitor's
 * languages we carry. The agent itself answers in whatever is written to it.
 */
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import fr from "../../messages/fr.json";
import zh from "../../messages/zh.json";

export const LOCALES = ["en", "es", "fr", "zh"] as const;
export type Locale = (typeof LOCALES)[number];

const MESSAGES = { en, es, fr, zh };

/** From an `Accept-Language` header; English when it names none of ours. */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((w) => w.q > 0)
    .sort((a, b) => b.q - a.q);
  const known = (lang: string): lang is Locale => (LOCALES as readonly string[]).includes(lang);
  return wanted.map((w) => w.lang).find(known) ?? "en";
}

/** The public pages' words in `locale`. */
export const publicMessages = (locale: Locale) => MESSAGES[locale].public;

/** `{name}` placeholders filled in. */
export const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
