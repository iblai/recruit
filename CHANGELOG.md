# Changelog

## 0.1.0 — 2026-10-12

First release of ibl.ai/recruit, derived from ibl.ai/crm.

- **Chief of Staff** — an ibl.ai agent as the home screen and a side panel on
  every page; one-click setup (Settings → Chief of Staff, or `pnpm setup:agent`)
  that creates the agent, registers this app's MCP tool server and wires it.
- **Tool server** — `/api/mcp/<org>`: MCP over Streamable HTTP (dependency-free),
  22 recruitment tools (brief, prospects, schools, funnels, applications,
  activities, tags, team, landing pages), bearer-token protected.
- **Recruitment vocabulary** over the CRM API: prospects, schools & partners,
  applications in funnels, counselors, enrolled / withdrawn; lifecycle
  Inquiry → Engaged → Applicant → Enrolled · Withdrawn.
- **Recruitment fields** in record metadata (graduation year, entry term,
  entry type, residency, GPA, parent contact, SMS consent; program, term,
  financial aid, scholarship; school type), shared by dialogs, pages, tools
  and forms.
- **Landing pages** — builder with live preview, publish switch, embed
  snippet; public server-rendered pages at `/p/<org>/<slug>`; submissions
  become prospect + school + application + tags + note.
- **Funnel dashboard**, Today brief, Branding settings, demo seed script.
