# FCU Campus Navigation Service（逢甲導航文華鹿）

逢甲大學新生／訪客校內導覽網站。核心功能（地圖／路線規劃／設施資訊）是純前端靜態
站，不需要後端資料庫；管理者後台登入、公告、活動這幾個功能則有一個 Node.js +
Express + SQLite 後端支援（見下方「後端」章節）。吉祥物「文華鹿」會帶新生 / 訪客
從你選的出發地（校門、大樓、或幫你找最近停車場）走到目的地大樓，告知預估步行時間，抵達後顯示大樓設施資訊（教室編碼、電梯、無障礙電梯、廁所、飲水機、AED、休憩空間等）。

## 專案結構

```
project/
  client/    Vue 3 + Vite 前端（純靜態，見下方「快速開始」）
  server/    Express + SQLite 後端（管理者登入、公告、活動功能需要，見下方「後端」章節）
```

`client` 與 `server` 是兩個獨立資料夾，各自有自己的 `package.json`／`node_modules`，
彼此透過 HTTP API 溝通（`client` 呼叫 `http://localhost:3001`，見
`client/src/utils/api.js`），不是同一個 Node process。

## 快速開始

**前端（必要）：**

```bash
cd client
npm install
npm run dev       # 開發模式，預設 http://localhost:5173
```

打包成正式版：

```bash
cd client
npm run build      # 產出 client/dist/
npm run preview    # 本機預覽打包結果
```

前端是純靜態 SPA，`npm run build` 產出的 `client/dist/` 可以直接丟到任何靜態空間
（校方網頁空間、GitHub Pages、Netlify…）就能跑，**不需要後端也能正常使用地圖／
路線規劃／設施資訊等核心功能**。路由用 hash mode（網址會有 `#/`），所以就算放到
最陽春的靜態主機也不需要額外的 rewrite 設定。

**後端（選用，管理者後台登入、公告、活動這幾個功能需要）：**

```bash
cd server
npm install
npm run seed       # 第一次執行前，先把 buildings.json 匯入 SQLite
npm start          # 啟動 API，預設 http://localhost:3001
```

也可以在 `project/` 根目錄用一份方便腳本同時裝好兩邊、同時啟動兩個 process
（用到 `concurrently`）：

```bash
cd project
npm install
npm run install:all   # 分別 npm install client/ 和 server/
npm run seed
npm run dev            # 同時跑 client (Vite) 和 server (Express)
```

前端讀取資料的 API 呼叫都是「失敗就優雅降級」（`client/src/utils/api.js` 的
`safeFetch()`）：如果沒有啟動 `server/`，活動公告、大樓異動公告相關的區塊就是不顯示，
地圖／路線／設施資訊等核心功能完全不受影響——這是刻意的架構設計，不是漏未處理的
例外。唯一的例外是 `/admin` 管理者後台：登入本身需要驗證密碼，這件事本來就不該只
在前端做，所以後端沒有啟動時 `/admin` 會直接顯示「連不上伺服器」而無法登入（見下方
「管理者帳號與登入」）。

## 使用技術與關鍵設計

- **Vue 3 + Vite + Pinia + vue-router + vue-i18n**，全部是免費、無需 API 金鑰的套件。
- **地圖**：沒有使用 Google Maps 或任何地圖 API/金鑰。畫面上看到的校園地圖底圖是
  逢甲大學官方校園平面圖插畫本身（`public/map/fcu-campus-map.webp`，擷取自官方平面
  圖 PDF；首頁另外提供原始 PDF 全圖連結，見下方「首頁地圖連結」），不是自繪的
  SVG 向量圖——這張官方插畫已經把
  每棟建築、代碼、名稱和校門都畫好了，比自己重畫更清楚。真正算路線用的仍是
  `scripts/` 裡真實的 GPS 經緯度資料（來自 `fcu_routing.osm` / `FCU map.osm`），Dijkstra
  算出的 lat/lon 路徑點透過 `src/utils/mapProjection.js` 的仿射轉換（28 個手動量測的
  控制點：29 棟建築代碼圓圈＋4 個校門）投影成這張插畫的像素座標，並把路徑起訖點
  額外校正（endpoint anchoring）到插畫實際畫出該建築的位置，確保文華鹿精準地在
  正確的建築上出發／抵達。路線折線畫在 `<svg>` 裡（`CampusMap.vue` 的
  `.route-line`），疊在地圖圖片**上面**、清楚可見——這是刻意設計：文字逐步導航
  （左轉/右轉/直走 XX 公尺）曾經是主要的導航方式，但轉彎偵測／分群邏輯本身容易出
  edge case（見下方文華鹿走路動畫段落），即使文華鹿走的實際路徑是對的，文字描述
  仍可能與之矛盾；現在改成讓使用者直接看著地圖上畫出來的路線走，同時把文華鹿走路
  動畫刻意放慢（見 `DURATION_MS`）並在抵達後停留數秒才彈出到達視窗（見
  `LINGER_MS`），讓使用者有時間看清楚整條路線，而不是被文字牽著走。舊版自繪向量地圖用的
  `src/utils/projection.js`（等距長方投影＋`haversine()` 距離公式）並未整個淘汰，
  現在仍是路線規劃／停車場最近點計算背後的幾何數學（見下一項與「開車/停車場流程」），
  只是不再用它把建築畫成 SVG 色塊。完整路網（1077 節點／3568 邊，含少數手動補上的
  連接點，見下方「已知限制」）資料供 Dijkstra 計算使用，本身不會被畫出來。
