# Featureflex agent guide

Audience: AI coding agents working on CloudVerse services (frontend, Budget, BFF, Driver, Notification, platform-iam, and any service added later).
Status: standard release method for qualifying features from 10 Nov 2026. Read this in full before designing, implementing, reviewing, or rolling out a customer-visible change.

## 1. Purpose

Every qualifying feature must ship **dark**: the code can be deployed to test and production, but it is unusable until a human deliberately enables it. This is done with the existing **tenant features** system in platform-iam. It must NOT be done with new environment variables.

Examples of features this covers: a new module (unit economics, SaaS license management, automation hub), a new version of an existing screen or workflow (Budgeting v2), a change in how calculations, alerts or automations behave. Names in this document are examples of style, not a list of approved flags.

## 2. Does this work need a flag?

**Needs a flag**
- A new module or capability.
- A new version of a screen or workflow customers already use.
- A change in how calculations, alerts, notifications or automations behave.
- Anything customers would notice and that may need to be pulled back quickly.

**Usually no flag** (the product manager decides when in doubt; ask rather than guess)
- Bug fixes.
- Internal refactoring with no visible change.
- Wording, spelling or small styling fixes.
- Changes only internal staff can see.

If you are unsure, ask. Do not skip the flag silently, and do not add one silently to trivial changes.

## 3. Hard rules (never break these)

1. **Never add a new environment variable to gate a feature.** The system uses exactly two existing variables, and that number must not grow:
   - Frontend: `NEXT_PUBLIC_TENANT_FEATURES_ENABLED` (turns the tenant-features system on)
   - Backends: `PLATFORM_IAM_BASE_URL` (where platform-iam lives)
2. **Never decide by environment name.** No `if (env === "test")`, no `NODE_ENV` checks, no hostname checks. Test vs production is controlled only by flag data in each environment's own IAM database.
3. **New flags are strict (fail-closed).** The feature is allowed ONLY when IAM explicitly answers "enabled" for that organisation. Treat all of these as OFF: unknown feature, IAM unreachable, timeout, error response, malformed response, master switch off.
4. **Gate in every layer, not just the UI.** Hiding a menu item is not enough. API endpoints, BFF routes, background jobs, automations and notifications must check the flag too.
5. **One flag per feature, shared by every service involved.** Never create one flag per service.
6. **Never change a Production flag yourself.** Prepare the change and the runbook. Product approves the cohort. DevOps executes and records Production enablement and flag rollback.
7. **Never set a new flag to default-on** in the catalog unless a human explicitly instructs it as part of a general release.

## 4. How the system works (mental model)

- platform-iam holds a **catalog** (list of known features, each with a default) and a **per-organisation status table** (enabled/disabled per feature per organisation).
- Services ask IAM at runtime: "Is feature X enabled for organisation Y?" Answers are cached about 60 seconds per service.
- Test and production each have their **own IAM database**. Enabling a flag in test data does not affect production. (DevOps must confirm this. Do not add an environment column unless a human tells you separation is not in place.)
- Existing module flags (for example "budgets") decide whether a customer sees a module at all and stay as they are.
- Changing a flag's status is a **data change, not a deployment.**

## 5. Choose the pattern

| | Pattern A: new capability | Pattern B: new version |
|---|---|---|
| When | Nothing like it exists today | Replaces something customers already use |
| Flag does | Hides the whole feature: menu items, pages, API, jobs | Chooses old vs new inside a module the customer already has |
| Existing module flag | Not applicable | Stays unchanged and still decides whether the module is visible |
| When OFF | Customer sees nothing | Customer sees the current behaviour exactly as today |
| Example | `unit-economics`, `saas-license-management`, `automation-hub` | `budgeting-v2` |

State the chosen pattern in your PR description.

### Naming
- lower-case kebab-case that describes the feature: `unit-economics`, `budgeting-v2`.
- One flag per feature. If parts of a feature must be released at different times, agree the split with the PM first and treat each part as its own feature with its own flag.
- If the feature depends on another feature (for example it needs budgets), both must be on. Keep the existing flag; the new flag covers only the new part.

## 6. Before you write code: discover the existing patterns

Do not invent file names or APIs. Locate and follow what already exists:

