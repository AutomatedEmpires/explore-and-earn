# GitHub Templates (to be added under `.github/` by a human)

> **Why this lives in docs:** the agent integration cannot write under `.github/` (403 "Resource not accessible by integration"). These templates are mirrored here so they can be copied into place by a human or via `gh` locally. See also `ci-skeleton.md` for the workflow file.

## `.github/pull_request_template.md`

```markdown
## What & why

<!-- What does this PR change, and why? Link the Notion canon page or docs/ source. -->

## Source of truth

- Canon:
- Build pack / issue:

## Type

- [ ] Control plane (docs, agent context, source-of-truth, scaffolding)
- [ ] Design system
- [ ] Feature (scoped + approved build pack)
- [ ] Fix
- [ ] Chore / tooling

## Founder approval gates

- [ ] Money / billing
- [ ] Auth / security
- [ ] Database destructive change or final migration
- [ ] Legal / trust / safety
- [ ] Major product philosophy change
- [ ] Public launch / deploy
- [ ] Paid asset licensing
- [ ] None of the above

## Design drift checklist (if UI is touched)

- [ ] Semantic tokens only (no raw hex / px type / ad-hoc radius)
- [ ] Icons via the Streamline Freehand registry only (G30)
- [ ] Reuses existing packages/ui primitives where possible
- [ ] Borders-first; shadows only on overlays
- [ ] Photos framed, never filtered
- [ ] Triad intact; Verified Host badge present where applicable (G22)
- [ ] No color-only status

## Handoff

- Done:
- Artifact updated:
- Next agent / step:

## Not in scope

<!-- Confirm no out-of-scope work unless approved above. -->
```

## `.github/ISSUE_TEMPLATE/config.yml`

```yaml
blank_issues_enabled: false
contact_links:
  - name: Source of truth map
    url: https://github.com/AutomatedEmpires/explore-and-earn/blob/main/docs/source-of-truth/source-of-truth-map.md
    about: How Notion (product truth) and GitHub (implementation truth) relate.
```

## `.github/ISSUE_TEMPLATE/build-pack.md`, `design-task.md`, `bug.md`

Use the build-pack, design-task, and bug templates described in `docs/sprint-zero/sprint-zero-build-pack.md` and the drift checklist in `docs/design/design-drift-prevention.md`. Each should capture: goal, source-of-truth links, scope, acceptance criteria, design constraints (G30/G22), approval gates, and handoff.