- **路線規劃**：Dijkstra 最短路徑演算法（`src/utils/routing.js`，用到
  `src/utils/projection.js` 的等距長方投影與 haversine 距離），跑在真實測繪的
  步行路網圖上（`src/data/graph.json`，1077 個節點／3568 條邊）。
- **開車/停車場流程**：選「🚗 開車」＋選目的地大樓按下開始後，系統自動算出離目的地
  最近的停車場（`utils/parking.js` 的 `nearestParkingTo()`），直接跳到路線頁。畫面
  採左右分割：左邊是本網站自己的校內導覽（`GuideView.vue` 的 `.drive-nav-card`，
  文華鹿從建議停車場走到目的地大樓）；右邊是即時內嵌的 Google 地圖
  （`DriveInfoCard.vue`，用 `utils/mapsLink.js` 的 `googleMapsEmbedUrl()`），釘選在
  建議停車場的位置，不帶起點參數（由使用者自行在地圖上輸入出發地）。`utils/parking.js`
  只保留兩個開放給訪客使用的停車場：**逢甲大學凱旋停車場**、**體育館地下停車場**
  （原始測繪資料裡的其餘停車格點位不對外開放，皆已排除）。這兩個停車場也直接
  加進 `SelectForm.vue` 的出發地／目的地下拉選單最上方（各自獨立的「校內停車場」
  選項群組），可以手動選「已經停在凱旋停車場，帶我走到 X」或「從 X 走回停車場」，
  不一定要透過「🚗 開車」自動流程。
- **官方地圖範圍一致性**：`src/data/buildings.json` 只收錄官方校園平面圖（見下方
  「資料從哪來」）上有標示的 29 個項目——OSM 測繪到、但官方地圖沒有標示的鄰近建物
  （警衛室、店家、非開放停車格等）在資料產生階段（`build_content.py`）就直接過濾
  掉，不會進到 `buildings.json` 裡，因此下拉選單（`buildingOptions.js` 的
  `selectableBuildings()`）跟官方地圖插畫（`CampusMap.vue` 顯示的那張）上實際標示
  出來的建築自然保持一致。下拉選單依官方地圖上的「編號 No.」（1–29）排序，跟訪客掃視實體牌樓地圖
  的順序一致，出發地下拉選單的停車場選項固定排在最上方，不受此排序影響。
- **文華鹿走路動畫**：`src/components/DeerSprite.vue`，改用美術提供的貼圖圖檔
  （`public/stickers/deer-go-walk.png` 走路、`deer-follow-me.png` 首頁招呼、
  `deer-finish.png` 抵達），不再是手繪 SVG 向量圖；`CampusMap.vue` 把貼圖放進
  `<foreignObject>` 沿路線移動，達成走路動畫效果。要再換一批貼圖，直接替換
  `public/stickers/` 底下對應檔名即可，不需要改程式碼。走路速度刻意放得比較慢
  （`CampusMap.vue` 的 `DURATION_MS`，約每公尺 160ms，短程距離下限 16 秒、長程上限
  75 秒），抵達後文華鹿會在終點停留 6 秒（`LINGER_MS`）才觸發到達彈出視窗，讓使用者
  有時間看清楚整條路線再被彈出視窗蓋住地圖。