- [ ] In platform-iam: find the feature catalog and how an existing optional feature (for example "budgets") is declared (default, self-service setting, locked-on option).
- [ ] In platform-iam: find the per-organisation status table, its migrations, and the read/update endpoints.
- [ ] In Driver: find the existing feature guard and the small IAM client (it caches answers about 60 seconds). Reuse these in every service. Do not write a second client.
- [ ] In the frontend: find where organisation features are loaded and how existing modules hide menu items and block pages.
- [ ] Check whether the catalog supports a strict/fail-closed attribute. If not, add it as a **per-feature property** (so every future release flag can use it), not a one-off special case for one feature. If it already exists, use it.

If any of these cannot be found, stop and report what is missing. Do not guess.

## 7. Implementing a feature behind a flag

### Step 1: Add the catalog entry in platform-iam
One entry per feature with these properties:
- Default: **off**
- Customer admin can change it: **no** (not self-service; internal team only)
- Fail mode: **strict (fail-closed)**
- Type: **release flag (temporary)**. Use "entitlement (permanent)" only if the PM says this is a permanent customer-facing module.
- Owner and remove-by date: record in catalog metadata if supported, and in the feature register and PR description.
- The flag must NOT appear in any customer-facing settings, module, or billing list.

### Step 2: Gate every layer

**Frontend**
- Decide at **request time on the server**, per organisation. No rebuild is needed to toggle.
- Pages must be rendered dynamically. Do not statically generate or CDN-cache a page whose content depends on the flag, or one customer's setting can leak to another.
- Apply the strict rule: show the feature only if IAM clearly says enabled.
- Pattern A: hide menu items, routes and pages completely. Pattern B: render old or new version.

**Backend services (any service the feature touches)**
- Check the flag on **every request** to new endpoints, using the shared guard and client.
- When off, respond as if the endpoint does not exist (**404**), not "forbidden".
- If a service did not previously read tenant features, add the existing Driver client and guard. Keep timeouts short and treat IAM failure as OFF.
- If the new code was previously loaded only when a startup setting was on, change it to **always load the code and check per request.** First confirm nothing in that code runs at import or startup (queue consumers, schedulers, connections, route registration with side effects). Anything like that must itself be gated.

**Background jobs, automations, alerts and notifications**
- Check the flag **per organisation, each time the job runs**, not once at startup.
- Do not enqueue new work for organisations where the flag is off. For work already queued, re-check at execution time and skip if off.

**Database**
- Migrations run on deploy regardless of the flag. They must be **backward compatible**: old code must keep working against the new schema (add columns/tables; do not drop or rename in the same release).
- Define what happens to data created while the flag was on if it is turned off again. Turning off must never lose data or break the old experience.

**Audience that is not a customer organisation** (for example partners or internal staff)
- Confirm with a human how the flag should be evaluated for that audience before building. Do not guess.

### Step 3: Tests (required in the PR)
- [ ] Flag off by default: the feature is not reachable (UI, API, jobs).
- [ ] IAM unreachable / timeout / error: treated as off.
- [ ] Unknown feature name: treated as off.
- [ ] Master switch off: feature is off.
- [ ] Organisation A enabled, organisation B not: B is unaffected.
- [ ] Turning off takes effect after the cache window (about 60 seconds).
- [ ] Direct API call to a new endpoint with the flag off returns 404.
- [ ] Existing features still behave as before (non-strict behaviour unchanged).

## 8. Making it visible in TEST only

After the code merges to `main`, record the image digest deployed to Test and validate that exact build. Confirm with DevOps that Test and Production use separate IAM databases before changing Test flag data.

1. Confirm the catalog entry exists in the **test** IAM (deployed there).
2. Set the flag's status to **enabled for the test organisation only**, in the **test IAM database**, using the documented procedure (admin action if one exists, otherwise a reviewed SQL update). Look up the real table and column names in the code; do not copy placeholders blindly.

   Template (verify names before use):
   ```sql
   -- TEST DATABASE ONLY
   -- set <feature-flag> = enabled for <test_org_id>
   ```
3. Wait up to about 60 seconds for caches.
4. Verify: the test organisation sees the feature; a different organisation in test does not (Pattern A) or still sees the old version (Pattern B).
5. Turn the flag off for the Test organisation and verify the OFF behaviour after the cache window. Check any affected queued work and data created while the flag was on.
6. Record the digest, Test organisations, results, and any gaps in the release record. Link it from the PR. Required validation must pass before promotion.

