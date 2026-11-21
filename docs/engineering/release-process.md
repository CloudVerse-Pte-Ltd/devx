# Release process (one page)

Source policy: CloudVerse Controlled Release Process v2.1 (29 Oct 2026).

## Normal path
| Step | What happens | Evidence |
|---|---|---|
| 1. PR to `main` | Review + required checks | PR, merge SHA |
| 2. Build once | One immutable image, tagged with commit SHA | digest, SBOM/provenance |
| 3. Deploy to Test | Test manifest updated, Argo CD syncs | deployed digest |
| 4. Validate | Smoke, integration, regression as required | result against that digest |
| 5. Approve | Authorized approver, protected GitHub Environment | approver, time |
| 6. Promote | Production manifest gets the *same digest*. No rebuild | matching digests |
| 7. Verify | Argo CD healthy, smoke/SLO check | release record |

Any failure stops promotion. Approval never overrides a failed validation. If a newer `main` build replaces the candidate in Test, redeploy and re-validate the chosen digest before approving.

## `main` vs `production`
`main` may be ahead of `production`. `production` must never contain commits that are not in `main`. Where the `production` branch still exists it is an automation-only pointer, moved to the exact promoted `main` SHA after a healthy deploy. Nobody develops on it.

## Incomplete features
- Safe to ship disabled → merge to `main` behind a server-side flag, OFF in Production. A flag hides behaviour, not code.
- Code must not be in Production at all → leave on the feature branch, deploy to an isolated preview environment, merge only when ready.

## Hotfix
Active incident only. Ticket + approver. Smallest fix. PR into `main`, targeted tests, Test deploy, approve, promote the validated digest. If Production was changed first, the merge-back PR to `main` is opened at once and blocks further releases until merged. Forbidden even in an emergency: undocumented direct push, mutable tag, unrecorded artifact, skipping merge-back.

## Rollback
Redeploy the previous known-good digest and record from/to digest, reason and approver. Never rebuild old source.