- **路網除錯疊圖**：`CampusMap.vue` 內建一個開發用的除錯圖層——在路線頁按下鍵盤
  `g` 鍵，會把 `graph.json` 裡*全部*的路網節點與邊（不只目前這趟路線）畫成亮青色線條
  疊在地圖插畫上，方便肉眼比對官方地圖的實際步道跟已測繪路網哪裡對得上、哪裡缺漏
  （例如兩棟建築中間根本沒有路徑，或路徑接錯位置）。純開發輔助功能，預設關閉，
  沒有對外曝光的 UI 按鈕。
- **首頁地圖連結**（`IntroSplash.vue`）：文華鹿卡片下方提供三個開新分頁的靜態地圖
  連結——「查看全校地圖」（`public/map/FCU Campus.pdf`）、「AED 設備地點總覽」
  （`public/map/AED.jpg`）、「無障礙設施地點總覽」（`public/map/Barrier_free_map.jpg`）。
  三個都是直接連到 `public/map/` 底下的靜態圖檔/PDF，不是網頁內嵌地圖，要更新內容
  直接換掉對應檔案即可；文字有 7 語系翻譯（`i18n/locales/*.js` 的
  `intro.mapLink` / `intro.aedMapLink` / `intro.accessibilityMapLink`）。
- **音效**：`src/utils/sound.js` 用瀏覽器 Web Audio API 即時合成（歡迎聲、腳步聲、
  抵達提示音），沒有外部音檔，離線也能播放。
- **多語系**：繁體中文／英文／日文／韓文／越南文／印尼文／泰文，共 7 語系
  （`src/i18n/locales/`）。開啟網頁時自動偵測手機/瀏覽器系統語系
  (`src/i18n/index.js` 的 `detectLocale()`)，偵測不到就顯示英文；中文只會顯示繁體。
- **雙語對照顯示**（`src/utils/bilingual.js`）：語言切換到非中文時，下拉選單（校門/
  大樓清單）跟大樓設施資訊頁的標題/欄位標籤、設施地點描述文字（`facilityContentI18n.js`），
  會顯示「中文 / 目標語言」雙語對照，方便拿手機畫面直接比對校園裡的實體中英文牌子。
  地圖上的建築標籤則只顯示「中文名稱＋英文代碼」（如 `LIB`／`CMB`），避免地圖太擠。
  大樓/校門及設施地點描述在日/韓/越/印尼/泰文的翻譯（`src/data/buildingNamesI18n.js`、
  `src/data/facilityContentI18n.js`）是 **AI 最佳猜測翻譯，非官方多語標示**（逢甲大學
  校園實體牌子只有中文＋英文），沒有對應翻譯的項目會自動顯示英文代替；正式使用前建議
  請通曉該語言的人抽查校對。
- **管理者後台**（`/admin`）：使用真正的帳號系統，而不是寫死在前端原始碼裡的單一密碼
  （見下方「管理者帳號與登入」段落）。登入後可新增/編輯/刪除「大樓異動公告」（整修中、
  廁所故障、電梯故障、停水、停電等），公告資料存在後端 SQLite 資料庫，所有管理者登入
  後看到、編輯的都是同一份資料，不再是各自瀏覽器 localStorage 各自為政。

## 資料從哪來

所有資料都來自**真實測繪檔案**，沒有捏造座標或內容：

| 資料 | 來源檔案 | 涵蓋範圍 |
|---|---|---|
| 步行路網（1075 節點，另有少數手動補上的節點，見「已知限制」） | `fcu_routing.osm` + `FCU map.osm` | 全校園，見下方「路網合併」說明 |
| 建築／地標座標與外形多邊形 | `FCU map.osm`（含 `<way>` 與 `<relation>` 多邊形、以及命名過的 `leisure=pitch/swimming_pool` 球場泳池） | OSM 測繪到 42 筆，其中 29 筆出現在官方地圖上（見下一列），只有這 29 筆會進 `buildings.json` |
| 建築中英文正式名稱／代碼／編號 | `map/fcu map buildings.jpg`（官方牌樓圖例）＋ `map/fcu map no.jpg`（官方牌樓地圖本體） | 29 個項目（含 5 項球場／泳池／運動場），見 `scripts/build_content.py` 的 `OFFICIAL_CODES` |
| 建築實景照片 29 張 | 使用者本人於校園實地拍攝（見 `public/buildings/credits.json`） | 官方地圖上全部 29 個項目 |
| 電梯 8 處、無障礙電梯 1 處 | `fcu_routing.osm`、使用者現場確認 | 忠勤樓×4、圖書館×1、+3 處；行政大樓無障礙電梯 1 處 |
| AED 8 處 | `map/AED.jpg` | 體育館、育樂館、人言大樓、共善樓、行政大樓、商學大樓 |
| 廁所 30 處、無障礙廁所 1 處、飲水機 28 處 | `FCU map.osm`、使用者現場確認 | 全校散佈點位；行政大樓無障礙廁所／飲水機位置 |
| 飲水機精確樓層 27 點 | `map/115-06水質檢測報告總表_27台.pdf` | 19 棟建築 |
| 休憩空間 7 處 | `休憩空間與飲水機位置.pdf`、使用者現場確認 | 圖書館、商學、行政、人文社會、人言 |
| 教室編碼對照表 | `大樓與教室代碼.png` | 16 棟建築縮寫 |

