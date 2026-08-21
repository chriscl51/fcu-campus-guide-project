# 文華鹿帶路 — 逢甲大學新生／訪客校內導覽網站

Vue 3 + Vite 打造的純前端（無後端資料庫）校內路線指引網站。文華鹿會帶新生 / 訪客
從你選的出發地（校門、大樓、或幫你找最近停車場）走到目的地大樓，沿途顯示文字導航、
預估步行時間，抵達後顯示大樓設施資訊（教室編碼、電梯、廁所、飲水機、AED、休憩空間）。

## 專案結構（第三輪：依作業規定拆成 server / client）

```
project/
  client/    Vue 3 + Vite 前端（純靜態，見下方「快速開始」）
  server/    Express + SQLite 後端（僅活動公告功能需要，見下方「活動公告後端」）
```

這次依照作業規定的資料夾結構重新整理成 `/project/server` + `/project/client` 兩個
獨立資料夾（原本是前端在根目錄、後端在 `server/` 的單一資料夾專案）。兩個資料夾
各自有自己的 `package.json`／`node_modules`，彼此透過 HTTP API 溝通
（`client` 呼叫 `http://localhost:3001`，見 `client/src/utils/api.js`），不是同一個
Node process。

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

**後端（選用，只有「活動公告」這個功能需要）：**

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

前端所有呼叫後端 API 的地方都是「失敗就優雅降級」（`client/src/utils/api.js` 的
`safeFetch()`）：如果沒有啟動 `server/`，活動公告相關的區塊就是不顯示，其餘功能
完全不受影響——這是刻意的架構設計，不是漏未處理的例外。

## 技術棧與關鍵設計決定

- **Vue 3 + Vite + Pinia + vue-router + vue-i18n**，全部是免費、無需 API 金鑰的套件。
- **地圖**：沒有使用 Google Maps 或任何地圖 API/金鑰。校園地圖是把 `scripts/` 裡真實
  的 GPS 經緯度資料（來自使用者用 JOSM 實測的 `fcu_routing.osm` / `FCU map.osm`）
  投影成自繪 SVG 向量地圖（`src/utils/projection.js`），完全離線可跑。地圖視覺風格
  參考了你提供的「逢甲大學校區平面圖」重新設計（`src/components/CampusMap.vue`）：
  每棟建築用真實測繪的多邊形（`footprint`，見下方「建築資料」）畫成實色色塊＋代碼
  標籤，而不是單純一個點，米色底＋酒紅/藍灰配色跟官方平面圖語感一致；校門
  （西門/東門/北門）也畫成紅色標記，跟官方地圖的紅字門標一致。因為底層座標
  還是真實 GPS 投影，鹿的走路動畫跟路線規劃精準度不受影響。**（第二輪回饋更新）**
  地圖版面加大到佔版面約 3/4（原本約 3/5），文字導航說明壓縮到約 1/4；建築代碼／
  名稱字體也放大（代碼 6.5px→11px、名稱 4.6px→7.5px，皆為地圖座標系單位）；原本
  底圖上會畫出全部 1074 個節點／3558 條邊的完整路網（看起來像雜亂的細線網），已經
  移除這層渲染，只保留目前這趟路線的醒目紅色虛線——路網資料本身還是完整保留供
  Dijkstra 計算使用，只是不再畫出來，视覺上乾淨很多也更接近真實紙本校園地圖的風格。
- **路線規劃**：Dijkstra 最短路徑演算法（`src/utils/routing.js`），跑在真實測繪的
  步行路網圖上（`src/data/graph.json`，1074 個節點）。
