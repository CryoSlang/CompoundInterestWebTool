# Deployment Guidelines

Use this checklist for every release to GitHub Pages.

## 1) Pre-Release Safety

- Confirm no private/sensitive files are in the repo (`git status`, `git ls-files`).
- Confirm no secrets or tokens are present in code or docs.
- Confirm commit author email is safe for public history (prefer GitHub noreply address).

## 2) Versioning

- Bump `APP_VERSION` in `app.js` before release.
- Use semantic intent:
  - Patch (`vX.Y.Z` -> `vX.Y.Z+1`) for bug fixes
  - Minor (`vX.Y.0` -> `vX.(Y+1).0`) for new features
  - Major (`vX.0.0` -> `v(X+1).0.0`) for breaking changes
- Ensure version stamp renders correctly in the UI header.

## 3) Functional Validation (Local)

- Run the app locally and verify:
  - Real/Nominal toggle updates summary, chart, and table.
  - Summary values are coherent (today-dollar and actual-dollar invested totals).
  - Chart is fully visible on mobile and desktop (no forced horizontal scroll).
  - Mobile table scenario selector shows exactly one selected rate column.
  - Milestone visuals behave correctly (heatmap + first-crossing markers).
  - CSV download and copy-share link work.

## 4) Calculation Sanity Check

- Recheck baseline assumptions:
  - Default inputs should produce expected real outputs for 5/10/15/20%.
  - Nominal outputs should be inflation-adjusted counterparts in the chosen mode.

## 5) Commit and Push

- Stage only intended files.
- Use clear commit message explaining why the release is needed.
- Push to `main`.

## 6) GitHub Pages Verification

- Confirm latest Pages build is successful and references the latest commit.
- Open live URL and verify:
  - Version stamp matches new release version
  - Key features reflect expected behavior

## 7) Cache/Embed Notes

- If update is not visible immediately, use hard refresh or cache-busting query string.
- If embedded in WordPress, cache-bust iframe `src` as needed (example: `?v=1.3.0`).
