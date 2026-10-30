/**
 * Create the two Playwright accounts, an organization admin and a member, in
 * a throwaway organization, and save them in the gitignored
 * e2e/.env.development (a pair already saved there is kept: delete it to get
 * a new account).
 *
 *   pnpm e2e:accounts [--org <org-key>]
 *
 * The organization is `--org` or `PLATFORM` in iblai.env — never `main`. It
 * asks for that organization's Platform API key, checks the key belongs to
 * it, and keeps the key nowhere. Prints usernames only: never a password.
 */
import { askAuthorization, bootstrap, fail } from "./_env";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import config from "../lib/iblai/config";

const ROLES = [
  {
    role: "admin",
    prefix: "e2e-adm",
    name: "E2E Admin",
    isAdmin: true,
    keys: ["PLAYWRIGHT_USERNAME", "PLAYWRIGHT_PASSWORD"],
  },
  {
    role: "member",
    prefix: "e2e-mem",
    name: "E2E Member",
    isAdmin: false,
    keys: ["PLAYWRIGHT_MEMBER_USERNAME", "PLAYWRIGHT_MEMBER_PASSWORD"],
  },
] as const;

type Account = { username: string; email: string; password: string };

/** A fresh account. Platform usernames are [\w.@+-], at most 30 characters. */
function newAccount(prefix: string): Account {
  const username = `${prefix}-${randomBytes(4).toString("hex")}`;
  // base64url holds nothing dotenv reads specially; the suffix satisfies rules that want a digit, a capital and a symbol.
  return {
    username,
    email: `${username}@example.com`,
    password: `${randomBytes(18).toString("base64url")}-Aa1`,
  };
}

/** Set KEY=value lines: replaced in place when present, appended otherwise. */
function mergeEnv(text: string, values: Record<string, string>): string {
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text)
      ? text.replace(re, () => line)
      : `${text}${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`;
  }
  return text;
}

async function main() {
  const { org } = bootstrap();
  const authorization = await askAuthorization();
  const api = `${config.dmUrl()}/api`;
  const headers = { Authorization: authorization };

  // A Platform API key acts in one organization; the platform answers 200 only for that one.
  const probe = await fetch(
    `${api}/core/platform/users/?platform_key=${encodeURIComponent(org)}&page_size=1`,
    { headers },
  );
  if (probe.status !== 200) {
    fail(`The key is not a Platform API key for "${org}" (HTTP ${probe.status}).`);
  }

  async function post(path: string, body: unknown, type = "application/json") {
    const res = await fetch(api + path, {
      method: "POST",
      headers: { ...headers, "Content-Type": type },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  }

  async function createUser(account: Account, name: string, role: string): Promise<number> {
    const body = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: account.username,
      name: { formatted: name },
      emails: [{ value: account.email, primary: true }],
      password: account.password,
      active: true,
    };
    for (let attempt = 1; ; attempt++) {
      const res = await post(`/orgs/${org}/scim/v2/Users`, body, "application/scim+json");
      // 201: created. 200: the name already exists — ours only when it answers a retry.
      if (res.status === 201 || (res.status === 200 && attempt > 1)) return JSON.parse(res.text).id;
      if (res.status === 200)
        fail(`${role}: ${account.username} is taken; run again for a new name.`);
      // 500 right after a create: the account is still propagating; the retry finds it.
      if (res.status !== 500 || attempt === 4) {
        fail(
          `${role}: creating ${account.username} failed: HTTP ${res.status} ${res.text.slice(0, 300)}`,
        );
      }
      await new Promise((done) => setTimeout(done, 5_000));
    }
  }

  const envFile = resolve(process.cwd(), "e2e/.env.development");
  const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
  let text = read(envFile) || read(resolve(process.cwd(), "e2e/.env.development.example"));
  for (const {
    role,
    prefix,
    name,
    isAdmin,
    keys: [userKey, passKey],
  } of ROLES) {
    const saved = dotenv.parse(text);
    if (saved[userKey] && saved[passKey] && !saved[userKey].startsWith("your-")) {
      console.log(`${role}: ${saved[userKey].split("@")[0]} (already set)`);
      continue;
    }
    const account = newAccount(prefix);
    const id = await createUser(account, name, role);
    const link = await post("/core/users/platforms/", {
      user_id: id,
      platform_key: org,
      active: true,
      is_admin: isAdmin,
    });
    if (link.status >= 300) {
      fail(
        `${role}: adding ${account.username} to "${org}" failed: HTTP ${link.status} ${link.text.slice(0, 300)}`,
      );
    }
    text = mergeEnv(text, { [userKey]: account.email, [passKey]: account.password });
    writeFileSync(envFile, text);
    chmodSync(envFile, 0o600);
    console.log(`${role}: ${account.username} (created)`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
