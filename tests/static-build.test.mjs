import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function readPngSize(url) {
  const image = await readFile(url);
  assert.equal(image.toString("ascii", 1, 4), "PNG");
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  };
}

test("builds a GitHub Pages app under /countsite/", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /\/countsite\/assets\//);
  assert.match(html, /\.\/manifest\.webmanifest/);
  assert.match(html, /<html lang="zh-Hant">/);
});

test("ships installable, offline, device-local assets", async () => {
  const [manifestText, serviceWorker, page, styles] = await Promise.all([
    readFile(new URL("../dist/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../dist/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons.filter((icon) => icon.purpose === "maskable").length, 2);
  assert.match(serviceWorker, /self\.registration\.scope/);
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /import\.meta\.env\.BASE_URL/);
  assert.match(page, /writeLocal\("orders", orders\)/);
  assert.match(page, /function submitOrder\(\)/);
  assert.match(page, /cashReceivedAmount - total/);
  assert.match(page, /顧客付款/);
  assert.match(page, /剛好付清/);
  assert.match(page, /paymentInsufficient/);
  assert.match(styles, /\.change-result\.insufficient/);
  assert.match(page, /function exportProductBackup\(\)/);
  assert.match(page, /async function restoreProductBackup/);
  assert.match(page, /market-mate-product-backup/);
  assert.match(page, /application\/json;charset=utf-8/);
  assert.match(page, /readProductsFromBackup/);
  assert.match(page, /歷史訂單不受影響/);
  assert.match(page, /savedProducts !== undefined/);
  assert.match(page, /訂單管理/);
  assert.match(page, /作廢訂單/);
  assert.match(page, /永久刪除/);
  assert.match(page, /ORDERS_PER_PAGE = 20/);
  assert.match(page, /filteredOrders\.slice\(0, visibleOrderCount\)/);
  assert.match(page, /historyFilter === "today"/);
  assert.match(page, /aria-expanded={expanded}/);
  assert.match(page, /載入更多/);
  assert.match(page, /function exportCsv\(\)/);
  assert.match(page, /text\/csv;charset=utf-8/);
  assert.match(page, /\\uFEFF/);
  assert.match(page, /function exportPdf\(\)/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /printReportOpen/);
  assert.match(styles, /@media print/);
  assert.match(styles, /@page \{ size: A4 portrait/);
  await access(new URL("../dist/icon-192.png", import.meta.url));
  await access(new URL("../dist/icon-512.png", import.meta.url));
  await access(new URL("../dist/icon-maskable-192.png", import.meta.url));
  await access(new URL("../dist/icon-maskable-512.png", import.meta.url));
  await access(new URL("../dist/apple-touch-icon.png", import.meta.url));
  assert.deepEqual(await readPngSize(new URL("../dist/icon-192.png", import.meta.url)), { width: 192, height: 192 });
  assert.deepEqual(await readPngSize(new URL("../dist/icon-512.png", import.meta.url)), { width: 512, height: 512 });
  assert.deepEqual(await readPngSize(new URL("../dist/icon-maskable-192.png", import.meta.url)), { width: 192, height: 192 });
  assert.deepEqual(await readPngSize(new URL("../dist/icon-maskable-512.png", import.meta.url)), { width: 512, height: 512 });
  assert.deepEqual(await readPngSize(new URL("../dist/apple-touch-icon.png", import.meta.url)), { width: 180, height: 180 });
});
