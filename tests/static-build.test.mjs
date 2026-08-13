import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds a GitHub Pages app under /countsite/", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /\/countsite\/assets\//);
  assert.match(html, /\.\/manifest\.webmanifest/);
  assert.match(html, /<html lang="zh-Hant">/);
});

test("ships installable, offline, device-local assets", async () => {
  const [manifestText, serviceWorker, page] = await Promise.all([
    readFile(new URL("../dist/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../dist/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.match(serviceWorker, /self\.registration\.scope/);
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /import\.meta\.env\.BASE_URL/);
  assert.match(page, /writeLocal\("orders", orders\)/);
  assert.match(page, /function submitOrder\(\)/);
  assert.match(page, /訂單管理/);
  assert.match(page, /作廢訂單/);
  assert.match(page, /永久刪除/);
  await access(new URL("../dist/icon-192.png", import.meta.url));
  await access(new URL("../dist/icon-512.png", import.meta.url));
});