- **開車/停車場流程（第四輪回饋：恢復 Google 地圖左右分割卡片）**：選「🚗 開車」＋
  選目的地大樓按下開始後，系統自動算出離目的地最近的停車場（`utils/parking.js` 的
  `nearestParkingTo()`，不需要手動挑），**畫面直接自動跳到路線頁，不需要額外確認
  點擊**——這個「不用手動選停車場」的簡化維持第二輪的設計不變。**畫面本身這次改成
  左右分割**：左邊是本網站自己的校內導覽（`GuideView.vue` 的 `.drive-nav-card`，
  文華鹿從建議停車場最近的入口走到目的地大樓，跟平常走路模式的畫面一樣）；右邊是
  即時內嵌的 Google 地圖（`DriveInfoCard.vue`，重新加回 `<iframe>`，用
  `utils/mapsLink.js` 的 `googleMapsEmbedUrl()`），**釘選在建議停車場的位置**、
  **刻意不帶起點參數**，所以地圖上你自己輸入從哪裡出發即可（本網站沒有辦法/也不
  應該替你猜你人在哪裡開車出發）。這個左右分割版面其實是第二輪拿掉的
  `ParkingFinder.vue` 那種佈局，這次依你的回饋加回來，但拿掉了原本那個「手動選
  哪個停車場」的下拉選單（那是第二輪你要求拿掉的部分，這次沒有恢復）。`ParkingFinder.vue`
  這個檔案本身還留在專案裡但沒有任何地方引用它（沒有直接刪除，因為刪檔案照規定要
  先問過你）——如果確定不需要了，之後可以請我或自行刪除。
- **停車場資料精簡（第四輪回饋）**：原始測繪資料裡有 19 個「停車場」點位，大多是
  沒有名稱的機車格或同一個停車場被拆成好幾段的重複線段，導致地圖上停車場圖示很亂。
  依你的回饋，`utils/parking.js` 現在只保留兩個真正可以當作「開車目的地」的停車場：
  **逢甲大學凱旋停車場**、**體育館地下停車場**（後者是從 19 個原始點位裡，比對跟
  `體育館` 建築座標距離最近的一個「B2汽車停車場」點位對應過去，見程式碼註解），
  其餘 17 個未使用的點位不再顯示在地圖上，也不會被「自動判斷最近停車場」邏輯選中。
- **文華鹿走路動畫（第二輪回饋重繪）**：`src/components/DeerSprite.vue`，手繪 SVG
  向量插畫。第一版是正面朝向鏡頭、只靠左右翻轉表示方向，被回饋「看起來像兩隻觸角
  的昆蟲」「醜」；這版整個重畫成**側面角色行走姿態**——像經典 RPG 遊戲裡角色在
  地圖上移動的畫法：頭朝行進方向、身體橫向、兩對腿以對角步態交替擺動（前右腳＋
  後左腳同相位，前左腳＋後右腳反相位），配合身體上下起伏，小尺寸（地圖上約
  32px）也看得出是隻正在走路的鹿，不是原地晃動的吉祥物玩偶。配色與角色設計仍然
  參考你上傳的鹿吉祥物圖片（暖色調毛皮、藍紫漸層鹿角、FCU 深藍/白色鞍布配色），
  不是直接使用原圖。**技術限制說明（仍然適用）**：這個任務環境沒有提供 AI 圖片
  生成工具，沒辦法真的產生你要的「貼圖風格插畫」點陣圖或序列幀，這版側面走路
  設計是在沒有圖片生成工具的限制下，能做到最接近「遊戲角色在地圖上移動」效果的
  做法。如果你之後有現成的 AI 生成貼圖序列幀圖檔（例如自己用 Midjourney/DALL-E
  生成的 8 方向或 4 方向行走 sprite sheet），可以直接告訴我圖檔規格，我把
  `DeerSprite.vue` 換成 `<img>` 序列/CSS sprite sheet 動畫。
- **音效**：`src/utils/sound.js` 用瀏覽器 Web Audio API 即時合成（歡迎聲、腳步聲、
  抵達提示音），沒有外部音檔，沒有版權疑慮，離線也能播放。
- **多語系**：繁體中文／英文／日文／韓文／越南文／印尼文／泰文，共 7 語系
  （`src/i18n/locales/`）。開啟網頁時自動偵測手機/瀏覽器系統語系
  (`src/i18n/index.js` 的 `detectLocale()`)，偵測不到就顯示英文；中文只會顯示繁體，
  不會自動顯示簡體。
