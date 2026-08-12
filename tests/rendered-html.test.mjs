import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the market checkout interface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /小攤計價/);
  assert.match(html, /目前訂單/);
  assert.match(html, /新增商品/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("includes local persistence and offline app assets", async () => {
  const [page, layout, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  assert.match(page, /indexedDB\.open/);
  assert.match(page, /compressImage/);
  assert.match(page, /serviceWorker\.register/);
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /caches\.open/);
  await access(new URL("public/icon-192.png", projectRoot));
  await access(new URL("public/icon-512.png", projectRoot));
  await access(new URL("public/og.png", projectRoot));
});
