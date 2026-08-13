"use client";

import {
  ChangeEvent,
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
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

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
};

type Order = {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: "completed" | "voided";
  items: OrderItem[];
  totalItems: number;
  total: number;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type ProductBackup = {
  format: "market-mate-product-backup";
  version: 1;
  exportedAt: string;
  products: Product[];
};

const BASE_PATH = import.meta.env.BASE_URL;

const SEED_PRODUCTS: Product[] = [
  { id: "sample-1", name: "商品一", price: 85, accent:"#a8daf7" ,image: `${BASE_PATH}products/P3.png`},
  { id: "sample-2", name: "商品二", price: 60, accent: "#efe9a8",image: `${BASE_PATH}products/P4.png` },
  { id: "sample-3", name: "商品三", price: 55, accent: "#dc9386",image: `${BASE_PATH}products/P5.png`},
  { id: "sample-4", name: "商品四", price: 120, accent: "#DCE6C8" },
];

const ACCENTS = ["#CFE8DB", "#D9E6F2", "#F7D8A8", "#E7D9EF", "#F1CFC9"];
const DB_NAME = "market-mate-local";
const STORE_NAME = "stall-data";
const ORDERS_PER_PAGE = 20;

const money = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const orderDateTime = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatFileDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function readProductsFromBackup(value: unknown): Product[] | null {
  if (!value || typeof value !== "object") return null;
  const backup = value as Record<string, unknown>;
  if (backup.format !== "market-mate-product-backup" || backup.version !== 1 || !Array.isArray(backup.products)) {
    return null;
  }

  const ids = new Set<string>();
  const restoredProducts: Product[] = [];
  for (const item of backup.products) {
    if (!item || typeof item !== "object") return null;
    const product = item as Record<string, unknown>;
    const id = typeof product.id === "string" ? product.id.trim() : "";
    const name = typeof product.name === "string" ? product.name.trim() : "";
    const price = product.price;
    const accent = product.accent;
    const image = product.image;
    const imageIsValid = image === undefined || (
      typeof image === "string"
      && (/^data:image\/(?:png|jpeg|webp);base64,/i.test(image) || /^(?:\.?\/|https?:\/\/)/i.test(image))
    );

    if (
      !id || id.length > 200 || ids.has(id)
      || !name || name.length > 40
      || typeof price !== "number" || !Number.isFinite(price) || price < 0 || !Number.isInteger(price)
      || typeof accent !== "string" || !/^#[0-9a-f]{6}$/i.test(accent)
      || !imageIsValid
    ) {
      return null;
    }

    ids.add(id);
    restoredProducts.push({ id, name, price, accent, ...(typeof image === "string" ? { image } : {}) });
  }

  return restoredProducts;
}


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
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"today" | "all">("today");
  const [visibleOrderCount, setVisibleOrderCount] = useState(ORDERS_PER_PAGE);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [imageBusy, setImageBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [printReportOpen, setPrintReportOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const backupFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      readLocal<Product[]>("products"),
      readLocal<Cart>("cart"),
      readLocal<Order[]>("orders"),
    ])
      .then(([savedProducts, savedCart, savedOrders]) => {
        if (!active) return;
        if (savedProducts !== undefined) setProducts(savedProducts);
        if (savedCart) setCart(savedCart);
        if (savedOrders) setOrders(savedOrders);
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
    if (ready) writeLocal("orders", orders).catch(() => setNotice("訂單紀錄儲存失敗"));
  }, [orders, ready]);

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

    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register(`${BASE_PATH}sw.js`, { scope: BASE_PATH }).then(() => navigator.serviceWorker.ready).then(() => {
        const warmOfflineCache = () => {
          const urls = new Set<string>([window.location.pathname, `${BASE_PATH}manifest.webmanifest`]);
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
  const hasCashReceived = cashReceived.trim() !== "";
  const cashReceivedAmount = useMemo(() => {
    if (!hasCashReceived) return null;
    const amount = Number(cashReceived);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null;
  }, [cashReceived, hasCashReceived]);
  const changeAmount = cashReceivedAmount === null ? null : cashReceivedAmount - total;
  const paymentInvalid = hasCashReceived && cashReceivedAmount === null;
  const paymentInsufficient = changeAmount !== null && changeAmount < 0;

  useEffect(() => {
    if (totalItems === 0 && cashReceived !== "") setCashReceived("");
  }, [cashReceived, totalItems]);

  const filteredOrders = useMemo(() => {
    if (historyFilter === "all") return orders;
    const today = new Date();
    return orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt.getFullYear() === today.getFullYear()
        && createdAt.getMonth() === today.getMonth()
        && createdAt.getDate() === today.getDate();
    });
  }, [historyFilter, orders]);
  const visibleOrders = useMemo(
    () => filteredOrders.slice(0, visibleOrderCount),
    [filteredOrders, visibleOrderCount],
  );
  const completedOrders = useMemo(
    () => filteredOrders.filter((order) => order.status === "completed"),
    [filteredOrders],
  );
  const orderStats = useMemo(
    () => completedOrders.reduce(
      (stats, order) => ({
        count: stats.count + 1,
        items: stats.items + order.totalItems,
        total: stats.total + order.total,
      }),
      { count: 0, items: 0, total: 0 },
    ),
    [completedOrders],
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


  function changeHistoryFilter(filter: "today" | "all") {
    setHistoryFilter(filter);
    setVisibleOrderCount(ORDERS_PER_PAGE);
    setExpandedOrderIds(new Set());
  }

  function toggleOrderDetails(id: string) {
    setExpandedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

  function cancelOrder() {
    if (totalItems > 0 && window.confirm("要清空目前這筆訂單嗎？")) {
      setCart({});
      setCashReceived("");
      setNotice("已取消本筆訂單");
    }
  }

  function submitOrder() {
    if (totalItems === 0) return;
    if (paymentInvalid) {
      setNotice("請輸入有效的付款金額");
      return;
    }
    if (paymentInsufficient) {
      setNotice(`付款尚差 ${money.format(Math.abs(changeAmount ?? 0))}`);
      return;
    }
    const createdAt = new Date();
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(createdAt.getTime());
    const items = cartProducts.map((product) => {
      const quantity = cart[product.id];
      return {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        subtotal: product.price * quantity,
      };
    });
    const orderNumber = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, "0")}${String(createdAt.getDate()).padStart(2, "0")}-${String(orders.length + 1).padStart(4, "0")}`;
    setOrders((current) => [{
      id,
      orderNumber,
      createdAt: createdAt.toISOString(),
      status: "completed",
      items,
      totalItems,
      total,
    }, ...current]);
    setCart({});
    setCashReceived("");
    setNotice(`訂單 ${orderNumber} 已送出`);
  }

  function toggleOrderStatus(order: Order) {
    const nextStatus = order.status === "completed" ? "voided" : "completed";
    const action = nextStatus === "voided" ? "作廢" : "恢復";
    if (!window.confirm(`確定要${action}訂單 ${order.orderNumber} 嗎？`)) return;
    setOrders((current) => current.map((item) => (
      item.id === order.id ? { ...item, status: nextStatus } : item
    )));
    setNotice(`訂單已${action}`);
  }

  function deleteOrder(order: Order) {
    if (!window.confirm(`永久刪除訂單 ${order.orderNumber}？此動作無法復原。`)) return;
    setOrders((current) => current.filter((item) => item.id !== order.id));
    setNotice("訂單已永久刪除");
  }



  function exportCsv() {
    if (filteredOrders.length === 0) return;
    const headers = ["訂單編號", "訂單時間", "狀態", "商品名稱", "單價", "數量", "小計", "訂單商品數", "訂單總額"];
    const rows = filteredOrders.flatMap((order) => order.items.map((item) => [
      order.orderNumber,
      orderDateTime.format(new Date(order.createdAt)),
      order.status === "completed" ? "有效" : "已作廢",
      item.name,
      item.price,
      item.quantity,
      item.subtotal,
      order.totalItems,
      order.total,
    ]));
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stall-orders-${historyFilter}-${formatFileDate()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`已匯出 ${filteredOrders.length} 筆訂單 CSV`);
  }

  function exportProductBackup() {
    const backup: ProductBackup = {
      format: "market-mate-product-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      products,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `market-mate-products-${formatFileDate()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`已備份 ${products.length} 項商品`);
  }

  async function restoreProductBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setNotice("備份檔案過大，請確認檔案是否正確");
      return;
    }

    try {
      const restoredProducts = readProductsFromBackup(JSON.parse(await file.text()));
      if (!restoredProducts) {
        setNotice("無法還原：不是有效的商品備份檔");
        return;
      }
      if (!window.confirm(`將以備份中的 ${restoredProducts.length} 項商品覆蓋目前商品，並清空目前訂單。歷史訂單不受影響。確定繼續嗎？`)) {
        return;
      }
      setProducts(restoredProducts);
      setCart({});
      setCashReceived("");
      setNotice(`已還原 ${restoredProducts.length} 項商品`);
    } catch {
      setNotice("無法還原：JSON 檔案格式錯誤");
    }
  }

  function exportPdf() {
    if (filteredOrders.length === 0) return;
    const previousTitle = document.title;
    const reportName = historyFilter === "today" ? "今日訂單" : "全部訂單";
    const cleanup = () => {
      document.title = previousTitle;
      setPrintReportOpen(false);
    };
    setPrintReportOpen(true);
    document.title = `擺攤小工具-${reportName}-${formatFileDate()}`;
    window.addEventListener("afterprint", cleanup, { once: true });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print());
    });
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
          <div className="brand-mark">
            <img
              src={`${BASE_PATH}brand_icon.png`}
              alt="擺攤小工具"
            />
          </div>
          <div>
            <h1>擺攤小工具</h1>
            <p className="eyebrow">By 鸚鵡螺</p>
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
          <button className="button ghost data-button" type="button" onClick={exportProductBackup} disabled={products.length === 0}>
            匯出備份
          </button>
          <button className="button ghost data-button" type="button" onClick={() => backupFileInput.current?.click()}>
            還原商品
          </button>
          <input
            ref={backupFileInput}
            className="backup-file-input"
            type="file"
            accept=".json,application/json"
            onChange={restoreProductBackup}
            aria-label="選擇商品 JSON 備份檔"
          />
        </div>
      </header>

      <section className="intro-row">
        <div>
          <p className="section-kicker">使用說明</p>
          <h2>點一下商品即加入訂單</h2>
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
            <button className="button primary catalog-add-button" type="button" onClick={openCreate}>
              <span aria-hidden="true">＋</span> 新增商品
            </button>
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
            <div className="cash-payment">
              <div className="cash-entry">
                <label htmlFor="cash-received">顧客付款</label>
                <div className="cash-input">
                  <span>NT$</span>
                  <input
                    id="cash-received"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={cashReceived}
                    onChange={(event) => setCashReceived(event.target.value)}
                    disabled={totalItems === 0}
                    aria-describedby="change-result"
                  />
                </div>
                <button
                  className="exact-payment"
                  type="button"
                  onClick={() => setCashReceived(String(total))}
                  disabled={totalItems === 0}
                >
                  剛好付清
                </button>
              </div>
              <div
                id="change-result"
                className={`change-result ${paymentInvalid || paymentInsufficient ? "insufficient" : changeAmount !== null ? "ready" : ""}`}
                aria-live="polite"
              >
                <span>{paymentInvalid ? "付款金額無效" : paymentInsufficient ? "尚差" : "找零"}</span>
                <strong>
                  {paymentInvalid || changeAmount === null ? "—" : money.format(Math.abs(changeAmount))}
                </strong>
              </div>
            </div>
            <div className="order-actions">
              <button className="button cancel-order" type="button" onClick={cancelOrder} disabled={totalItems === 0}>
                取消本筆
              </button>
              <button className="button submit-order" type="button" onClick={submitOrder} disabled={totalItems === 0 || paymentInvalid || paymentInsufficient}>
                送出訂單
              </button>
            </div>
          </div>
        </aside>
      </div>

      <section className="order-history" aria-labelledby="history-title">
        <div className="history-heading">
          <div>
            <p className="section-kicker">ORDER HISTORY</p>
            <h2 id="history-title">訂單管理</h2>
          </div>
          <span>共 {filteredOrders.length} 筆紀錄</span>
        </div>

        <div className="history-tools">
          <div className="history-filters" aria-label="訂單日期篩選">
            <button type="button" className={historyFilter === "today" ? "active" : ""} onClick={() => changeHistoryFilter("today")}>今天</button>
            <button type="button" className={historyFilter === "all" ? "active" : ""} onClick={() => changeHistoryFilter("all")}>全部</button>
          </div>
          <div className="export-actions" aria-label="匯出目前篩選的訂單">
            <button className="button ghost" type="button" onClick={exportCsv} disabled={filteredOrders.length === 0}>匯出 CSV</button>
            <button className="button ghost" type="button" onClick={exportPdf} disabled={filteredOrders.length === 0}>匯出 PDF</button>
          </div>
        </div>

        <div className="order-stats" aria-label="目前篩選的有效訂單統計">
          <div><span>有效訂單</span><strong>{orderStats.count} 筆</strong></div>
          <div><span>售出商品</span><strong>{orderStats.items} 件</strong></div>
          <div><span>累計總額</span><strong>{money.format(orderStats.total)}</strong></div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="empty-history">
            <p>{historyFilter === "today" ? "今天尚無訂單" : "尚無訂單紀錄"}</p>
            <span>{orders.length === 0 ? "送出第一筆訂單後，會自動顯示在這裡。" : "可以切換到「全部」查看過往訂單。"}</span>
          </div>
        ) : (
          <>
            <div className="history-list">
              {visibleOrders.map((order) => {
                const expanded = expandedOrderIds.has(order.id);
                return (
                  <article className={`history-card ${order.status === "voided" ? "voided" : ""}`} key={order.id}>
                    <div className="history-card-head">
                      <div>
                        <strong>#{order.orderNumber}</strong>
                        <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleString("zh-TW", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}</time>
                      </div>
                      <span className={`order-status ${order.status}`}>
                        {order.status === "completed" ? "有效" : "已作廢"}
                      </span>
                    </div>
                    {expanded && (
                      <div className="history-items">
                        {order.items.map((item) => (
                          <div key={`${order.id}-${item.productId}`}>
                            <span>{item.name}<small>{money.format(item.price)} × {item.quantity}</small></span>
                            <strong>{money.format(item.subtotal)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="history-card-footer">
                      <div><span>{order.totalItems} 件商品</span><strong>{money.format(order.total)}</strong></div>
                      <div className="history-actions">
                        <button className="button detail-toggle" type="button" onClick={() => toggleOrderDetails(order.id)} aria-expanded={expanded}>
                          {expanded ? "收合明細" : "查看明細"}
                        </button>
                        <button className="button ghost" type="button" onClick={() => toggleOrderStatus(order)}>
                          {order.status === "completed" ? "作廢訂單" : "恢復訂單"}
                        </button>
                        <button className="button danger" type="button" onClick={() => deleteOrder(order)}>永久刪除</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {visibleOrderCount < filteredOrders.length && (
              <button className="button load-more" type="button" onClick={() => setVisibleOrderCount((count) => count + ORDERS_PER_PAGE)}>
                載入更多（尚有 {filteredOrders.length - visibleOrderCount} 筆）
              </button>
            )}
          </>
        )}
      </section>



      {printReportOpen && (
        <section className="print-report" aria-hidden="true">
          <header className="print-report-head">
            <div>
              <p>擺攤小工具</p>
              <h1>{historyFilter === "today" ? "今日訂單報表" : "全部訂單報表"}</h1>
            </div>
            <div className="print-report-meta">
              <span>範圍：{historyFilter === "today" ? formatFileDate() : "全部紀錄"}</span>
              <span>產生時間：{orderDateTime.format(new Date())}</span>
            </div>
          </header>

          <div className="print-stats">
            <div><span>有效訂單</span><strong>{orderStats.count} 筆</strong></div>
            <div><span>售出商品</span><strong>{orderStats.items} 件</strong></div>
            <div><span>有效訂單總額</span><strong>{money.format(orderStats.total)}</strong></div>
          </div>

          <div className="print-order-list">
            {filteredOrders.map((order) => (
              <article className="print-order" key={`print-${order.id}`}>
                <header>
                  <div>
                    <strong>訂單 #{order.orderNumber}</strong>
                    <time>{orderDateTime.format(new Date(order.createdAt))}</time>
                  </div>
                  <span>{order.status === "completed" ? "有效" : "已作廢"}</span>
                </header>
                <table>
                  <thead>
                    <tr><th>商品</th><th>單價</th><th>數量</th><th>小計</th></tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={`print-${order.id}-${item.productId}`}>
                        <td>{item.name}</td>
                        <td>{money.format(item.price)}</td>
                        <td>{item.quantity}</td>
                        <td>{money.format(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={2}>{order.totalItems} 件商品</td><td colSpan={2}>訂單總額 {money.format(order.total)}</td></tr>
                  </tfoot>
                </table>
              </article>
            ))}
          </div>
          <p className="print-note">作廢訂單保留於明細中，但不計入有效訂單統計與總額。</p>
        </section>
      )}

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
