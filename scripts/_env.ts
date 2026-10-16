/**
 * Shared bootstrap for the CLI scripts: load `.env.local` and `iblai.env`
 * (both gitignored; neither holds a secret) into process.env so
 * lib/iblai/config.ts sees the same values the app does, resolve the
 * organization, and ask for the credential the scripts act with — it is
 * never read from a file.
 *
 * Run through tsx (a devDependency): `pnpm seed:demo …`.
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

// On import, so it runs before lib/iblai/config.ts captures the env: import this module first.
loadDotenv(".env.local");
loadDotenv(".env");
loadDotenv("iblai.env");

export function bootstrap() {
  // iblai.env shorthand → the names the scripts read.
  if (
    !process.env.IBLAI_ORG &&
    process.env.PLATFORM &&
    !/your-org|^main$/.test(process.env.PLATFORM)
  )
    process.env.IBLAI_ORG = process.env.PLATFORM;
  const org = argValue("--org") ?? process.env.IBLAI_ORG ?? "";
  if (!org || org === "main")
    fail("Which organization? Pass --org <key> or set IBLAI_ORG / PLATFORM (never `main`).");
  return { org };
}

/** `Token …` and `Api-Token …` pass through; a bare value is a Platform API key. */
export function toAuthorization(raw: string): string {
  const value = raw.trim();
  const scheme = /^(Api-Token|Token)\s+(\S+)$/.exec(value);
  if (scheme) return `${scheme[1]} ${scheme[2]}`;
  return /^\S+$/.test(value) ? `Api-Token ${value}` : "";
}

/**
 * The credential to act with, asked for once on hidden input (or read from a
 * pipe) and kept nowhere: a Platform API key of an organization admin, or
 * `Token <session token>` to act as yourself.
 */
export async function askAuthorization(): Promise<string> {
  const raw = process.stdin.isTTY
    ? await promptHidden("Platform API key, or `Token <session token>`: ")
    : await firstLineOfStdin();
  const authorization = toAuthorization(raw);
  if (!authorization) fail("No credential given.");
  return authorization;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((done) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write("\n");
          done(value);
          return;
        }
        value = ch === "\u007f" || ch === "\b" ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function firstLineOfStdin(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0] ?? "";
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