- **雙語對照顯示**（`src/utils/bilingual.js`）：語言切換到非中文時，下拉選單（校門/
  大樓清單）跟大樓設施資訊頁的標題/欄位標籤，會顯示「中文 / 目標語言」雙語對照
  （例如「圖書館 / Library」「圖書館 / 図書館」），方便你拿手機畫面直接比對校園
  裡的實體中英文牌子。地圖上的建築標籤則只顯示「中文名稱＋英文代碼」（如
  `LIB`／`CMB`），不做 7 語言全雙語，避免地圖太擠——這是你確認過的範圍。
  大樓/校門在日/韓/越/印尼/泰文的名稱翻譯（`src/data/buildingNamesI18n.js`）是
  AI 提供的最佳猜測翻譯，**不是官方多語標示**（逢甲大學校園實體牌子只有中文＋
  英文），沒有對應翻譯的項目會自動顯示英文代替。
  **（第二輪回饋更新）** 設施內容本身（廁所/飲水機/電梯等實際地點描述文字，例如
  「各樓層南北兩側走廊底端」）原本刻意維持只有中文；你回饋「翻譯不完整」後，這部分
  現在也加上雙語對照了——新增 `src/data/facilityContentI18n.js`，把 19 棟完整設施頁
  建築、5 類設施（電梯/廁所/飲水機/AED/休憩空間）裡全部 70 組不重複的地點描述文字，
  逐句人工翻譯成英/日/韓/越/印尼/泰 6 種語言（樓層數字、房間代碼、方位、營業時間等
  安全相關細節都保留原文照抄，只有敘述部分意譯），跟建築/校門名稱一樣標註**AI 最佳
  猜測翻譯，非官方多語標示**。這些文字描述的是廁所/電梯/AED 的實際位置，翻譯錯誤的
  風險比完全不翻譯更高，所以請把這些翻譯當作「輔助理解方向」，正式使用前建議請通曉
  該語言的人抽查一輪；有能力的話，日後改成聘請專業翻譯或串接付費翻譯 API 校正過的
  版本會更可靠。
- **管理者後台**（`/admin`，密碼在 `src/views/AdminView.vue` 頂部的
  `ADMIN_PASSWORD` 常數，預設 `fcu2026`，建議上線前自行更改）：可新增/編輯/刪除
  「大樓異動公告」（整修中、廁所故障、電梯故障、停水、停電等）。公告內容需要
  **分語言分別輸入**——新增/編輯表單裡每種語言都有一個輸入框，「繁體中文」與
  「English」為必填，其餘 5 語言選填；訪客瀏覽時依自己的語言顯示對應版本，若該
  語言沒填就自動顯示英文版本。（這個設計是因為專案沒有串接付費翻譯 API，公告內容
  又涉及安全/設施資訊，機器翻譯錯誤的風險比要求人工填寫更高。）公告資料採「雙軌」
  儲存：
  1. 存在瀏覽器 `localStorage`（管理者這台裝置上，重新整理不會消失）
  2. 可「匯出 JSON」下載 `announcements.json`，把它蓋掉
     `public/data/announcements.json` 後重新 `npm run build` 部署，所有訪客打開網站
     時就會載入這份公告當作起始基準（之後個別瀏覽器的 localStorage 編輯會疊加在上面）。

  **這個後台只是前端頁面鎖，不是真正的資安機制** —— 密碼就寫在前端原始碼裡，擋不住
  存心繞過的人，只適合系辦/社團內部簡易使用。頁面上也有寫這段提醒。

## 資料從哪來（誠實說明資料完整度）

所有資料都來自你資料夾裡的**真實測繪檔案**，沒有捏造座標或內容：

