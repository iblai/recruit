/**
 * Create or re-sync the Chief of Staff from the command line — the same
 * procedure the Settings → Chief of Staff button runs, for CI or a first
 * deploy before anyone has signed in.
 *
 *   pnpm setup:agent --org <org-key> --username <admin> --app-url https://recruit.example.edu [--institution "Northfield University"]
 *
 * Reads IBLAI_API_KEY (or TOKEN), RECRUIT_MCP_TOKEN and NEXT_PUBLIC_APP_URL
 * from .env.local / iblai.env. Prints the agent id; never prints a token.
 */
import { bootstrap, argValue, fail } from "./_env";
import { setupChiefOfStaff } from "../lib/recruit/agent";

const { org, username } = bootstrap();
if (!username)
  fail("Which admin runs this? Pass --username <platform username> or set IBLAI_USERNAME.");
const appUrl = argValue("--app-url") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
if (!/^https?:\/\//.test(appUrl))
  fail(
    "Pass --app-url https://… (or set NEXT_PUBLIC_APP_URL): the public origin the platform calls back on.",
  );
const mcpToken = process.env.RECRUIT_MCP_TOKEN ?? "";
if (mcpToken.length < 16)
  fail("Set RECRUIT_MCP_TOKEN (≥ 16 random chars; `openssl rand -hex 32`) in .env.local first.");

console.log(`\nSetting up the Chief of Staff for "${org}" as ${username} → ${appUrl}\n`);
setupChiefOfStaff({
  org,
  username,
  appUrl,
  mcpToken,
  institutionName: argValue("--institution"),
  log: (line) => console.log(`  • ${line}`),
})
  .then((r) => {
    console.log(`\n✓ Agent ${r.agentId} (MCP server #${r.mcpServerId}) is ready.`);
    console.log(
      `  Open https://os.ibl.ai/platform/${encodeURIComponent(org)}/${r.agentId} to tune prompts, LLM, memory and guardrails.\n`,
    );
  })
  .catch((e) => {
    const body =
      e && typeof e === "object" && "body" in e
        ? JSON.stringify((e as { body: unknown }).body)
        : "";
    fail(`${e instanceof Error ? e.message : String(e)} ${body}`.trim());
  });
