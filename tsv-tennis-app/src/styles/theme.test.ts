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