**官方地圖上的 29 個項目，19 棟有完整設施頁**（`src/data/buildings.json` 裡
`tier: "full"`：教室編碼、電梯、廁所、飲水機、AED、休憩空間都有）。其餘 10 個項目
（行政二館、第一招待所、學思園、文華創意中心、逢甲智慧創新港、游泳池、綜合運動場、
網球場、籃球場、排球場）可以正常導航抵達、也都有照片，但因為沒有可靠的室內設施資料
來源，設施頁會顯示「資料建置中」，不會編造內容。要補資料：直接編輯
`scripts/build_content.py` 裡的 `CURATED` 字典，改完執行 `bash scripts/run_all.sh`
重新產生 `src/data/*.json`。

**校門**：西門/大門口、東門、北門有實測座標（`scripts/build_gates.py`），可作為
出發地或目的地。西門另外手動加了 `facingBearing`（`src/data/gates.json`，實測約
94°，即出西門直接接續榕榕大道的方向）——路線圖只有從西門出發那一小段路網，沒有辦法
判斷「剛出校門的第一個轉彎」，因為根本沒有上一段路可以拿來算轉彎角度；`facingBearing`
就是補這個缺口，讓 `routing.js` 的 `buildDirections()` 知道要拿西門的哪個方向當
起始基準，才能正確判斷出校門後是否需要立刻左轉/右轉。其他校門目前沒有這筆資料。

**大樓照片**：官方地圖上全部 29 個項目都已放入使用者本人實地拍攝的照片（JPG，於
`public/buildings/`），前端會直接顯示。照片來源與拍攝說明記錄在
`public/buildings/credits.json`。要再補照片：把圖檔放進 `public/buildings/`（注意
不是 `src/assets/`，Vite 只會把 `public/` 底下的檔案原樣發布成靜態網址），在
`credits.json` 補上一筆來源記錄，再把對應建築在 `scripts/build_content.py` 的
`PHOTOS` 字典補上 `"大樓中文名": "buildings/xxx.jpg"`。

**設施資料欄位**：除了原本的電梯／廁所／飲水機／AED／休憩空間，`facilities` 現在
還有 `accessibleElevators`（無障礙電梯位置）、`accessibleRestrooms`（無障礙廁所
位置）、`floors`（樓層配置，例如「2樓：教室」）——這三個欄位跟其他欄位一樣是
`CURATED` 字典裡的選填 list，只有實際有資料的大樓（目前是行政大樓）才會顯示對應
區塊。另外每棟建築有一個獨立的 `accessNote` 欄位（不受 `tier` 限制，`partial` 的
建築也會顯示），用於出入口／停車等一次性的重要提示，例如逢甲智慧創新港的入口與
建議停車場說明。

### 路網合併（技術細節，供之後維護參考）

`fcu_routing.osm`（手繪路線圖層）和 `FCU map.osm`（原始測繪圖層）在空間上重疊，但
節點 ID 完全不共用，天生是兩張互相沒有連通的圖。`scripts/parse_osm.py` 會在兩層
座標相近（12 公尺內）的地方自動加上橋接邊，把兩層縫合成同一張可走的路網；如果之後用
JOSM 修改/新增路徑，重新匯出後跑 `bash scripts/run_all.sh` 就會重新計算。

## 專案結構（細部）

