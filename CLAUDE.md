# ClearStand — working instructions

Read this before doing anything in this repository.

---

## Who you're working with

Taylor Hamilton, sole founder. **Not a coder.** Twenty-five years in
Canadian law enforcement. He has strong, well-founded opinions about
legal accuracy and Canadian criminal and family procedure — defer to him
on law, and explain your reasoning on code.

Write for someone who understands the domain deeply and the tooling
lightly. No unexplained jargon. When something goes wrong, say plainly
what broke and what to do about it.

---

## The single most important rule

**One change at a time. Confirmed working before the next one starts.**

A previous session pushed several files at once and caused hours of
production downtime. Do not batch unrelated changes. Do not "while I'm
in here" a second fix into an unrelated edit.

If a task genuinely needs multiple files, say so up front, then do them
in dependency order and stop between each for confirmation.

---

## Before you change anything

1. **Read the actual file.** Never work from memory of what a file
   "probably" contains. Files in this project have repeatedly turned out
   to be several versions behind assumptions.
2. **Check for related call sites.** Editing a `db/index.js` function
   means finding everything that calls it.
3. **State what you're about to change and why**, then wait.

## After you change anything

1. `node --check <file>` on every JavaScript file touched.
2. For HTML with inline `<script>`, extract the script block and
   `node --check` it separately. A syntax error there fails silently in
   the browser and takes the page down with no server-side error.
3. Show the diff. Explain what changed in plain language.
4. Do not commit or push until Taylor confirms.

---

## Project structure

```
server/                  Node.js / Express backend
  index.js               App entry, middleware order, routes, static
  beta-gate.js           HTTP Basic Auth gate (see landmines)
  db/index.js            SQLite via better-sqlite3 — 31 tables
  routes/                auth, billing, criminal-chat, family-chat,
                         analyze, family-analyze, admin, conversations,
                         profile, forms, dictation, onboarding
  middleware/auth.js     JWT verification, sessions, IP logging
  utils/                 email, dates, canlii
  config/                onboarding
public-criminal/         Criminal frontend + all marketing pages
public-family/           Family frontend
```

Note: the backend folder is `server/`, not `src/`.

**`case-profile.html` lives in `public-criminal/`** and serves both
products through product-aware routing. It is not duplicated.

---

## Deployment

- Railway, auto-deploys from the `master` branch on GitHub
- `nixpacks.toml` specifies `npm install`
- `package-lock.json` is deliberately absent so Railway uses
  `npm install`, not `npm ci`. **Do not add it back.**
- Railway sometimes serves a stale container after deploy; a manual
  container restart is part of the normal deploy routine
- Locally, `npm install --ignore-scripts` is required — `better-sqlite3`
  native compilation fails on this Windows machine. Railway's Linux
  builders handle it fine.

Commit messages: plain description of the one thing that changed.

---

## Landmines — read these before touching related code

**`public-criminal/app.html` has a fake `</head>`** at roughly line 2667,
inside a JavaScript template literal. The real one is near line 452.
Naive HTML parsing will corrupt this file.

**Do not rename `lexself.db` or change `DB_PATH`.** The live database on
Railway's persistent volume is `/app/data/lexself.db`. Renaming it makes
the app create a fresh empty database and every user's data appears to
vanish. The name is legacy — the company was briefly called LexSelf —
and it is invisible to users. Leave it.

**`Authorization` header collisions.** HTTP Basic Auth (beta gate, admin
routes) and the app's JWT both use this header. Any new middleware that
inspects it must account for both. This has caused two separate outages.

**Never mount authentication middleware in front of `/.well-known/`.**
Let's Encrypt validates certificate renewals there and cannot send
credentials. Blocking it makes certificates silently fail to renew and
the site goes down 60 days later with no warning. This already happened.

**HSTS `preload` must stay `false`** in `server/index.js` until the apex
domain certificate is proven stable. With preload on, browsers refuse to
offer any bypass when a certificate is wrong — a routine expiry becomes a
total lockout.

**Button IDs** — criminal app: `sBtn`, `ci`, `aBtn`, `aBtnTxt`.
Family app: `sBtn`, `ci`.

**Onboarding is currently broken.** `routes/auth.js` and
`routes/onboarding.js` import `getOnboardingState`,
`markOnboardingStepComplete`, `setOnboardingDismissed`, and
`computeOnboardingStatus` from `../db`. None of those functions exist in
`db/index.js`. The `/me` route catches the error, so onboarding silently
never renders. The route layer shipped; the database layer did not.

**`billing.js` defines `router.post('/portal')` twice** — around lines 276
and 537. Express uses the first. The second is dead code.

---

## Account deletion

`deleteUserAccount()` in `db/index.js` deletes explicitly from every
user-linked table rather than relying on `ON DELETE CASCADE`, because
three tables do not cascade:

- `api_usage` has no foreign key at all
- `clearsplit_agreements` references `users(id)` with no `ON DELETE`
  action, so a naive delete throws a foreign-key error and aborts
- `conversation_messages` links via `conversation_id`, not `user_id`

**Any new table that stores user data must be added to
`USER_DATA_TABLES`** or it will silently survive account deletion — and
the product's own deletion promise becomes false.

---

## Open compliance work

These are known problems, in priority order. Do not treat them as done.

1. **The Privacy Policy states that personally identifying information is
   not sent to Anthropic. It is.** `criminal-chat.js` and
   `family-chat.js` inject name, DOB, address, phone, email, bail
   conditions, prior record, Indigenous status, charges, other parties,
   and (family) children's names and dates of birth into the system
   prompt on every turn. Tokenisation is the planned fix.
2. **`deleteConversation()` is a soft delete.** It sets `deleted_at` and
   leaves every message row in place.
3. **`family-analyze.js` logs analysis content** in its JSON parse error
   handler, putting case-derived text into Railway logs.
4. **CanLII citation verification** is built (`utils/canlii.js`) but the
   API key is returning `ACCESS_DENIED` pending CanLII support. Parts 2
   and 3 — wiring it into analysis output and displaying it — are not
   started.

---

## Product constraints — do not violate

- **Never use the word "unlimited"** anywhere user-facing. Hard caps
  exist to protect margin. Analysis packs are the overage mechanism.
- **No numeric outcome probabilities.** Qualitative and traffic-light
  assessments only. This is a deliberate legal-exposure decision.
- **IP flagging and session limits are alert-only.** Never add automatic
  suspension — false positives would lock out paying users.
- Model IDs are pinned per route. Do not change them without being asked.

---

## Tone

Direct. No preamble, no filler, no restating the request back. If
something is a bad idea, say so and why. If you are uncertain, say you
are uncertain rather than guessing — guessing has cost real downtime on
this project.
