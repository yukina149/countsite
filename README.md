# 擺攤小工具

可以建立商品、上傳圖片、調整名稱與價格，點選商品後可以即時的計算數量、小計與總價。

## 功能

- 新增、編輯與刪除商品
- 上傳商品圖片，儲存前自動縮圖壓縮
- 點選商品快速加入目前訂單
- 調整每項商品數量、顯示小計、件數與總價
- 輸入顧客付款金額，即時計算找零或提示不足金額
- 一鍵完成訂單並開新單
- 手機、平板與桌面響應式介面
- PWA 安裝與離線快取
- 商品、圖片與目前訂單只保存在使用者裝置

## 使用說明


### 注意事項
第一次開啟圖片載入有點慢是正常的!
手機必須先在有網路時開啟過網站，之後使用同一個瀏覽器開啟相同網址，即使沒有網路也能使用，也可選擇瀏覽器「安裝到裝置」

安裝完成並讓頁面快取一次後，即使市集現場沒有網路仍可開啟與計價。
- **清除瀏覽器網站資料會一併刪除商品與訂單。**
- **不同手機或電腦的商品資料不會自動同步。**
- **建議正式活動前先開啟一次 App，確認商品圖片與離線狀態正常。**

### 教學影片
- [教學影片 1（安卓）](https://youtube.com/shorts/J_vLA-u57wQ?si=KSifPcZXvaPwImF2)
- [教學影片 2（IOS）](https://youtu.be/qSPeY9bNxMQ?si=X9j-sS2Esr3J-viK)

## 開發相關說明
## 技術架構

```text
app/
├─ page.tsx          商品管理、訂單計算、IndexedDB 本機儲存
├─ globals.css       響應式介面與淡色視覺系統
└─ layout.tsx        PWA、SEO 與社群分享資訊
public/
├─ manifest.webmanifest   可安裝 App 設定
├─ sw.js                  離線快取 Service Worker
├─ icon-192.png           PWA 圖示
├─ icon-512.png           PWA 圖示
└─ og.png                 社群連結預覽圖
.openai/hosting.json      Sites 部署設定（不使用雲端資料庫）
```

資料層使用瀏覽器 IndexedDB，適合攤位在單一手機或電腦上離線操作。商品照片會先縮小並轉成 WebP，再存進本機資料庫；沒有帳號、後端或雲端同步，資料不會離開裝置。

## 本機開發

需要 Node.js 22.13 以上與 pnpm。

```bash
pnpm install
pnpm dev
```

瀏覽器開啟 `http://localhost:3000`。

## 驗證與正式建置

```bash
pnpm build
pnpm test
```