```
project/
  client/
    src/
      data/           OSM 實測資料轉出的 JSON（buildings/graph/pois/gates/bounds）
                      ＋ buildingNamesI18n.js（大樓/校門名稱的日韓越印尼泰文對照表）
                      ＋ facilityContentI18n.js（設施地點描述文字的 6 語言對照表）
      utils/          projection.js（等距長方投影＋haversine 距離，供路線/停車場計算）、
                      mapProjection.js（把算好的路線投影校正到官方地圖插畫的像素座標，
                      見上方「地圖」）、Dijkstra 路線規劃、音效、Google Maps 連結、
                      停車場查詢、buildingOptions.js（下拉選單可選建築清單）、
                      dateFormat.js／activeWindow.js（公告/活動的台北時區日期格式化與
                      上下架時間窗判斷）、publicUrl.js（把 `public/` 底下的資源路徑
                      加上 `import.meta.env.BASE_URL`，讓網站部署在子路徑
                      如 GitHub Pages 專案頁時，圖片/PDF 連結仍然正確，見下方「部署」）、
                      bilingual.js（中文/目標語言雙語對照顯示邏輯）、
                      api.js（呼叫 server/ 的失敗優雅降級 fetch 包裝）
      stores/         Pinia：app.js（導覽流程狀態）、announcements.js（公告 CRUD）
      i18n/locales/   7 語系文字
      components/     各畫面元件（DeerSprite 是走路動畫貼圖；DriveInfoCard 是
                      開車流程的建議停車場小卡片；IntroSplash 含近期活動公告區塊
                      與首頁地圖連結）
      views/          GuideView（主流程）、AdminView（管理後台，含公告／活動／帳號三個頁籤）
    scripts/          Python：把 .osm / 各種 PDF/圖檔原始資料轉成 src/data/*.json
    public/buildings/ 建築實景照片（JPG，Vite 直接原樣發布）＋ credits.json 照片來源記錄
  server/
    auth.js           密碼雜湊（node:crypto scrypt）與 session token 產生
    db.js             SQLite schema（Node.js 內建的 node:sqlite）：
                      admins／sessions／announcements 表、buildings 表、
                      events 表、event_locations 多對多關聯表
                      （一個活動可對應多棟建築）
    seed.js           把 client/src/data/buildings.json 匯入 SQLite（可重複執行）；
                      資料庫沒有管理者帳號時，順便建立第一個管理者帳號
    index.js          Express REST API（帳號登入／管理、公告 CRUD、活動 CRUD、
                      地標 SQL LIKE 搜尋示範）
    campus.db         SQLite 資料庫檔（執行 npm run seed 後產生，不進版控）
```

## 後端（Node.js + Express + SQLite）：帳號、公告、活動

這是整個專案唯一需要 Node.js process 常駐執行的部分，其他所有功能（地圖／路線／
設施資訊）都是純前端靜態網站，不需要它就能正常運作。這個後端負責三件事：管理者帳號
（登入、改密碼、新增/移除管理者）、大樓異動公告、以及活動公告——後兩者的資料都存在
後端資料庫，所有管理者登入後看到、編輯的是同一份共用資料。管理者能輸入活動公告
（學測／演講／學術研討會…），系統在活動前一天自動在首頁顯示，訪客一進頁面就能查詢
活動地點並直接開始導覽。

資料庫使用 Node.js 22.5+ 內建的 `node:sqlite` 模組，`npm install` 在 `server/`
資料夾裡零原生依賴，幾秒鐘裝完，不需要編譯任何原生模組。

### 管理者帳號與登入

後台入口是**隱藏的**，UI 上沒有任何看得見的連結：在網站任何頁面按 `Ctrl+Alt+A`
（Mac 是 `Control+Option`，不是 `Command`；見 `App.vue` 的 `handleAdminHotkey`，全站
掛載、不只首頁才有）才會跳轉進去。實際路徑
預設是 `/admin`，可用 `client/.env.example` 的 `VITE_ADMIN_PATH` 覆寫成自訂路徑（例如
`/change-me-secret-path`）；這只是防止隨意瀏覽的「隱蔽」而非真正的存取控制——因為
Vite 會把這個路徑值打包進前端 JS，任何人檢查原始碼都能看到，真正的存取控制是後台
本身的帳號登入（見下方）。網址用 hash mode，所以完整網址長相是
`https://你的網域/#` + `VITE_ADMIN_PATH` 的值。

`/admin` 後台使用真正的帳號系統，取代了舊版寫死在前端原始碼裡的單一共用密碼：

- 密碼從不以明文儲存，而是用 Node.js 內建的 `node:crypto` scrypt 加鹽雜湊
  （見 `server/auth.js`），同樣不需要額外套件。
- 登入會換得一組隨機的 session token（`sessions` 資料表，有效期 30 天），存在瀏覽器
  `sessionStorage`，之後每次寫入請求都帶 `Authorization: Bearer <token>` 標頭，
  取代舊版每次都重傳密碼字串的做法。
