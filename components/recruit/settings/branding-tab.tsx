"use client";

import { useEffect, useState } from "react";
import { Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useRecruitSettings } from "@/lib/recruit/use-recruit-settings";

const CARD =
  "rounded-xl border border-[var(--border-color,#e5e7eb)] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";

/** How prospects see the institution on every landing page. */
export function BrandingTab() {
  const { settings, branding, update, isSaving, isLoading } = useRecruitSettings();
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [accent, setAccent] = useState("#0058cc");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (isLoading) return;
    setName(settings.institutionName ?? "");
    setLogo(settings.logoUrl ?? "");
    setAccent(settings.accentColor ?? "#0058cc");
    setEmail(settings.contactEmail ?? "");
  }, [
    isLoading,
    settings.institutionName,
    settings.logoUrl,
    settings.accentColor,
    settings.contactEmail,
  ]);

  const save = async () => {
    if (!/^#[0-9a-f]{6}$/i.test(accent)) {
      toast.error("Accent color must be a 6-digit hex value like #0058cc");
      return;
    }
    if (logo && !/^https:\/\//.test(logo)) {
      toast.error("Logo must be an https URL");
      return;
    }
    try {
      await update({
        institutionName: name.trim(),
        logoUrl: logo.trim(),
        accentColor: accent.toLowerCase(),
        contactEmail: email.trim(),
      });
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <section className={CARD}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Palette className="size-4 text-[#0058cc]" strokeWidth={1.75} /> Landing-page branding
        </h3>
        <p className="text-muted-foreground mt-1 text-xs">
          Shown on every public page under <code className="font-mono">/p/…</code>. Falls back to
          the organization&apos;s platform name and logo.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="brand-name" className="text-muted-foreground text-xs">
              Institution name
            </Label>
            <Input
              id="brand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={branding.name}
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="brand-logo" className="text-muted-foreground text-xs">
              Logo URL (https)
            </Label>
            <Input
              id="brand-logo"
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              placeholder="https://www.example.edu/logo.svg"
              className="h-9"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-accent" className="text-muted-foreground text-xs">
              Accent color
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick accent color"
                value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#0058cc"}
                onChange={(e) => setAccent(e.target.value)}
                className="size-9 cursor-pointer rounded-md border border-[var(--border-color,#e5e7eb)] bg-white p-1"
              />
              <Input
                id="brand-accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="brand-email" className="text-muted-foreground text-xs">
              Admissions contact email
            </Label>
            <Input
              id="brand-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admissions@example.edu"
              className="h-9"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            className="ibl-button-primary"
            size="sm"
            disabled={isSaving}
            onClick={() => void save()}
          >
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Save data-icon="inline-start" strokeWidth={1.75} />
            )}{" "}
            Save branding
          </Button>
        </div>
      </section>
      <section className={`${CARD} overflow-hidden p-0`}>
        <div
          className="px-4 py-3 text-white"
          style={{
            background: `linear-gradient(135deg, ${/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#0058cc"}, #0b1f3a)`,
          }}
        >
          <div className="flex items-center gap-2">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-6 w-auto rounded bg-white/90 p-0.5" />
            ) : null}
            <span className="text-xs font-semibold tracking-wide uppercase">
              {name || branding.name}
            </span>
          </div>
          <p className="mt-6 text-lg font-bold">Find your place here.</p>
        </div>
        <div className="p-4">
          <div className="h-2 w-3/4 rounded bg-gray-200" />
          <div className="mt-2 h-2 w-1/2 rounded bg-gray-100" />
          <div
            className="mt-4 h-8 rounded-lg"
            style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#0058cc" }}
          />
          <p className="text-muted-foreground mt-3 text-[11px]">
            Preview of the hero and button on a landing page.
          </p>
        </div>
      </section>
    </div>
  );
}