If you cannot confirm that test and production IAM use separate databases, **stop and ask a human** before changing any data.

## 9. Production promotion and feature enablement

The release manager approves promotion of the same image digest validated in Test. Promote with the flag OFF. Once the code and catalog entry are live, Product approves the pilot cohort and DevOps executes and records the flag change.

**Preconditions for enablement (all must be true)**
- [ ] The feature passed testing in test with the flag enabled.
- [ ] Production has the catalog entry (deployed with the code) and the flag is off.
- [ ] `NEXT_PUBLIC_TENANT_FEATURES_ENABLED` and `PLATFORM_IAM_BASE_URL` are confirmed set in production for all relevant services (DevOps). If the master switch was previously off in production, regression-test existing features first, because enabling it can change how existing modules are filtered.
- [ ] The production IAM database is confirmed separate from test.
- [ ] Flag rollback was verified in Test after the cache window. The runbook explains how to handle data and queued work created while the flag was on.
- [ ] Product has approved the cohort.

**Rollout stages**
Tenant flag data changes can take effect without a deployment once the code and catalog entry are live.
1. **Pilot:** enable the flag for one or two named production organisations. Record who, when, and which organisations.
2. **Observe:** check errors, performance and customer feedback for the agreed period.
3. **General release:** Product approves the approach. A bulk status update is a tenant data change. Changing the catalog default to ON requires a separate approved IAM release.
4. **Flag rollback:** DevOps sets the flag to OFF for the affected organisations and verifies the OFF behaviour after the cache window. If the artifact itself needs rolling back, follow the [release process](./release-process.md#rollback) to redeploy the previous known-good digest.

Every production change must be traceable (ticket, who, when, what). If no audited admin action exists yet, use a reviewed script attached to a ticket. Do not run ad hoc SQL against production.

## 10. How a flag ends (required, do not skip)

A release flag is temporary. When the feature is fully released and stable, the PM chooses one ending:

1. **Released to everyone:** remove all flag checks and the old code path in every layer, remove the catalog entry, and clean up the status rows.
2. **Becomes a permanent module:** if the feature will be optional or sold per customer, convert the flag into a permanent customer-facing entitlement (like "budgets" today). Do this only on an explicit PM decision.

Never leave a release flag in limbo. Flag sprawl in the catalog is the same problem as environment variable sprawl. Open the cleanup ticket when the flag is introduced.

## 11. Feature register

The PM owns a simple register of every flag. When you add or change a flag, supply the row for the PM to record:

| Flag | Pattern (A/B) | Owner | Test | Production | Remove by |
|---|---|---|---|---|---|
| `<feature-flag>` | A or B | name | OFF/ON | OFF/Pilot/ON | date |

Where the register lives is still to be decided. Until then, put the row in the PR description.

## 12. Pull request checklist

- [ ] No new environment variables added.
- [ ] Pattern (A or B) stated.
- [ ] One catalog entry: default off, not self-service, strict, release flag, owner and remove-by recorded.
- [ ] Frontend decides at request time and is not statically cached.
- [ ] Backend endpoints return 404 when off; jobs and automations check per organisation each run.
- [ ] No startup side effects introduced by always-loaded code.
- [ ] Migrations are backward compatible.
- [ ] All tests in section 7 step 3 are included and passing.
- [ ] PR description includes the register row, Test validation plan, pilot cohort plan, rollback steps, and cleanup ticket link. Link the release record with actual Test results once available.

## 13. When to stop and ask a human

- You cannot find the existing catalog, guard, or client.
- You cannot confirm test and production IAM databases are separate.
- The change would add an environment variable.
- The master switch is off in an environment you need and you are unsure of the impact.
- The audience is not a customer organisation.
- You are unsure whether the work needs a flag, or whether it is Pattern A or B.
- Anything requires changing production data or setting the default to on.

## 14. Open items (decisions pending, do not assume)

- How production flags are changed with an audit trail (admin action vs reviewed script): pending the PM and DevOps.
- How to enable for all customers at once (bulk update vs default to on): pending the PM.
- Confirmation from DevOps of current variable values and database separation.
- Where the feature register lives and who maintains it.