| 資料 | 來源檔案 | 涵蓋範圍 |
|---|---|---|
| 步行路網（1074 節點） | `fcu_routing.osm` + `FCU map.osm` | 全校園，見下方「路網合併」說明 |
| 32 棟建築座標與外形多邊形 | `FCU map.osm`（含 `<way>` 與 `<relation>` 多邊形） | 全校，含原本被漏抓的行政二館（relation） |
| 建築中英文正式名稱／代碼 | `建築照片/校園地圖中英對照.HEIC`（官方牌樓地圖） | 24 棟建築，見 `scripts/build_content.py` 的 `OFFICIAL_CODES` |
| 建築實景照片 6 張 | 你提供的 `fcu/建築照片/` 資料夾（HEIC 轉 JPG） | 圖書館、忠勤樓、工學館、丘逢甲紀念館、科學與航太館、行政二館 |
| 電梯 8 處 | `fcu_routing.osm` | 忠勤樓×4、圖書館×1、+3 處 |
| AED 8 處 | `map/AED.pdf` | 體育館、育樂館、人言大樓、共善樓、行政大樓、商學大樓 |
| 廁所 30 處、飲水機 28 處 | `FCU map.osm` | 全校散佈點位 |
| 飲水機精確樓層 27 點 | `map/115-06水質檢測報告總表_27台.pdf` | 19 棟建築 |
| 休憩空間 7 處 | `休憩空間與飲水機位置.pdf` | 圖書館、商學、行政、人文社會、人言 |
| 教室編碼對照表 | `大樓與教室代碼.png` | 16 棟建築縮寫 |

**約 19 棟建築有完整設施頁**（`src/data/buildings.json` 裡 `tier: "full"`），其餘
建築（宿舍、招待所、警衛室等）可以正常導航抵達，但設施頁會誠實顯示「資料建置中」，
不會編造內容。你之後可以直接編輯 `scripts/build_content.py` 裡的 `CURATED` 字典
補資料，改完執行 `bash scripts/run_all.sh` 重新產生 `src/data/*.json`。

**校門**：西門/大門口、東門、北門有實測座標（`scripts/build_gates.py`）。南門已於
2026 年永久關閉並拆除，已從可選出發點清單、地圖標記與所有語言的介面文字中移除
（見 `client/src/data/gates.json`）；底層路網節點沒有動，因為那個節點是一般路口，
不是南門專屬的。

**大樓照片**：這個任務環境的網路政策擋掉了所有對外的圖片下載，所以仍然沒辦法從
`fcu.edu.tw` 之類的官網下載照片；不過你後來直接提供了 `fcu/建築照片/` 資料夾
（本人實地拍攝，HEIC 格式），這 6 張已經轉成 JPG 放進 `public/buildings/` 並掛上
對應建築（圖書館、忠勤樓、工學館、丘逢甲紀念館、科學與航太館、行政二館），前端會
直接顯示這些真實照片。其餘約 13 棟有完整設施頁但還沒有照片的建築，`photo` 欄位仍是
`null`，前端顯示「照片準備中」留白版位——這是刻意保留空白給你，不會自動生成或抓取
替代圖片。照片來源與拍攝說明記錄在 `public/buildings/credits.json`。要再補照片：
把圖檔放進 `public/buildings/`（注意不是 `src/assets/`，Vite 只會把 `public/` 底下
的檔案原樣發布成靜態網址），再把對應建築在 `scripts/build_content.py` 的 `PHOTOS`
字典補上 `"大樓中文名": "buildings/xxx.jpg"`。

### 路網合併（技術細節，供你之後維護參考）

`fcu_routing.osm`（手繪路線圖層）和 `FCU map.osm`（原始測繪圖層）在空間上重疊，但
節點 ID 完全不共用，天生是兩張互相沒有連通的圖。`scripts/parse_osm.py` 會在兩層
座標相近（12 公尺內）的地方自動加上橋接邊，把兩層縫合成同一張可走的路網；如果你
之後用 JOSM 修改/新增路徑，重新匯出後跑 `bash scripts/run_all.sh` 就會重新計算。

## 專案結構（細部）