- 任何管理者都可以在後台的「帳號管理」頁籤變更自己的密碼，也可以新增或移除其他
  管理者帳號（扁平權限，沒有分「擁有者」角色，因為這是給系辦/社團小團隊用的工具）；
  系統會擋下刪除最後一位管理者的操作，確保後台永遠至少有一個人能登入。

**第一次設定**：全新的資料庫沒有任何管理者帳號，執行 `npm run seed` 時
（`server/seed.js`）會自動建立第一個管理者帳號——帳號、密碼讀取 `server/.env` 的
`ADMIN_USERNAME` / `ADMIN_PASSWORD`（見 `.env.example`），若沒設定 `ADMIN_PASSWORD`
就自動產生一組隨機密碼並印在終端機上一次（請立刻記下來，之後不會再顯示）。之後要
新增其他管理者或改密碼，都從後台「帳號管理」頁籤操作即可，不用再碰 `.env`。

**這個機制比單純的前端密碼鎖要嚴謹得多，但仍然是給小團隊內部使用的簡易帳號系統**——
沒有信箱驗證、忘記密碼流程、或雙重驗證，密碼強度只檢查最少 8 個字元。管理者後台的
登入現在需要後端（`server/`）確實在執行才能使用；如果只跑純前端靜態站，`/admin`
會顯示「連不上伺服器」而無法登入，這是刻意的設計，因為驗證密碼本來就不該只在前端做。

`/api/auth/login` 有做以下幾層保護（見 `server/index.js`）：**登入速率限制**（同一個
IP 15 分鐘內最多 10 次嘗試，用 `express-rate-limit`，擋自動化密碼猜測）、**固定時間
密碼比對**（不管帳號存不存在，都會跑一次完整的 scrypt 運算再回應，避免回應時間差
洩漏「這個帳號存不存在」）、以及**統一的錯誤處理**（任何未預期的例外都會被攔截，
只回傳通用錯誤訊息，不會把伺服器內部路徑或堆疊追蹤洩漏給呼叫端）。

**資料庫結構**（`server/db.js`）：

- `admins`：管理者帳號（帳號、密碼雜湊、建立時間）。
- `sessions`：登入 session token，關聯到 `admins`，刪除管理者會連帶刪除其所有
  session（立即登出）。
- `announcements`：大樓異動公告（大樓、類型、區域、內容、起訖日期、建立者）。
- `buildings`：`client/src/data/buildings.json` 的唯讀鏡像，供 `/api/buildings/search`
  用 SQL `LIKE` 查詢示範（地標搜尋）。
- `events`：活動主體（標題、類型、起訖日期、說明）。
- `event_locations`：多對多關聯表，一個活動可以對應多棟建築（例如「學測」同時在 3
  棟教室大樓舉行）。設定 `PRAGMA foreign_keys = ON` 搭配 `ON DELETE CASCADE`，刪除
  活動時關聯資料自動清除。

**API 端點**（`server/index.js`）：

| 方法 | 路徑 | 說明 |
|---|---|---|
| POST | `/api/auth/login` | 帳號密碼登入，換得 session token |
| POST | `/api/auth/logout` | 登出，刪除目前的 session |
| GET | `/api/auth/me` | 驗證目前 token 是否有效 |
| POST | `/api/auth/change-password` | 變更自己的密碼，需要目前密碼 |
| GET | `/api/auth/admins` | 管理者帳號列表 |
| POST | `/api/auth/admins` | 新增管理者帳號 |
| DELETE | `/api/auth/admins/:id` | 移除管理者帳號（至少保留一位） |
| GET | `/api/health` | 健康檢查，回傳 `{ ok: true }`，不需登入 |
| GET | `/api/announcements` | 全部大樓異動公告（公開，不需登入） |
| POST | `/api/announcements` | 新增公告，需要 `Authorization: Bearer` 標頭 |
| PUT | `/api/announcements/:id` | 編輯公告，同上 |
| DELETE | `/api/announcements/:id` | 刪除公告，同上 |
| GET | `/api/events/upcoming` | 自動判定「明天以前開始、且尚未結束」的活動（`date('now') >= date(start_date,'-1 day')`），首頁公告區塊用 |
| GET | `/api/events/locations` | 所有近期活動涉及建築的去重清單，全站快速選單用 |
| GET | `/api/events` | 全部活動（含歷史），管理後台列表用 |
| POST | `/api/events` | 新增活動，需要 `Authorization: Bearer` 標頭，body 帶 `buildingIds` 陣列 |
| PUT | `/api/events/:id` | 編輯活動，同上 |
| DELETE | `/api/events/:id` | 刪除活動，同上 |
| GET | `/api/buildings/search?q=` | SQL LIKE 地標搜尋示範 |

