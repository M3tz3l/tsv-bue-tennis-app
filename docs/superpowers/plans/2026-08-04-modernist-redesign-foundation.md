# Modernist Redesign — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the global "Modernist" design foundation — self-hosted Archivo font, inOpera gray/red token palette, zero border-radius everywhere, and a 2px divider utility — so every existing component instantly inherits the new look.

**Architecture:** Change only global CSS (`src/index.css`) plus add a self-hosted font asset. Radius is zeroed via Tailwind v4 `@theme` overrides (so existing `rounded-*` utilities in JSX collapse to square) plus an explicit `border-radius: 0` on the `.card-shell` class. No component JSX changes in this plan — those are later surface plans.

**Tech Stack:** React + Vite, Tailwind CSS v4.1.11 (`@tailwindcss/postcss`), TypeScript, Vitest.

## Global Constraints

- Frontend-only change; no backend modifications.
- Exact visual clone of inOpera "Modernist": canvas `#f3f2f2`, accent `#ec3013`, Archivo font, `border-radius: 0` everywhere.
- Font must be **self-hosted** (no Google Fonts / external requests). Use the exact woff2 from the reference site.
- Preserve existing CSS custom-property names (`--primary`, `--canvas`, `--hairline*`, etc.) so component code keeps working unchanged.
- Keep `--radius-full` available (avatars/pills) — only zero the sm/md/lg/xl/2xl/3xl scale.

## File Structure

- `tsv-tennis-app/public/fonts/archivo-latin.woff2` — **Create**: the self-hosted Archivo variable font (downloaded from reference).
- `tsv-tennis-app/src/index.css` — **Modify**: add `@font-face`, replace `:root` tokens, add `@theme` radius overrides, update `body` font + heading treatment, change `.card-shell` radius to 0, add `.hr` divider utility.
- `tsv-tennis-app/src/styles/theme.test.ts` — **Create**: regression test asserting the foundation tokens/font/radius are present in `src/index.css` and the font file exists.

---

### Task 1: Self-host the Archivo font

