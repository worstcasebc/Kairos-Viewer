// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { CSP, createWebServer, resolveSafe } from '../scripts/serve-web.mjs';

describe('resolveSafe', () => {
  const root = join(tmpdir(), 'kv-root');
  test('liefert Dateien unterhalb der Wurzel, / wird zu index.html', () => {
    expect(resolveSafe(root, '/')).toBe(join(root, 'index.html'));
    expect(resolveSafe(root, '/assets/a.js?v=1')).toBe(join(root, 'assets/a.js'));
  });
  test('weist Pfad-Traversal ab', () => {
    expect(resolveSafe(root, '/../etc/passwd')).toBeNull();
    expect(resolveSafe(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveSafe(root, '/%E0%A4%A')).toBeNull();
  });
});

describe('createWebServer', () => {
  let base = '';
  const server = (() => {
    const dir = mkdtempSync(join(tmpdir(), 'kv-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>');
    writeFileSync(join(dir, 'assets', 'app-1234.js'), 'console.log(1)');
    return createWebServer(dir);
  })();
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test('liefert HTML mit allen Sicherheits-Headern', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    expect(CSP).toContain("connect-src 'none'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  test('Assets langlebig gecacht, unbekannte Pfade 404, andere Methoden 405', async () => {
    expect((await fetch(`${base}/assets/app-1234.js`)).headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await fetch(`${base}/fehlt.html`)).status).toBe(404);
    const post = await fetch(`${base}/`, { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
  });
});