```
project/
  client/
    src/
      data/           OSM 實測資料轉出的 JSON（buildings/graph/pois/gates/bounds）
                      ＋ buildingNamesI18n.js（大樓/校門名稱的日韓越印尼泰文對照表）
                      ＋ facilityContentI18n.js（設施地點描述文字的 6 語言對照表）
      utils/          投影、Dijkstra 路線規劃、音效、Google Maps 連結、停車場查詢、
                      bilingual.js（中文/目標語言雙語對照顯示邏輯）、
                      api.js（呼叫 server/ 的失敗優雅降級 fetch 包裝）
      stores/         Pinia：app.js（導覽流程狀態）、announcements.js（公告 CRUD）
      i18n/locales/   7 語系文字
      components/     各畫面元件（DeerSprite 是手繪側面行走 SVG 鹿精靈；DriveInfoCard 是
                      開車流程的建議停車場小卡片；IntroSplash 含近期活動公告區塊；
                      ParkingFinder 是舊版雙卡片停車場畫面，已無任何地方引用，未刪除）
      views/          GuideView（主流程）、AdminView（管理後台，含公告＋活動兩個頁籤）
    scripts/          Python：把 .osm / 各種 PDF/PNG/HEIC 原始資料轉成 src/data/*.json
    public/data/      announcements.json（管理者公告的「出廠預設值」）
    public/buildings/ 建築實景照片（JPG，Vite 直接原樣發布）＋ credits.json 照片來源記錄
  server/
    db.js             SQLite schema（Node.js 內建的 node:sqlite，見下方說明）：
                      buildings 表、events 表、event_locations 多對多關聯表
                      （一個活動可對應多棟建築）
    seed.js           把 client/src/data/buildings.json 匯入 SQLite（可重複執行）
    index.js          Express REST API（活動 CRUD、地標 SQL LIKE 搜尋示範）
    campus.db         SQLite 資料庫檔（執行 npm run seed 後產生，不進版控）
```

## 活動公告後端（Node.js + Express + SQLite）

這是整個專案唯一需要 Node.js process 常駐運行的功能，其他所有功能（地圖／路線／
設施資訊）都是純前端靜態網站，不需要它就能正常運作。做這個功能有兩個理由：一是
作業規定「需要包含前、後端、資料庫」；二是它本身也是一個 campus navigation 真的
用得上的功能——管理者輸入活動公告（學測／演講／學術研討會…），系統在活動前一天
自動在首頁顯示，訪客一進頁面就能查詢活動地點並直接開始導覽。

**重要修正：改用 Node.js 內建的 `node:sqlite`，不再用 `better-sqlite3`。** 一開始
用的是 `better-sqlite3`，這個套件在 `npm install` 時需要編譯一個原生模組（透過
node-gyp 下載跟你電腦 Node 版本對應的 headers）。這在網路受限或缺少編譯工具（例如
沒裝 Xcode Command Line Tools）的環境下會**編譯失敗、且不一定會有明顯錯誤訊息**，
後端就悄悄地沒啟動——前端所有 API 呼叫又是設計成「連不到後端就優雅降級、不報錯」
（見 `utils/api.js`），兩個「安靜失敗」疊在一起，就是活動公告版面空白、卻看不出
原因的最可能成因。這次改用 Node.js 22.5+ 內建的 `node:sqlite` 模組，**完全不需要
編譯任何原生模組**，`npm install` 在 `server/` 資料夾裡零原生依賴、幾秒鐘裝完。
你的 Node 版本（24.x）遠高於最低需求，可以直接用。程式碼層面的差異很小（`db.exec()`
換成標準 PRAGMA 語法、`db.transaction()` 換成手動 `BEGIN/COMMIT` 包裝的
`runInTransaction()` 函式），API 的行為完全沒變。

**資料庫結構**（`server/db.js`）：

- `buildings`：`client/src/data/buildings.json` 的唯讀鏡像，供 `/api/buildings/search`
  用 SQL `LIKE` 查詢示範（地標搜尋）。
- `events`：活動主體（標題、類型、起訖日期、說明）。
- `event_locations`：**多對多關聯表**，一個活動可以對應多棟建築（例如「學測」同時
  在 3 棟教室大樓舉行）——這是回饋中特別要求的設計，不是單一 `building_id` 欄位。
  設定 `PRAGMA foreign_keys = ON` 搭配 `ON DELETE CASCADE`，刪除活動時關聯資料
  自動清除。