**前端串接的幾個地方：**

1. `IntroSplash.vue`（首頁）：活動公告區塊。單一地點的活動點下去直接把目的地
   帶入導覽流程；多地點的活動點下去會在同一頁展開一個內嵌下拉選單，選單內容只有
   該活動涉及的建築，選一個之後才把目的地帶入。
2. `SelectForm.vue`（起訖點選擇頁）：一個全站範圍的「查詢活動地點」快速選單，
   彙整所有近期活動涉及的建築，方便使用者不記得活動名稱也能用地點反查。
3. `FacilityPanel.vue`（大樓設施頁）：顯示該大樓目前生效的異動公告。
4. `AdminView.vue`（管理後台）：「公告管理」「活動管理」「帳號管理」三個頁籤，
   活動表單的「活動地點」是多選 `<select multiple>`（按 Ctrl / Mac 按 Cmd 可複選）。

## 參考的 GitHub Repo

本專案參考了 [sanskruti1704/Campus_Finder](https://github.com/sanskruti1704/Campus_Finder)
（校園設施地圖與搜尋系統）的整體設計概念，具體參考／對照如下：

| Campus_Finder 的做法 | 本專案對應的做法 | 差異 |
|---|---|---|
| 用 JSON 檔案（`poi.json`）儲存地標／設施資料，前端讀取後在地圖上放標記 | `client/src/data/buildings.json`、`gates.json` 儲存建築/校門資料；地圖底圖是官方校園平面圖插畫（見上方「地圖」），真實 GPS 測繪資料只用來算路線，再投影到插畫像素座標上 | 本專案的地圖底圖是逢甲大學官方平面圖插畫，不是疊加在 Leaflet.js 底圖上的標記點，也不是自繪 SVG 向量圖 |
| 提供搜尋功能，快速找到房間/設施 | `server/index.js` 的 `/api/buildings/search` 用 SQL `LIKE` 查詢建築名稱/代碼/教室代碼 | Campus_Finder 的搜尋邏輯寫在 PHP（`server.php`），沒有使用資料庫；本專案改用 Node.js + Express + SQLite |
| 用節點資料＋最短路徑邏輯做步行導覽（`shortest.js`） | `client/src/utils/routing.js` 用 Dijkstra 演算法在 `graph.json`（1075 個真實測繪節點）上算最短路徑 | 概念相同（節點圖 + 最短路徑），本專案額外做了車輛開車自動找最近停車場、多語系、活動公告等功能 |
| 室內導覽頁面（`indoor.html`） | 未實作 | 室內樓層目前不需要 |

參考的是**整體資訊架構與功能設計思路**（地標資料驅動地圖標記、搜尋、節點圖＋最短
路徑導覽），沒有直接複製任何程式碼——使用的技術完全不同（Campus_Finder 是純 HTML/CSS/
JS + Leaflet.js + PHP，本專案是 Vue 3 + 官方地圖插畫 + Express/SQLite）。

## 上傳 GitHub ／ 部署到雲端

**1. 上傳到 GitHub**

```bash
cd project
git init
git add .
git commit -m "FCU Campus Navigation Service: Vue 3 前端 + Express/SQLite 後端"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo名稱>.git
git push -u origin main
```

`client/.gitignore` 和 `server/.gitignore` 已經排除 `node_modules`、`dist`、
`campus.db` 等不必要進版控的檔案，可以直接 `git add .`。

**2. 自動部署（GitHub Actions）**

推到 `main` 分支會自動觸發兩個獨立的部署工作流程（`.github/workflows/`），部署的是
同一份 `client/` 建置結果，各自是替代方案，不是互相依賴：

- **GitHub Pages**（`gh-pages.yml`）：build 完直接把 `client/dist/` 發布到
  `https://<帳號>.github.io/<repo名稱>/`。需要手動設定一次：repo 的
  Settings → Pages → Build and deployment → Source 選「GitHub Actions」（預設是
  「Deploy from a branch」，會改成用 Jekyll 顯示原始 README.md，不是這個網站）。
  因為 GitHub Pages 是把整個網站發布在專案子路徑下（不是網域根目錄），這個工作流程
  在 build 時會設定 `GITHUB_PAGES=true`，讓 `vite.config.js` 把 `base` 從 `/` 改成
  `/<repo名稱>/`，這樣打包出來的 JS/CSS/favicon 連結才會自動帶上正確的子路徑前綴。
  **注意**：Vite 只會自動處理 `index.html` 裡的資源連結；程式碼裡任何引用
  `public/` 資源的地方（圖片、PDF……）都必須透過 `src/utils/publicUrl.js` 組出網址，
  不能寫死成 `/xxx.png` 這種網域根目錄開頭的字串，否則在 GitHub Pages 子路徑下會
  404（這正是文華鹿走路地圖、貼圖等圖片曾經在 GitHub Pages 上顯示不出來的原因）。
- **Azure Static Web Apps**（`azure-static-web-apps.yml`）：從網域根目錄發布，設定
  上更接近一般網站。需要先在 Azure Portal 建立 Static Web App 資源取得
  `AZURE_STATIC_WEB_APPS_API_TOKEN`，連同 `VITE_ADMIN_PATH`、`VITE_API_BASE` 一起
  設成 repo secrets（Settings → Secrets and variables → Actions）；這些是 Vite 在
  build 時（也就是這個 Actions 工作流程執行 `npm run build` 的當下）就會烤進打包
  好的 JS 的環境變數，Azure Portal 裡事後改的「Configuration」環境變數不會生效。
  `server/`（管理者後台/公告/活動的後端）不會被這個工作流程部署，需要另外找地方跑
  （例如 Azure App Service），見下方「後端」章節。

兩者都只部署 `client/`（純前端靜態站），核心的地圖／路線規劃／設施資訊功能因此都
能正常運作；`server/` 要另外部署才能讓管理者後台/公告/活動功能生效。

## 已知限制 / 之後可以做的事

- **Google 地圖相關連結用的是免金鑰的非官方網址技巧**（`output=embed` 內嵌／
  `maps/dir/?api=1` 深連結），不是付費的官方 Embed/Directions API，長期穩定性不是
  Google 保證的。正式部署後建議實際點一次「開啟導航」按鈕確認顯示效果。
- **建築/校門名稱，以及設施地點描述文字，的日文、韓文、越南文、印尼文、泰文翻譯都是
  AI 最佳猜測翻譯**，不是逢甲大學官方多語標示（實體牌子只有中文＋英文）。設施地點
  描述涉及廁所/電梯/AED 等實際位置，正式對外使用前建議請通曉該語言的人抽查校對。
- 10 個次要項目（行政二館、第一招待所等，見上「資料從哪來」）設施頁顯示
  「資料建置中」，可透過 `build_content.py` 補資料。
- **部分建築的路網資料仍不完整**：`entranceNode` 預設是「抓幾何中心點最近的路網
  節點」（`scripts/parse_osm.py` 的 `nearest_graph_node()`），這在 `fcu_routing.osm`
  沒有實際測繪到某段步道時，可能算出繞遠路、甚至方向相反的路線（已修正的例子：建築館
  與語文大樓曾經共用同一個入口節點；資訊電機館的路線曾經是反的）。已知還有問題、
  但尚未修正的：科學與航太館、第一招待所、逢甲智慧創新港、理學大樓、體育館／綜合
  運動場（比直線距離明顯繞遠）；體育館與游泳池目前也共用同一個入口節點（跟建築館/
  語文大樓當初一樣的成因）。要排查／修正這類問題，`CampusMap.vue` 內建一個除錯疊圖
  （路線頁按 `g` 鍵，見上方「路網除錯疊圖」）可以直接看出哪裡缺路徑；修正方式是在
  `scripts/fcu_routing.osm` 補測繪真實步道後重新跑 `bash scripts/run_all.sh`，或（較
  不精確但立即見效的替代做法）直接在 `client/src/data/graph.json` 手動加節點/邊、
  在 `buildings.json` 指定正確的 `entranceNode`。
- 管理者帳號系統（見上方「管理者帳號與登入」）沒有信箱驗證、忘記密碼流程、或雙重
  驗證，屬於給小團隊內部使用的簡易帳號系統，不是企業級身分驗證機制；密碼強度也只
  檢查最少 8 個字元。
- **CORS 現在預設開放，需要手動設定才會收緊**：`server/index.js` 讀取 `CORS_ORIGIN`
  環境變數（見 `server/.env.example`）來限制允許的來源；正式部署時，請設定
  `CORS_ORIGIN=<你的前端網址>`，避免 API 對所有來源開放。