**Files:**
- Create: `tsv-tennis-app/public/fonts/archivo-latin.woff2`
- Create: `tsv-tennis-app/src/styles/theme.test.ts`
- Modify: `tsv-tennis-app/src/index.css` (add `@font-face`)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `public/fonts/archivo-latin.woff2` asset served at `/fonts/archivo-latin.woff2`; `@font-face` declaration `font-family: "Archivo"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/styles/theme.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname === .../tsv-tennis-app/src/styles  =>  repoRoot === .../tsv-tennis-app
const repoRoot = resolve(__dirname, '..', '..');
const cssPath = resolve(repoRoot, 'src', 'index.css');
const fontPath = resolve(repoRoot, 'public', 'fonts', 'archivo-latin.woff2');
const css = () => readFileSync(cssPath, 'utf-8');

describe('modernist foundation', () => {
  it('ships the self-hosted Archivo woff2', () => {
    expect(existsSync(fontPath)).toBe(true);
  });

  it('declares the Archivo @font-face', () => {
    const styles = css();
    expect(styles).toContain('@font-face');
    expect(styles).toContain('font-family: "Archivo"');
    expect(styles).toContain('/fonts/archivo-latin.woff2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: FAIL — font file missing and `@font-face` not present.

- [ ] **Step 3: Download the font and add the @font-face**

Download the exact reference font:
```bash
mkdir -p tsv-tennis-app/public/fonts
curl -fsSL https://assistente.inoperasrl.com/static/fonts/archivo-latin.woff2 -o tsv-tennis-app/public/fonts/archivo-latin.woff2
```
Append to the top of `tsv-tennis-app/src/index.css` (after the `@import "tailwindcss";` line):
```css
@font-face {
  font-family: "Archivo";
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url("/fonts/archivo-latin.woff2") format("woff2");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: PASS (both font-exists and @font-face assertions).

- [ ] **Step 5: Commit**

```bash
git add tsv-tennis-app/public/fonts/archivo-latin.woff2 tsv-tennis-app/src/index.css tsv-tennis-app/src/styles/theme.test.ts
git commit -m "feat(styles): self-host Archivo variable font"
```

---

### Task 2: Replace the design tokens with the inOpera palette

**Files:**
- Modify: `tsv-tennis-app/src/index.css` (`:root` block)
- Modify: `tsv-tennis-app/src/styles/theme.test.ts` (add token assertions)

**Interfaces:**
- Consumes: `src/index.css` from Task 1 (Archivo `@font-face` present).
- Produces: new `:root` token values used by all components.

- [ ] **Step 1: Add failing token assertions**

Append inside the existing `describe('modernist foundation', ...)` block in `src/styles/theme.test.ts`:
```ts
  it('uses the inOpera gray/red token palette', () => {
    const styles = css();
    expect(styles).toContain('--canvas: #f3f2f2');
    expect(styles).toContain('--ink: #201e1d');
    expect(styles).toContain('--primary: #ec3013');
    expect(styles).toContain('--primary-active: #c5260f');
    expect(styles).toContain('--hairline: #e4e2e2');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: FAIL on the new palette assertions (still has old `#f7f7f4` / `#f54e00`).

- [ ] **Step 3: Replace the `:root` block**

In `tsv-tennis-app/src/index.css`, replace the existing `:root { ... }` block (currently warm-cream tokens) with:
```css
:root {
  /* inOpera "Modernist" design tokens — cool gray canvas, red voltage, sharp corners */
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsv-tennis-app/src/index.css tsv-tennis-app/src/styles/theme.test.ts
git commit -m "feat(styles): swap tokens to inOpera gray/red palette"
```

---

### Task 3: Zero out all border radii

**Files:**
- Modify: `tsv-tennis-app/src/index.css` (`@theme` block + `.card-shell`)
- Modify: `tsv-tennis-app/src/styles/theme.test.ts` (add radius assertions)

**Interfaces:**
- Consumes: Tailwind v4 via `@tailwindcss/postcss` (PostCSS config already set).
- Produces: `rounded-*` utilities resolve to 0; `.card-shell` has `border-radius: 0`.

- [ ] **Step 1: Add failing radius assertions**

Append to `src/styles/theme.test.ts`:
```ts
  it('zeroes all border radii (sharp corners)', () => {
    const styles = css();
    expect(styles).toContain('@theme');
    expect(styles).toMatch(/--radius-md:\s*0px/);
    expect(styles).toMatch(/\.card-shell\s*\{[^}]*border-radius:\s*0/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: FAIL — no `@theme` block, `.card-shell` still `0.75rem`.

- [ ] **Step 3: Add `@theme` radius override and fix `.card-shell`**

In `tsv-tennis-app/src/index.css`, add an `@theme` block (place it right after the `@import "tailwindcss";` line, before `:root`):
```css
@theme {
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-xl: 0px;
  --radius-2xl: 0px;
  --radius-3xl: 0px;
  /* --radius-full intentionally left for avatars/pills */
}
```
Change the existing `.card-shell` rule from `border-radius: 0.75rem;` to `border-radius: 0;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsv-tennis-app/src/index.css tsv-tennis-app/src/styles/theme.test.ts
git commit -m "feat(styles): zero border-radius globally via Tailwind @theme"
```

---

### Task 4: Body/heading typography + divider utility

**Files:**
- Modify: `tsv-tennis-app/src/index.css` (`body` font-family, heading rule, add `.hr`)
- Modify: `tsv-tennis-app/src/styles/theme.test.ts` (add typography assertions)

**Interfaces:**
- Consumes: Archivo `@font-face` from Task 1.
- Produces: `body` uses Archivo; headings weight 800 with tight tracking; `.hr` 2px divider utility available for later surfaces.

- [ ] **Step 1: Add failing typography assertions**

Append to `src/styles/theme.test.ts`:
```ts
  it('sets Archivo as the body font and a bold modernist heading style', () => {
    const styles = css();
    expect(styles).toMatch(/body\s*\{[^}]*font-family:\s*"Archivo"/);
    expect(styles).toMatch(/font-weight:\s*800/);
    expect(styles).toMatch(/letter-spacing:\s*-0\.015em/);
  });

  it('provides a 2px divider utility', () => {
    const styles = css();
    expect(styles).toMatch(/\.hr\s*\{[^}]*border:\s*0/);
    expect(styles).toMatch(/\.hr\s*\{[^}]*height:\s*2px/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: FAIL — body still uses Inter; no `.hr` rule.

- [ ] **Step 3: Update body font, add heading rule and `.hr`**

In `tsv-tennis-app/src/index.css`, update the `body` rule:
```css
body {
  overflow-x: hidden;
  background-color: var(--canvas);
  color: var(--ink);
  font-family: "Archivo", system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```
Add after the `body` rule (or near the other element rules):
```css
h1, h2, h3, h4, h5, h6 {
  font-family: "Archivo", system-ui, sans-serif;
  font-weight: 800;
  letter-spacing: -0.015em;
  line-height: 1.12;
  margin: 0 0 0.5rem;
}

.hr {
  height: 2px;
  border: 0;
  margin: 1rem 0;
  background: var(--hairline-strong);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tsv-tennis-app && npx vitest run src/styles/theme.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tsv-tennis-app/src/index.css tsv-tennis-app/src/styles/theme.test.ts
git commit -m "feat(styles): Archivo body/heading typography + .hr divider"
```

---

### Task 5: Full verification gate

**Files:** none new; verify the whole app still builds and tests pass.

**Interfaces:**
- Consumes: all prior tasks.

- [ ] **Step 1: Run lint**

Run: `cd tsv-tennis-app && npm run lint`
Expected: no errors (warnings about other pre-existing files are acceptable; none introduced by this plan).

- [ ] **Step 2: Run typecheck**

Run: `cd tsv-tennis-app && npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Run the full test suite**

Run: `cd tsv-tennis-app && npx vitest run`
Expected: all tests PASS (the new `theme.test.ts` plus existing component tests).

- [ ] **Step 4: Commit (if any drift)**

If `npm run lint`/`tsc`/`vitest` required no further changes, no commit needed. If any fix was required, commit it:
```bash
git add -A
git commit -m "chore(styles): foundation verification fixes"
```
