# Landing pages

Public, prospect-facing forms at `/p/<org>/<slug>` — "Request information",
"Register for the Fall open house", "Nursing info session". Fast,
server-rendered, no sign-in, no SDK bundle, branded with the institution's
accent color. A submission becomes records in the CRM automatically.

## Where a page lives

Each page is a JSON document (`LandingPage` in `lib/recruit/landing-pages.ts`)
stored in the organization's **public metadata** under
`apps.recruit.landingPages`. That is why the public route can render it with
no credentials, and why there is no database of our own. Writes go through
GET → merge → PUT like every other org setting.

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

  | Mapping                                                                                        | Lands in                                            |
  | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
  | First name / Last name / Full name                                                             | `person.name`                                       |
  | Email                                                                                          | `person.primary_email` (also used to de-duplicate)  |
  | Phone                                                                                          | `person.contact_numbers[0]`                         |
  | School                                                                                         | an Organization, found by name or created           |
  | Program of interest                                                                            | `person.job_title` + `deal.metadata.program`        |
  | Entry term                                                                                     | `person.metadata.entry_term` + `deal.metadata.term` |
  | Graduation year, entry type, residency, city, state, country, parent name / email, SMS consent | `person.metadata.<key>`                             |
  | Message                                                                                        | the application's notes                             |
  | Keep as extra field                                                                            | `person.metadata.<field key>`                       |

  A page must map one question to Email and one to a name before it can be published.

- **Routing** — open an application or not; funnel and starting stage (by
  stable code — the first open stage when empty); default program and term;
  the source code recorded on the application (created on first use); tags
  (created on first use) attached to the prospect and the application; the
  prospect's lifecycle stage; the counselor who owns submissions.
- **Share** — the public link, UTM guidance (`?utm_source=…` is stored on the
  prospect), an `<iframe>` embed snippet, the submission count.

**Publish** (switch in the header or the list) validates the page and flips it
live. Unpublished or unknown slugs show a neutral "not available" page — never
a hint about what exists.

The Chief of Staff can draft pages too (`create_landing_page`); they stay
unpublished until a human reviews them unless the user explicitly asks to publish.

## What a submission does

`POST /api/public/forms/<org>/<slug>` with `{ answers, website, utm, pageUrl }`:

1. Honeypot (`website` filled → silently accepted and dropped), per-IP rate
   limit (12 per 10 minutes), size caps.
2. Load the _published_ page from the org's metadata; validate the answers
   against **its** definition (`validateSubmission`) — required fields, email
   format, dropdown options, numbers. Field errors come back as `422` with
   `issues[]` the form highlights.
3. `planSubmission` turns answers into CRM payloads using each field's mapping.
4. `applySubmission` (with the org's Platform API Token):
   - find or create the school by name;
   - reuse a prospect with the same email (merging new metadata, filling empty
     phone / program / school) or create one;
   - attach the tags;
   - open the application in the configured funnel and stage with the page's
     source, tagged the same way;
   - leave a note on the prospect (and application) with every answer and the page URL.
5. Increment the page's submission counter (best effort).

The platform's own CRM notifications (`CRM_PERSON_CREATED`) reach the team's
bell; the Chief of Staff's `daily_brief` lists the week's new inquiries.

## Branding

_Settings → Branding_: institution name, logo URL (https), accent color,
admissions contact email. Falls back to the organization's platform name and
logo. Pages use this, not the app's brand blue.

## Local design work

With the dev server running, `http://localhost:3000/p/__sample__/request-information`
renders a built-in sample page (development only — never in production) so the
public layout can be iterated without an organization.
