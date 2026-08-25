# 🦌 FCU Campus Guide（逢甲導航文華鹿）

逢甲大學全方位智慧校園生活導航指南（FCU Smart Campus Life & Navigation Guide）。  
採用 **Vue 3 + Pinia + Leaflet (OpenStreetMap) + OSRM (Open Source Routing Machine) 路由引擎**，整合全校 29 棟主要教學研究大樓與 3 座主要校門的精準 GPS 經緯度座標。具備**開車＋步行**與**純步行**單頁無縫切換導航、**多語系 Turn-by-Turn 逐步指引**、**當日即時活動與考場公告動態卡片**、**大樓硬體設施面板**、**文華鹿動態貼圖**、**全區導航地圖截圖存檔**以及**七國語言完整支援**。

**零 API 金鑰、零使用費用、零雲端綁定**，支援一鍵部署至 **GitHub Pages**！

---

## 🌟 系統亮點與核心特色 (Key Features)

### 1. 🚶 智慧校園步行導航與三欄式結果卡片（Equal-Height 3-Card Navigation View）
- **左側卡片 — 🚶 逐步步行指引（Turn-by-Turn Steps）**：
  - 支援 **7 國語言** 即時翻譯（繁體中文、English、日本語、한국어、Tiếng Việt、Bahasa Indonesia、ไทย）。
  - 自動轉譯校園周邊街道（文華路、逢大路、福星路、逢甲路、河南路、西安街、榕樹步道等）。
  - 外語環境下自動附帶**淺灰色中文實體路標副標**，方便外籍訪客與現場路標即時比對。
- **中間卡片 — 📅 當日即時活動與考場動態（Active Events & Exams Card）**：
  - 當目的地大樓當天或近期有舉辦活動、演講、學測、檢定或校內考試時，自動呈現於中央卡片。
  - 清楚列出活動名稱、類型徽章（📝 考試 / 🎤 講座 / 💼 徵才 / 🎉 活動）、時間區間、詳細舉辦地點／考場教室清單與備註。
  - **智慧自適應**：若該大樓無進行中活動，中間卡片自動隱藏，版面流暢自適應為雙欄配置。
- **右側卡片 — 🏢 大樓設施與建築簡介（Building Facilities & Overview）**：
  - 展示大樓實景照片、官方編號與代碼（如 `XSB｜學思樓`、`LIB｜圖書館`、`iHub｜逢甲智慧創新港`）。
  - 飲水機精準樓層位置、各樓層洗手間／無障礙廁所、客貨電梯／無障礙電梯、AED 設置點、特色店家（如圖書館路易莎咖啡）及各樓層空間介紹。
  - 精簡優雅的建築特色簡介，移除不符合校內純步行情境的「出入口與交通」冗餘標題。

### 2. 🚗 開車＋步行雙模態導航（Driving + Walking Flow）
- 使用者選擇「🚗 我開車來」與目的地大樓。
- 系統透過 Haversine 演算法自動計算並推薦距離該大樓最近的推薦停車場（凱旋停車場／體育館地下停車場）。
- 輸入起點地址後，透過 Nominatim 免費地理編碼與 OSRM 規劃車行路線。
- 抵達停車場後，文華鹿動態提示「🦌 文華鹿陪你規劃停車場到目的地的步行路線」，一鍵無縫切換至校內步行指引。

### 3. 📸 完整導航成果圖檔儲存（Full-Map Screenshot Export）
- 點擊「💾 儲存路線圖」，透過 `html2canvas`（啟用 `crossOrigin` 圖資跨域支援）一鍵將頂部路線摘要（預估時間與距離）、高解析度地圖路線軌跡以及下方詳細資訊卡完整匯出為 PNG 高畫質圖片，方便離線查閱。

### 4. 🌐 全面 7 國語言國際化（Comprehensive 7-Language i18n）
- 支援 **繁體中文 (`zh-TW`)、English (`en`)、日本語 (`ja`)、한국어 (`ko`)、Tiếng Việt (`vi`)、Bahasa Indonesia (`id`)、ไทย (`th`)**。
- 自動偵測訪客裝置語言，不在支援清單內自動降級為英文。
- 隨時可在右上角下拉選單切換語系，導航步驟、大樓設施、表單選項與 UI 文字即時動態重新渲染。

### 5. 🦌 文華鹿動態吉祥物（Interactive Deer Mascot）
- 依據導航狀態自動切換不同互動動態貼圖（首頁迎賓搖擺、開車準備震動、步行前進、終點慶祝彈跳）。

### 6. 🔒 輕量化活動管理後台（Admin Dashboard）
- 提供 `/admin` 隱藏管理介面（支援密碼雜湊與 Session 權限控管）。
- 支援即時新增、編輯、刪除校園活動與考場公告，並可多選綁定舉辦之大樓地點。

---

