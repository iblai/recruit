/**
 * Shared bootstrap for the CLI scripts: load `.env.local` and `iblai.env`
 * (both gitignored) into process.env so lib/iblai/config.ts sees the same
 * values the app does, then resolve the organization + username.
 *
 * Run through tsx (a devDependency): `pnpm setup:agent …`, `pnpm seed:demo …`.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotenv(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function bootstrap() {
  loadDotenv(".env.local");
  loadDotenv(".env");
  loadDotenv("iblai.env");
  // iblai.env shorthand → the names the app reads.
  if (!process.env.IBLAI_API_KEY && process.env.TOKEN && !/your-platform/.test(process.env.TOKEN))
    process.env.IBLAI_API_KEY = process.env.TOKEN;
  if (
    !process.env.IBLAI_ORG &&
    process.env.PLATFORM &&
    !/your-org|^main$/.test(process.env.PLATFORM)
  )
    process.env.IBLAI_ORG = process.env.PLATFORM;
  const org = argValue("--org") ?? process.env.IBLAI_ORG ?? "";
  const username = argValue("--username") ?? process.env.IBLAI_USERNAME ?? "";
  if (!org || org === "main")
    fail("Which organization? Pass --org <key> or set IBLAI_ORG / PLATFORM (never `main`).");
  if (!process.env.IBLAI_API_KEY && !process.env.IBLAI_API_KEYS)
    fail("No Platform API Token: set IBLAI_API_KEY in .env.local (or TOKEN in iblai.env).");
  return { org, username };
}

export function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--"))
    return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  return eq ? eq.slice(flag.length + 1) : undefined;
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}
