# Design: Modernist Redesign of TSV Tennis App (inOpera "Modernist" clone)

**Date:** 2026-08-04
**Branch:** feature/events-signups (worktree at `.worktrees/events-feature`)
**Status:** Approved design, pending implementation plan

## Goal

Transform the TSV Tennis frontend to be an exact visual clone of the inOpera
"Modernist" design language (https://assistente.inoperasrl.com/):

- Cool neutral-gray canvas instead of warm cream
- Red accent (`#ec3013`) instead of orange
- **Archivo** typeface (self-hosted variable woff2), bold/tight-tracked headings
- **Zero border-radius everywhere** (no rounded corners)
- 2px dividers, flat surfaces, subtle shadows

Decisions confirmed with user:
- **Fidelity:** Exact visual clone (gray + red + Archivo + 0 radius).
- **Font:** Self-hosted Archivo (no external/CDN requests).
- **Depth:** Full component redesign in the modernist language — not just token swap.
- **Execution:** Foundation-first, then surface-by-surface (Approach A).

## Reference Design System (source of truth)

From `https://assistente.inoperasrl.com/static/styles.css`:

```
--color-bg: #f3f2f2;
--color-surface: #eae9e9;
--color-text: #201e1d;
--color-accent: #ec3013;
--color-accent-2: #e15b47;
--color-divider: color-mix(in srgb, #201e1d 40%, transparent);

--color-neutral-100: #f8f4f4;  --color-neutral-200: #eae7e7;
--color-neutral-300: #d7d3d3;  --color-neutral-400: #bab6b6;
--color-neutral-500: #9b9797;  --color-neutral-600: #7d7979;
--color-neutral-700: #605d5d;  --color-neutral-800: #444141;
--color-neutral-900: #2d2b2b;

--color-accent-600: #dd2b0f;   --color-accent-700: #ae1800;

--font-heading: "Archivo", system-ui, sans-serif;  /* weight 800 */
--font-body: "Archivo", system-ui, sans-serif;

--radius-sm: 0px; --radius-md: 0px; --radius-lg: 0px;
--shadow-sm: 0 1px 2px color-mix(in srgb, #2d2b2b 14%, transparent);
```

Font: Archivo variable woff2 (weights 400–800), served from `/static/fonts/archivo-latin.woff2`.

## Current Design System (to be replaced)

`tsv-tennis-app/src/index.css` `:root`:
- `--canvas: #f7f7f4`, `--ink: #26251e`, `--primary: #f54e00`,
  `--hairline: #e6e5e0`, `.card-shell { border-radius: 0.75rem }`
- Body font: Inter. Components reference these tokens via
  `var(--primary)`, `var(--canvas)`, `var(--hairline*)`, etc. Most radii are
  applied via Tailwind utilities (`rounded-lg`, `rounded-xl`) directly in JSX.

## Design Sections

### 1. Foundation (global)

**Font.** Download Archivo variable woff2 into
`tsv-tennis-app/public/fonts/archivo-latin.woff2`. Add `@font-face` in
`index.css`:
```css
@font-face {
  font-family: "Archivo";
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url("/fonts/archivo-latin.woff2") format("woff2");
}
```
Update `body { font-family: "Archivo", system-ui, sans-serif; }` and add
heading treatment: `font-weight: 800; letter-spacing: -0.015em;`.

**Tokens.** Replace `:root` block:
```css
--canvas: #f3f2f2;
--canvas-soft: #f8f4f4;
--ink: #201e1d;
--body: #4a4845;
--muted: #7d7979;
--muted-soft: #9b9797;
--hairline: #e4e2e2;
--hairline-soft: #eae7e7;
--hairline-strong: #d7d3d3;
--primary: #ec3013;
--primary-active: #c5260f;
--on-primary: #ffffff;
--success: #1f7a52;
--error: #cf2d56;
```

**Zero radius.** Override Tailwind v4 theme radius variables to `0` inside an
`@theme` block so `rounded-*` utilities produce sharp corners globally:
```css
@theme {
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-xl: 0px;
  --radius-2xl: 0px;
  --radius-3xl: 0px;
  --radius-full: 9999px; /* keep for avatars/pills if any */
}
```
Also set `.card-shell { border-radius: 0; }`.

**Dividers.** Add a `.hr` / divider utility using 2px solid `--hairline-strong`
to replace soft gap-only separation where appropriate.

### 2. Modernist component patterns

- **Cards/panels:** flat, 1px `--hairline` border, 0 radius, no heavy shadow
  (use `--shadow-sm` only if needed). Separate stacked sections with 2px dividers.
- **Buttons:** Archivo; primary = red fill + white text; secondary = hairline
  outline. Map existing `buttonVariants` in `styles/tokens.ts` accordingly.
- **Tables (work-hours):** hairline row separators, bold Archivo column
  headers, no rounded cells, generous row height.
- **Inputs/forms:** sharp corners, 1px `--hairline-strong` border, accent
  focus ring (already present via `:focus-visible`).
- **Modals (`ModalShell`, `MemberSelection`, etc.):** panel radius 0, hairline
  border, backdrop unchanged.

### 3. Surface order (each = its own implementation plan)

1. **Public/auth** — `AuthPageLayout`, `Login`, `ForgotPassword`,
   `ResetPassword`, global nav/footer.
2. **Dashboard shell** — `DashboardShell`, topbar nav, `WorkHoursOverviewCard`.
3. **Events** — `Events`, `EventCard`, `UpcomingEventsList`/`EventRow`,
   `EventFormModal`, `EventSignupModal`, `EventSignupsModal`.
4. **Modals/forms** — `MemberSelection`, `DeleteConfirmDialog`,
   `ArbeitsstundenFormModal`, `MailComposer`.
5. **Work-hours data table** — the dashboard work-hours table.

### 4. Verification

After each surface:
- `cd tsv-tennis-app && npm run lint` (oxlint) must pass.
- `npx tsc --noEmit` must pass.
- `npx vitest run` must stay green.
- Manual class/token review per component (no browser screenshot available in
  this environment; rely on existing component tests + careful review of
  Tailwind class usage and token references).

## Out of scope

- Backend changes (only frontend styling).
- New features or layout rethinking beyond visual/structural modernist restyle.
- Logo/brand asset changes (TSV Tennis logo stays; only color context changes).

## Risks

- Some components may use hardcoded hex values instead of tokens — these need
  auditing per surface and replaced with the new tokens.
- Tailwind v4 `@theme` radius override must be verified to actually zero out
  `rounded-*` utilities (fallback: explicit `border-radius: 0` base style on
  card/panel/button classes).
- Archivo licensing: must be the open-source SIL OFL licensed Archivo font for
  self-hosting.