## 🏗️ 模組化技術架構 (Architecture & Modular Design)

```
fcu-campus-guide-project/
├── client/                     # Vue 3 前端專案（支援純靜態 SPA 部署）
│   ├── src/
│   │   ├── components/         # 模組化 Vue 元件
│   │   │   ├── GoogleMapNav.vue    # 核心導航介面（Leaflet 地圖 + 三欄式結果卡片 + 截圖匯出）
│   │   │   ├── SelectForm.vue      # 起訖點選擇表單（起點在上方，目的地在下方 + 快速標籤）
│   │   │   ├── IntroSplash.vue     # 首頁迎賓與即時活動通報公佈欄
│   │   │   ├── FacilityPanel.vue   # 大樓硬體設施面板與多語系簡介
│   │   │   ├── LanguageSwitcher.vue# 7 國語言切換器
│   │   │   └── BilingualText.vue   # 雙語對照渲染元件
│   │   ├── stores/             # Pinia 狀態管理
│   │   │   └── app.js              # 全域導航狀態機（步驟、起訖點、導航模式）
│   │   ├── utils/              # 獨立核心工具函式庫
│   │   │   ├── googleMaps.js       # Leaflet 載入器 + OSRM 路由計算 + 多語系轉彎指令解析
│   │   │   ├── campusBounds.js     # 校園 6 頂點多邊形邊界與地圖鎖定（Ray-Casting Algorithm）
│   │   │   ├── mapsLink.js         # Google Maps 原生 App 跳轉 URL 產生器
│   │   │   ├── parking.js          # 最近停車場計算
│   │   │   ├── buildingOptions.js  # 大樓與校門選項分類與推薦清單
│   │   │   ├── bilingual.js        # 雙語翻譯適配器
│   │   │   ├── dateFormat.js       # 本地化日期時間格式化
│   │   │   ├── sound.js            # Web Audio API 原生音效合成
│   │   │   └── publicUrl.js        # 靜態資源路徑解析
│   │   ├── data/               # 靜態資料集
│   │   │   ├── buildings.json      # 全校 29 棟大樓 GPS 座標與設施資料
│   │   │   ├── gates.json          # 校門 GPS 座標
│   │   │   ├── campusBoundary.json # 逢甲校園精準邊界多邊形座標（6 頂點）
│   │   │   ├── buildingNamesI18n.js# 大樓名稱 7 語對照表
│   │   │   └── facilityContentI18n.js# 設施說明 7 語對照表
│   │   ├── i18n/               # 多語系配置與 7 國語言字典
│   │   └── views/              # 頁面視圖（導航頁、管理者後台）
│   ├── dev-server.mjs          # 開發用輕量 ESM 伺服器
│   └── vite.config.js          # Vite 打包配置（支援 GitHub Pages base path）
│
├── server/                     # Node.js + Express + SQLite 後端（活動管理 API，選用）
│   ├── index.js                # Express REST API 伺服器
│   ├── db.js                   # SQLite 資料庫連線與結構定義
│   ├── auth.js                 # 密碼安全雜湊與 Session 驗證
│   ├── seed.js                 # 大樓與測試資料庫初始化腳本
│   └── campus.db               # SQLite 資料庫檔案
│
└── .github/workflows/
    └── gh-pages.yml            # GitHub Actions 自動構建與部署至 GitHub Pages
```

---

## 💻 本地開發與快速啟動 (Quickstart)

### 系統需求
- **Node.js**: `>= 20.0.0`（建議使用 Node.js 22 LTS）
- **npm**: `>= 9.0.0`

### 1. 安裝所有相依套件
在專案根目錄執行：
```bash
npm run install:all
```

### 2. 初始化資料庫（可選，用於管理後台）
```bash
npm run seed
```

### 3. 啟動開發伺服器
同時啟動前端（`localhost:5173`）與後端 API（`localhost:3001`）：
```bash
npm run dev
```

若僅需前端地圖導航功能，亦可單獨啟動前端：
```bash
npm run client
```

---

## 🚀 部署至 GitHub Pages (Deployment)

本專案已完全設定好 GitHub Actions 自動化 CI/CD 流程：
1. 將程式碼推送到 GitHub 儲存庫的 `main` 分支。
2. 前往儲存庫的 **Settings** ➔ **Pages**。
3. 在 **Build and deployment** 來源中選擇 **GitHub Actions**。
4. GitHub Actions 會自動完成打包並將靜態前端發布至 `https://<username>.github.io/<repo-name>/`。

> **備註**：前端採用純靜態 SPA 架構，地圖圖資、OSRM 路由與多語系字典完全在瀏覽器端運算，無需任何後端伺服器即可 100% 穩定運作！

---

## 📄 授權條款 (License)

本專案採 MIT 授權條款釋出。歡迎校園展示、學術交流與自由衍生開發。
