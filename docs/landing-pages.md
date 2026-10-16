# Landing pages

Public, prospect-facing pages at `/p/<org>/<slug>` — "Request information",
"Register for the Fall open house", "Nursing info session". Fast,
server-rendered, no sign-in, no SDK bundle, branded with the institution's
accent color. Every submission becomes a prospect in the CRM.

## Where a page lives

Each page is a **CRM web form** on the platform (`/api/crm/web-forms/`,
platform 4.428.0+): the copy in its `metadata`, the questions in `fields`,
where a submission lands in `routing`. `lib/recruit/landing-pages.ts` maps
the editor's `LandingPage` to it (`toWebForm` / `fromWebForm`); there is no
database of our own and no server secret. The public route renders a
published page from the platform's public read
(`GET /api/crm/orgs/<org>/web-forms/<slug>/` — no routing, no mappings),
cached for a minute.

## Building a page

_Landing pages → New landing page_ creates a draft with the standard inquiry
form. The editor has four tabs and a live preview (the same component the
public route renders, in preview mode):

- **Content** — title (tab/list), headline, subheadline, highlights (one per
  line, shown as a checklist), paragraphs, hero image URL, button label,
  thank-you title and message.
- **Form** — the questions, in order. Each has a label, a type (text, email,
  phone, number, date, dropdown, paragraph, checkbox), placeholder, required
  flag and — the important part — **where the answer lands**:

  | Mapping                                                                            | Lands in                                            |
  | ---------------------------------------------------------------------------------- | --------------------------------------------------- |
  | First name / Last name / Full name                                                 | `person.name`                                       |
  | Email                                                                              | `person.primary_email` (also used to de-duplicate)  |
  | Phone                                                                              | `person.contact_numbers[0]`                         |
  | School                                                                             | an Organization, found by name or created           |
  | Program of interest                                                                | `person.job_title` + `deal.metadata.program`        |
  | Entry term                                                                         | `person.metadata.entry_term` + `deal.metadata.term` |
  | Entry type                                                                         | `person.metadata.entry_type` + `deal.metadata`      |
  | Graduation year, residency, city, state, country, parent name / email, SMS consent | `person.metadata.<key>`                             |
  | Message                                                                            | the application's notes                             |
  | Keep as extra field                                                                | `person.metadata.<field key>`                       |

  Question keys start with a lowercase letter (letters, digits, `_`), and no
  two questions may land in the same place. A page must map one question to
  Email and one to a name before it can be published.

- **Routing** — open an application or not; funnel and starting stage (by
  stable code — the first open stage when empty); default program and term;
  the source code recorded on the application (created on first use); tags
  (created on first use) attached to the prospect and the application; the
  prospect's lifecycle stage; the counselor who owns submissions.
- **Share** — the public link, UTM guidance and an `<iframe>` embed snippet.

**Publish** (switch in the header or the list) validates the page and flips it
live. Unpublished or unknown slugs show a neutral "not available" page — never
a hint about what exists. The list counts each page's submissions.

The Chief of Staff can draft pages too (`create_landing_page`); they stay
unpublished until a human reviews them unless the user explicitly asks to publish.

## What a submission does

The visitor's browser posts the answers straight to the platform
(`POST /api/crm/orgs/<org>/web-forms/<slug>/submissions/`, no credential),
which files them in one transaction: the prospect with that email is reused
(gaps filled, nothing overwritten) or created; the application opens in the
configured funnel and stage when the page routes to one, titled
"Name — Program · Term"; the tags go on both; a note lists every answer and
the page URL; UTM tags (`?utm_source=…`) are kept with the submission.

- **Identical answers within ten minutes** count once (a double-click, a reload).
- **A hidden `website` field** is a honeypot: bots that fill it get a normal
  thank-you and nothing is stored.
- **Too many submissions from one network** get `429`; the form says to try
  again in a minute.
- **Invalid answers** come back per question and show under each field.

## Branding

_Settings → Branding_: institution name, logo URL (https), accent color,
admissions contact email. Falls back to the organization's platform name and
logo. Pages use this, not the app's brand blue.

## Local design work

With the dev server running, `http://localhost:3000/p/__sample__/request-information`
renders a built-in sample page (development only — never in production) so the
public layout can be iterated without an organization.