**API 端點**（`server/index.js`）：

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/events/upcoming` | 自動判定「明天以前開始、且尚未結束」的活動（`date('now') >= date(start_date,'-1 day')`），首頁公告區塊用 |
| GET | `/api/events/locations` | 所有近期活動涉及建築的去重清單，全站快速選單用 |
| GET | `/api/events` | 全部活動（含歷史），管理後台列表用 |
| POST | `/api/events` | 新增活動，需要 `x-admin-password` 標頭，body 帶 `buildingIds` 陣列 |
| PUT | `/api/events/:id` | 編輯活動，同上 |
| DELETE | `/api/events/:id` | 刪除活動，同上 |
| GET | `/api/buildings/search?q=` | SQL LIKE 地標搜尋示範 |

**前端串接的三個地方：**

1. `IntroSplash.vue`（首頁）：活動公告區塊。單一地點的活動點下去直接把目的地
   帶入導覽流程；**多地點的活動點下去會在同一頁展開一個內嵌下拉選單**，選單內容
   只有該活動涉及的建築（例如學測的 3 棟教室大樓），選一個之後才把目的地帶入——
   不會跳轉頁面，就是首頁本身多展開一小塊。
2. `SelectForm.vue`（起訖點選擇頁）：一個全站範圍的「查詢活動地點」快速選單，
   彙整所有近期活動涉及的建築，方便使用者不記得活動名稱也能用地點反查。
3. `AdminView.vue`（管理後台）的「活動管理」頁籤：新增/編輯表單裡的「活動地點」
   是一個多選 `<select multiple>`（按 Ctrl / Mac 按 Cmd 可複選多棟建築），對應到
   資料庫的多對多關聯。

**這個後台密碼保護跟公告功能一樣，只是前端傳一個 header 給後端比對字串，不是真正
的身份驗證機制**（見 `server/index.js` 的 `requireAdmin`），正式對外使用前請自行
評估是否需要換成真正的登入/權杖機制。

## 參考的 GitHub Repo

依作業規定「需要參考 GitHub 上面的 repo，並說明參考的部分」，本專案參考了
[sanskruti1704/Campus_Finder](https://github.com/sanskruti1704/Campus_Finder)（校園
設施地圖與搜尋系統）的整體設計概念，具體參考／對照如下：

| Campus_Finder 的做法 | 本專案對應的做法 | 差異 |
|---|---|---|
| 用 JSON 檔案（`poi.json`）儲存地標／設施資料，前端讀取後在地圖上放標記 | `client/src/data/buildings.json`、`gates.json` 儲存建築/校門資料，`CampusMap.vue` 讀取後畫成 SVG 色塊＋代碼標籤 | 本專案的地圖是自繪 SVG 向量圖（投影自真實 GPS 測繪資料），不是疊加在 Leaflet.js 底圖上的標記點 |
| 提供搜尋功能，快速找到房間/設施 | `server/index.js` 的 `/api/buildings/search` 用 SQL `LIKE` 查詢建築名稱/代碼/教室代碼 | Campus_Finder 的搜尋邏輯寫在 PHP（`server.php`），沒有使用資料庫；本專案改用 Node.js + Express + SQLite 實作同樣「輸入關鍵字→回傳符合的地點」的功能 |
| 用節點資料＋最短路徑邏輯做步行導覽（`shortest.js`） | `client/src/utils/routing.js` 用 Dijkstra 演算法在 `graph.json`（1074 個真實測繪節點）上算最短路徑 | 概念相同（節點圖 + 最短路徑），本專案額外做了車輛開車自動找最近停車場、多語系、活動公告等 Campus_Finder 沒有的功能 |
| 室內導覽頁面（`indoor.html`） | 未實作 | 依你先前的回覆「室內樓層目前不需要」，這次刻意不做 |

參考的是**整體資訊架構與功能設計思路**（地標資料驅動地圖標記、搜尋、節點圖＋最短
路徑導覽），沒有直接複製任何程式碼——技術棧完全不同（Campus_Finder 是純 HTML/CSS/
JS + Leaflet.js + PHP，本專案是 Vue 3 + SVG 自繪地圖 + Express/SQLite）。

## 上傳 GitHub ／ 部署到雲端

這兩步需要你自己的 GitHub／雲端帳號權限，我沒有辦法代替你登入或建立雲端資源，
以下是給你的操作步驟（你在自己的電腦或終端機執行）：

**1. 上傳到 GitHub**

```bash
cd project
git init
git add .
git commit -m "FCU 校園導覽網站：Vue 3 前端 + Express/SQLite 後端"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo名稱>.git
git push -u origin main
```

`client/.gitignore` 和 `server/.gitignore` 已經排除 `node_modules`、`dist`、
`campus.db` 等不必要進版控的檔案，可以直接 `git add .`。

**2. Azure 部署（作業提到「可將專案放到 azure」）**

Azure 沒有能同時免費跑「靜態前端＋常駐 Node.js 後端」的單一服務，建議拆成兩個
Azure 資源：

- **前端**：[Azure Static Web Apps](https://azure.microsoft.com/products/app-service/static)
  （有免費方案）——把 `client/` 接到 GitHub repo，build command 設
  `npm run build`，輸出目錄設 `dist`。
- **後端**：[Azure App Service](https://azure.microsoft.com/products/app-service)（Node.js
  runtime）——部署 `server/` 資料夾，啟動指令 `npm start`；上線前務必用環境變數
  覆蓋 `ADMIN_PASSWORD`，並在 `server/index.js` 的 `cors()` 設定裡把允許來源限制成
  你的 Static Web Apps 網址（目前是完全開放 `*`，本機開發沒問題，正式上線建議收緊）。
  部署後把 `client/src/utils/api.js` 的 `API_BASE`
  （或建置時的環境變數 `VITE_API_BASE`）改成後端的正式網址。

**Google Sites 沒辦法用來放這個後端**——它是純靜態頁面/嵌入元件的建置工具，不支援
執行任何伺服器端程式碼（Node.js/PHP/資料庫都不行）。如果只是想放前端靜態站，
Google Sites 的「嵌入」功能理論上可以嵌入一個外部網址（例如你部署到 Azure Static
Web Apps 或 GitHub Pages 的網址），但沒辦法把 Express/SQLite 後端搬進 Google Sites
本身。你先前確認過「暫時本機部署演示就好」，所以這次沒有實際去建立 Azure 資源，
只整理好可以直接照抄的部署步驟。

## 之後若要接你自己畫的 Figma 校園地圖（這次尚未實作）

回饋裡提到「如果我用 Figma 繪製校園路線地圖圖層，可以讓小鹿按照 edge/node 計算路線
在我畫的地圖上移動，但不露出 edge/node 圖層」——這個方向技術上完全可行，但這次沒有
實作，因為還沒有你的 Figma 檔案可以參考，硬猜檔案格式/座標系統只會做出一套跟你實際
產出對不起來的東西（「不確定的地方明說，不要猜」）。這次先做了一個立即見效的部分：
把目前底圖上會露出的完整路網線條（edge/node 圖層）整個隱藏了，只留醒目的當前路線
（見上方「地圖」段落），視覺上已經乾淨很多。

真正接上你自己畫的地圖，需要你之後提供以下其中一種東西，我才能實作，不會用猜的：

1. **背景圖 + 校準點對照表（推薦，最簡單）**：匯出你 Figma 地圖的圖片（PNG/SVG），
   再告訴我圖上至少 3～4 個你能明確指出像素座標的地標（例如某棟建築角落、某個路口）
   對應到真實世界的位置（可以用建築名稱，我這邊已經有真實 GPS）。我會用仿射轉換
   方法，把整張路網／建築／文華鹿位置換算到你的圖片座標系上，疊在你的背景圖上顯示，
   不用你自己去對每一個路網節點。
2. **每個節點的精確像素座標（較費工，但最準確）**：如果你在 Figma 裡把 `graph.json`
   裡的 1074 個節點都手動點放到你畫的路網上（例如用 Figma plugin 匯出每個圖層的
   x/y），提供一份「節點 ID → 像素座標」的對照表（JSON/CSV 皆可），我可以完全用
   你的座標取代目前的 GPS 投影，路網幾何跟你的手繪路徑完全一致。

不管哪一種，「不露出 edge/node 圖層」都會維持現狀的做法：路網/節點資料只用來算路徑，
畫面上只畫出當前路線與文華鹿位置，不畫節點或全部邊。

## 已知限制 / 之後可以做的事

- **大樓照片仍有約 13 棟留白**（另外 6 棟已經用你提供的實景照片補上，見上）。
- **文華鹿走路動畫是手繪 SVG 向量圖，不是 AI 生成的貼圖插畫**——這個任務環境沒有
  提供圖片生成工具，所以無法完全照你選的「AI生成貼圖風格插畫」做。第二輪回饋後已
  重繪成側面行走姿態（見上方「文華鹿走路動畫」段落），但仍然是手繪 SVG，不是 AI
  生成的點陣圖/貼圖序列幀。如果之後你有現成的 AI 生成貼圖序列幀圖檔，可以直接換掉
  `DeerSprite.vue` 改用 `<img>` 序列或 CSS sprite sheet。
- **自訂 Figma 地圖圖層尚未實作**——需要你提供背景圖+校準點，或節點像素座標表，
  詳見上方新增的「之後若要接你自己畫的 Figma 校園地圖」段落。這次已經先把路網
  edge/node 圖層從畫面上隱藏了（只留當前路線），視覺上有立即改善。
- **Google 地圖相關連結用的是免金鑰的非官方網址技巧**（`output=embed` 內嵌／
  `maps/dir/?api=1` 深連結），不是付費的官方 Embed/Directions API，長期穩定性不是
  Google 保證的（見上「開車/停車場流程」段落）。開發沙盒環境對外網路被擋，所以這次
  沒辦法在測試截圖裡實際驗證內嵌地圖/深連結在真實瀏覽器中的最終顯示效果，只驗證了
  連結網址本身的組成邏輯正確；正式部署後建議你自己實際點一次「開啟導航」按鈕確認。
- **建築/校門名稱，以及設施地點描述文字，的日文、韓文、越南文、印尼文、泰文翻譯都是
  AI 最佳猜測翻譯**，不是逢甲大學官方多語標示（實體牌子只有中文＋英文）——見上方
  「雙語對照顯示」段落。設施地點描述涉及廁所/電梯/AED 等實際位置，正式對外使用前
  建議請通曉該語言的人抽查校對。
- 約 15 棟次要建築（宿舍、招待所等）設施頁顯示「資料建置中」，可透過
  `build_content.py` 補資料。
- 少數幾棟建築（如丘逢甲紀念館）因為建築入口節點是抓「幾何中心點最近的路網節點」，
  實際導航距離會比直線距離長一些（多繞路但仍然可達，不是斷路），如果要更精準可以
  改成手動指定各棟建築的實際大門節點。
- 管理者密碼是寫死在前端原始碼的簡易鎖，正式對外使用前請自行評估是否需要真正的後端
  驗證機制。`server/index.js` 的 `ADMIN_PASSWORD` 同樣是明文比對，只是換成環境變數
  預設值，同樣不是真正的身份驗證，見上方「活動公告後端」段落。
- **CORS 目前完全開放**（`server/index.js` 的 `app.use(cors())` 沒有限制來源），
  本機開發沒問題，正式部署到 Azure 後建議改成只允許你的前端網域。
- **本機部署演示已驗證可行**（見上方「快速開始」），Azure 雲端部署步驟已整理在
  「上傳 GitHub ／ 部署到雲端」段落，但這次沒有實際建立 Azure 資源去驗證
  （你確認過暫時只需要本機演示）。
- **作業要求的 HackMD/Notion 教學說明文件（含姓名、網站標題、執行畫面截圖）不在
  這次產出範圍內**——那是一份需要放你本人姓名、且通常會搭配你自己截圖操作過程的
  文件，這邊沒有代寫；如果你想要，我可以幫你草擬文字內容（功能說明、安裝步驟、
  API 文件），screenshot 的部分你可以用上面「本機測試」流程跑起來後自己截圖，或
  告訴我你想要哪些畫面，我可以用 Playwright 幫你產生截圖素材。
