"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  image?: string;
  accent: string;
};

type Cart = Record<string, number>;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const SEED_PRODUCTS: Product[] = [
  { id: "sample-1", name: "手作檸檬塔", price: 85, accent: "#F7D8A8" },
  { id: "sample-2", name: "冷泡烏龍茶", price: 60, accent: "#CFE8DB" },
  { id: "sample-3", name: "奶油鹽可頌", price: 55, accent: "#F1CFC9" },
  { id: "sample-4", name: "小山園抹茶餅乾", price: 120, accent: "#DCE6C8" },
];

const ACCENTS = ["#CFE8DB", "#D9E6F2", "#F7D8A8", "#E7D9EF", "#F1CFC9"];
const DB_NAME = "market-mate-local";
const STORE_NAME = "stall-data";

const money = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeLocal<T>(key: string, value: T) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File) {
  const source = await fileToDataUrl(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("圖片無法讀取"));
    image.src = source;
  });

  const maxSide = 1200;
  const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.82);
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [cart, setCart] = useState<Cart>({});
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([readLocal<Product[]>("products"), readLocal<Cart>("cart")])
      .then(([savedProducts, savedCart]) => {
        if (!active) return;
        if (savedProducts?.length) setProducts(savedProducts);
        if (savedCart) setCart(savedCart);
      })
      .catch(() => setNotice("本機資料讀取失敗，已先開啟示範商品"))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (ready) writeLocal("products", products).catch(() => setNotice("商品儲存失敗"));
  }, [products, ready]);

  useEffect(() => {
    if (ready) writeLocal("cart", cart).catch(() => setNotice("訂單儲存失敗"));
  }, [cart, ready]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    window.addEventListener("beforeinstallprompt", captureInstall);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => {
        const warmOfflineCache = () => {
          const urls = new Set<string>([window.location.pathname, "/manifest.webmanifest"]);
          document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>("link[href], script[src]").forEach((node) => {
            const value = "href" in node ? node.href : node.src;
            if (value && value.startsWith(window.location.origin)) urls.add(value);
          });
          urls.forEach((url) => fetch(url).catch(() => undefined));
        };
        if (navigator.serviceWorker.controller) warmOfflineCache();
        else navigator.serviceWorker.addEventListener("controllerchange", warmOfflineCache, { once: true });
      }).catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("beforeinstallprompt", captureInstall);
    };
  }, []);

  useEffect(() => {
    if (!editorOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditorOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editorOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const cartProducts = useMemo(
    () => products.filter((product) => (cart[product.id] ?? 0) > 0),
    [cart, products],
  );
  const totalItems = useMemo(
    () => Object.values(cart).reduce((sum, quantity) => sum + quantity, 0),
    [cart],
  );
  const total = useMemo(
    () => products.reduce((sum, product) => sum + product.price * (cart[product.id] ?? 0), 0),
    [cart, products],
  );

  function changeQuantity(id: string, amount: number) {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[id] ?? 0) + amount);
      const next = { ...current };
      if (nextQuantity === 0) delete next[id];
      else next[id] = nextQuantity;
      return next;
    });
  }

  function openCreate() {
    setEditingId(null);
    setName("");
    setPrice("");
    setImage(undefined);
    setEditorOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setName(product.name);
    setPrice(String(product.price));
    setImage(product.image);
    setEditorOpen(true);
  }

  async function handleImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("請選擇圖片檔案");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotice("圖片請小於 10MB");
      return;
    }
    setImageBusy(true);
    try {
      setImage(await compressImage(file));
    } catch {
      setNotice("圖片處理失敗，請換一張再試");
    } finally {
      setImageBusy(false);
    }
  }

  function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const numericPrice = Math.round(Number(price));
    if (!cleanName || !Number.isFinite(numericPrice) || numericPrice < 0) {
      setNotice("請填寫商品名稱與正確價格");
      return;
    }

    if (editingId) {
      setProducts((current) =>
        current.map((product) =>
          product.id === editingId
            ? { ...product, name: cleanName, price: numericPrice, image }
            : product,
        ),
      );
      setNotice("商品已更新");
    } else {
      const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now());
      setProducts((current) => [
        ...current,
        {
          id,
          name: cleanName,
          price: numericPrice,
          image,
          accent: ACCENTS[current.length % ACCENTS.length],
        },
      ]);
      setNotice("商品已新增");
    }
    setEditorOpen(false);
  }

  function deleteProduct() {
    if (!editingId || !window.confirm("確定刪除這項商品嗎？")) return;
    setProducts((current) => current.filter((product) => product.id !== editingId));
    setCart((current) => {
      const next = { ...current };
      delete next[editingId];
      return next;
    });
    setEditorOpen(false);
    setNotice("商品已刪除");
  }

  function clearOrder() {
    if (totalItems > 0 && window.confirm("要清空目前這筆訂單嗎？")) {
      setCart({});
      setNotice("已開始新訂單");
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  function closeEditor(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setEditorOpen(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>+</span></div>
          <div>
            <p className="eyebrow">MARKET MATE</p>
            <h1>小攤計價</h1>
          </div>
        </div>
        <div className="top-actions">
          <span className={`connection-pill ${isOnline ? "online" : "offline"}`}>
            <i aria-hidden="true" />{isOnline ? "已連線" : "離線可用"}
          </span>
          {installPrompt && (
            <button className="button ghost install-button" type="button" onClick={installApp}>
              安裝到裝置
            </button>
          )}
          <button className="button primary" type="button" onClick={openCreate}>
            <span aria-hidden="true">＋</span> 新增商品
          </button>
        </div>
      </header>

      <section className="intro-row">
        <div>
          <p className="section-kicker">今日攤位</p>
          <h2>點一下商品，就加入這筆訂單</h2>
        </div>
        <p className="saved-note"><span aria-hidden="true">●</span> 商品與訂單自動儲存在這台裝置</p>
      </section>

      <div className="workspace">
        <section className="catalog" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div>
              <h3 id="catalog-title">商品</h3>
              <span>{products.length} 項商品</span>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="empty-products">
              <div className="empty-symbol" aria-hidden="true">＋</div>
              <h3>先建立你的第一項商品</h3>
              <p>加入照片、商品名稱與售價，之後點一下就能快速計價。</p>
              <button className="button primary" type="button" onClick={openCreate}>新增商品</button>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => {
                const quantity = cart[product.id] ?? 0;
                return (
                  <article className={`product-card ${quantity ? "selected" : ""}`} key={product.id}>
                    <button
                      type="button"
                      className="edit-product"
                      onClick={() => openEdit(product)}
                      aria-label={`編輯 ${product.name}`}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="product-add-area"
                      onClick={() => changeQuantity(product.id, 1)}
                      aria-label={`加入一份 ${product.name}`}
                    >
                      <div className="product-photo" style={{ backgroundColor: product.accent }}>
                        {product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.image} alt="" />
                        ) : (
                          <span aria-hidden="true">{product.name.slice(0, 1)}</span>
                        )}
                        {quantity > 0 && <strong className="quantity-badge">{quantity}</strong>}
                      </div>
                      <div className="product-info">
                        <span className="product-name">{product.name}</span>
                        <span className="product-price">{money.format(product.price)}</span>
                      </div>
                      <span className="tap-hint"><b aria-hidden="true">＋</b> 加入</span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="order-panel" id="order-summary" aria-labelledby="order-title">
          <div className="order-head">
            <div>
              <p className="section-kicker">CURRENT ORDER</p>
              <h3 id="order-title">目前訂單</h3>
            </div>
            <span className="item-count">{totalItems} 件</span>
          </div>

          {cartProducts.length === 0 ? (
            <div className="empty-order">
              <div className="bag-symbol" aria-hidden="true">＋</div>
              <p>還沒有選擇商品</p>
              <span>從左側點選商品開始計價</span>
            </div>
          ) : (
            <div className="order-lines">
              {cartProducts.map((product) => {
                const quantity = cart[product.id];
                return (
                  <div className="order-line" key={product.id}>
                    <div className="order-line-main">
                      <div>
                        <strong>{product.name}</strong>
                        <span>{money.format(product.price)} × {quantity}</span>
                      </div>
                      <b>{money.format(product.price * quantity)}</b>
                    </div>
                    <div className="quantity-control" aria-label={`${product.name} 數量`}>
                      <button type="button" onClick={() => changeQuantity(product.id, -1)} aria-label={`減少一份 ${product.name}`}>−</button>
                      <span>{quantity}</span>
                      <button type="button" onClick={() => changeQuantity(product.id, 1)} aria-label={`增加一份 ${product.name}`}>＋</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="order-footer">
            <div className="total-row">
              <span>總計</span>
              <strong>{money.format(total)}</strong>
            </div>
            <button className="button new-order" type="button" onClick={clearOrder} disabled={totalItems === 0}>
              完成並開新單
            </button>
          </div>
        </aside>
      </div>

      <a className="mobile-total" href="#order-summary">
        <span><b>{totalItems}</b> 件商品</span>
        <strong>{money.format(total)}</strong>
        <em>查看明細 ↑</em>
      </a>

      {editorOpen && (
        <div className="modal-backdrop" onMouseDown={closeEditor}>
          <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="editor-head">
              <div>
                <p className="section-kicker">PRODUCT</p>
                <h2 id="editor-title">{editingId ? "編輯商品" : "新增商品"}</h2>
              </div>
              <button type="button" className="close-button" onClick={() => setEditorOpen(false)} aria-label="關閉">×</button>
            </div>

            <form onSubmit={saveProduct}>
              <label className="image-upload">
                <input type="file" accept="image/*" onChange={handleImage} />
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="商品圖片預覽" />
                ) : (
                  <span><b aria-hidden="true">＋</b>{imageBusy ? "圖片處理中…" : "上傳商品圖片"}<small>支援 JPG、PNG、HEIC，最大 10MB</small></span>
                )}
              </label>
              {image && (
                <button type="button" className="remove-image" onClick={() => setImage(undefined)}>移除圖片</button>
              )}

              <label className="field">
                <span>商品名稱</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：手作檸檬塔" maxLength={40} autoFocus />
              </label>
              <label className="field">
                <span>價格</span>
                <div className="price-field"><i>NT$</i><input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" type="number" min="0" step="1" inputMode="numeric" /></div>
              </label>

              <div className="editor-actions">
                {editingId && <button className="button danger" type="button" onClick={deleteProduct}>刪除商品</button>}
                <button className="button ghost" type="button" onClick={() => setEditorOpen(false)}>取消</button>
                <button className="button primary" type="submit" disabled={imageBusy}>{editingId ? "儲存變更" : "建立商品"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
