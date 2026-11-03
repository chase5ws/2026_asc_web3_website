# AGENTS.md — 給 AI 協作者與開發者

## 專案
ASC 鏢局的公開網頁（純靜態，沒有建置步驟，GitHub Pages）。**一頁式**（`index.html`＋`app/`）串接 Polygon 上的 V2 四份合約：金庫 AscPointV2（ASC）、喵武士 AscCatSamuraiV2、配件 AscCatParts、市場 AscMarket（合約專案 `2022_web3_solidity_asc_smart_contract`；已上鏈那版的原始碼與 ABI 在本資料夾 `contracts-asc/`）。**Discord 機器人（`2026_asc_discord_bot`）只負責綁定錢包**，兩邊只透過綁定 API 溝通。使用者用中文溝通。

## 鏈上地址（Polygon 137）
- 見 `config.js`（`vault`、`nft`、`parts`、`market`、`usdt`、部署區塊、Safe）。owner＝Safe `0x7c532A61349814633CdE4f81652Cb0E35BEB75f6`。
- 舊系統：V1 金庫 `0x9a431fED8Bc5fa595E5c9fdB1abb0a3119fBD5Ad`、喵武士 V1 `0x39c774673A25B0f1F600Bf39edF639c0f44a7488`（`config.js` 的 `nftV1`）。

## 檔案
| 檔案 | 說明 |
|---|---|
| `index.html` | 整頁版面；載入 ethers（cdnjs）→ `config.js` → `app/i18n.js`、`chain.js`、`look.js`、`price.js`、`ui.js`、`nft.js`、`market.js`、`token.js`、`admin.js`（都帶 `?v=` 版本號，改檔要換） |
| `app/i18n.js` | `ASC_T`（`zh`／`en`，HTML 用 `data-t`；**新增文字兩種語言都要加**）、`ASC_STORY`（四章故事）、`ASC_NAMES`（部位／稀有度／配件中文名） |
| `app/chain.js` | `window.ASCChain`：ABI、唯讀 RPC、連錢包（自動切到 Polygon）、錯誤解析、ERC-20 授權、分段 getLogs |
| `app/look.js` | traits.json、配件清單、每顆外觀（`v2/state.json`＋最新事件，算法同 sync_v2.py）、疊圖 |
| `app/price.js` | 走勢：`v2/price.json`＋最新事件 |
| `app/ui.js` | 狀態、分頁（網址 hash）、語言（localStorage `asc-lang`＝`zh`／`en`）、錢包狀態列、讀鏈、送交易訊息；`#bind=` 轉到 `bind/` |
| `app/nft.js`、`app/market.js`、`app/token.js` | 各區塊 |
| `app/admin.js` | 管理員面板（見下方紀錄） |
| `app/style.css` | 全站樣式（首頁、服務條款、隱私權、綁定頁共用） |
| `bind/` | 綁定錢包頁（獨立小頁：`index.html`＋`page.js`，自己帶中英文字，只用 `config.js` 的 `botApi` 和 `app/style.css`；`GET`／`POST {botApi}/api/bind/<金鑰>`、`personal_sign`，不載入 ethers） |
| `terms/`、`privacy/` | 服務條款、隱私權政策 |
| `assets/` | 圖片（見 `assets/README.md`） |
| `contracts-asc/` | 主網合約原始碼／ABI 快照（**不上網站**） |
| `config.js` | `window.ASC_CONFIG`：鏈、RPC、合約地址、部署區塊、`assets`（外觀資料 GitHub Pages）、`botApi`、`refreshSeconds` |
| `serve.js` | 零依賴本機伺服器（只給 html/js/css/圖片） |
| `.github/workflows/pages.yml` | GitHub Pages：只複製 `index.html config.js app assets bind terms privacy` |

## 原則
- 不放任何機密、不依賴後端；機器人離線時只有綁定錢包不能用。
- 台灣慣例：漲紅（`--up`）跌綠（`--down`）。
- 金庫 owner 指令（發 ASC、存款、開關）在 Safe 的 Transaction Builder 做，不在網頁。

## 測試方式
曾用 Chromium＋假 RPC＋假 MetaMask 測過（桌面 1366、手機 390，每一頁）：即時幣值、走勢重播、兌換預估與按鈕、最少／本期最多、轉 ASC 防呆、交易完成、綁定錢包簽名送回。手機寬度沒有橫向捲動。

## 變更紀錄
- 2026-10-20：從 `2022_web3_solidity_asc_smart_contract/site/` 搬出成為獨立專案（舊版金庫的 claim 介面）。
- 2026-10-24：**改接已上線的 AscPoint**（ASC、`query`、`exchange`、`transfer`）；新增即時幣值（左右兩邊池子、中間價格與走勢圖）、我的 ASC 與持有比例階梯、兌換預估、轉 ASC、規則與門檻；**綁定錢包頁從機器人搬到網站**（`#bind=`）；改成科技江湖風格（深藍＋紅）、三種裝置版面；圖片欄位 `assets/`；信物 NFT 改為 `0x39c7…7488`；移除機器人的 `/api/exchange/stats`（匯率分母改用鏈上 totalSupply）。
- 2026-10-25：中英文版（`lang.js`、右上角切換）；整頁「ASC鏢局」斜向浮水印；新增「鏢局故事」區塊（目標、名稱由來、師徒文化＋四章故事與漫畫裁圖 `assets/story-*.jpg`，點圖放大）；網站圖示 `assets/favicon.svg` 等。
- 2026-10-25：**改成多頁網站**（每頁一個資料夾：行情首頁、wallet、story、rules、nft、bind），Apple 式一整個畫面一段＋往下捲提示＋淡入＋下一頁；共用程式搬到 `shared/`；舊的 `app.js`、`lang.js` 不再使用；機器人綁定連結改為 `/bind/#bind=`。
- 2026-10-26：**改成一頁式並串接 V2**（`index.html`＋`app/`）：鑄造／解盲、VIP、換裝（疊圖試穿、脫下）、轉蛋（結果動畫）、背包、配件市場（上架／購買／下架）、行情走勢、買入、兌換、我的點數、轉出 ASC。外觀與走勢讀 `2026_asc_web3_ipfs` 的 `v2/state.json`／`v2/price.json` 再補最新鏈上事件。舊多頁版移到 `_to_delete/website-old/`；`bind/`、`shared/` 保留給綁定頁。測試：雲端 hardhat 本機鏈＋假 MetaMask（Playwright），每個功能都送過真交易；外觀與 sync_v2.py 結果逐顆比對一致；手機 390 寬沒有橫向捲動。

## 2026-11-02 整頁背景＋導覽列縮小
- `app/style.css`：`--pagebg`＝內嵌 SVG（`<pattern>` 200×76 一格、`rotate(-22)`，灰藍＋紅「ASC鏢局」）＋深藍漸層，全部 `background-attachment:fixed`，不用圖片。`body::before` 與頂部 `.top` 都用 `--pagebg`，所以導覽列和頁面背景接得起來、沒有色差，內容捲到底下也不會透出來。調密度改 pattern 的 width/height 與 font-size。
- 頂部導覽列縮小：logo、連結錢包、狀態 chip、語言切換、三分頁、子分頁的高度與字級都變小；按鈕底色改半透明。
- 網站 logo 換成「鏢」字刀劍漫畫圖：`assets/logo.png`（192×192，裁中間）取代左上角的「ASC」文字方塊（首頁、綁定頁）；`favicon.png`、`apple-touch-icon.png`、`icon-512.png` 也換成同一張；移除 `favicon.svg`（舊的 ASC 文字圖示，移到 `_to_delete/`）。
- 導覽列（`app/style.css` 最後一段）：一行，`.toprow` 三欄 `1fr auto 1fr` 讓三分頁 `#sw3` 永遠置中；左 品牌、中 `.mid`（`#sw3`＋`.subnav`）、右 `.right`（錢包＋下方小字狀態 chip、語言切換在最右）。桌機 NFT／Token 的子選單在該按鈕正下方、左緣對齊按鈕往右排（底線樣式），進到該分頁就出現；首頁沒有。手機（≤860px）子選單仍是分頁下方的底線列，chip 只在金庫未驗證／已標記時出現。桌機高度約 79px（NFT／Token 頁約 115px，原 195）。`app/*.css|js` 帶 `?v=`（目前 20261102j）避免快取，改檔記得換。
- 網站圖示改成跟左上角 logo 一樣：直接用 `logo.png` 那張圖、20% 圓角、無框、四角透明，`favicon-32.png`、`favicon.png`（64）、`icon-512.png`（都是 logo.png 整張縮放，不裁切）；`apple-touch-icon.png` 同一張但維持方形（iOS 自己裁圓角）。圖示連結加 `?v=20261102f`。首頁 `<title>`／`og:title` 改為「ASC鏢局」。
- 管理員面板 `app/admin.js`（＋`app/style.css` 的 `.ad-*`、`index.html` 的 `#adminPanel`）：連結錢包後讀 4 份合約的 `owner/pendingOwner/admin/operator`，owner 是合約時讀 Safe `getOwners/getThreshold`；只有 owner／admin／operator／Safe 簽署人／新主人才顯示。每個管理函式一張卡（清單 `A`，權限 operator／admin／★owner／pending，對照合約 repo `AGENTS.md` 第 6 節）：有權限就直接送交易；owner 是 Safe 就「加入 Safe 批次」→ 下載 Transaction Builder JSON（批次存在 localStorage `asc-admin-batch`）。另有狀態讀數與「查詢錢包」。合約改介面要同步改 `A`。測試：雲端 Playwright＋假 RPC／假 MetaMask：admin 直接送 setOpen、Safe 批次 withdrawReserve＋setAdmin 解碼正確、參數檢查、沒權限的錢包看不到面板。
- `contracts-asc/`：目前主網 4 份 V2 合約（AscPointV2／AscCatSamuraiV2／AscCatParts／AscMarket）的原始碼、ABI、部署紀錄快照，給只拿到網站資料夾的人／AI 參考。pages.yml 不複製它，所以不會上網站。合約專案已去 ASC 化（Token／NFT／Part／Market），這份是已上鏈那一版。
- 2026-11-02 瘦身：刪除沒用到的圖片 `story-spread.jpg`、`icon-512.png`（約 640KB）；`app/i18n.js` 刪掉 73 組沒用到的中英文字（舊版頁面留下的）；`app/style.css` 刪掉沒用到的樣式（`.eco .lib .shop .minicats .pill .bar .box .extra .grid3 .side-sw .eq-right .tile.zero`）；綁定頁改成獨立小頁、刪除整個 `shared/`（舊多頁版框架，約 78KB）並不再載入 ethers（約 500KB），網址 `/bind/#bind=` 不變；清掉指向不存在圖片（hero-bg、bind-bg、og.jpg）的引用。驗證：首頁、NFT、Token 每個子頁面改前改後截圖逐像素相同；綁定頁用假機器人 API＋假 MetaMask 測過讀取、簽名（訊息 hex 與 ethers 相同）、送回、中英切換、無效連結。

## 2026-11-03 管理員面板 UI 改版（`app/admin.js`、`app/style.css` 的 `.adm-*`）
- 右上 **模式切換**：⚡ 直接送出（連線錢包送交易）／🛡 Safe 模式（所有按鈕只「加入批次」，像購物車）；記在 localStorage `asc-admin-mode`。owner 不是 Safe 時沒有 Safe 模式；只是 Safe 簽署人時固定 Safe 模式。
- **快速開關**（清單 `Q`）：兌換與互轉、買 ASC、只限驗證（setPolicy 其他參數沿用現值）、白名單鑄造、NFT 運作（pause/unpause）、轉蛋只限 VIP、市場交易。直接模式＝確認框後送交易；Safe 模式＝加入批次，再撥一次取消。
- 合約分頁（金庫／喵武士／配件／市場／🔧 工具＝超稀有退還＋查詢錢包，記在 `asc-admin-tab`）＋搜尋；每個函式一列可展開，依 operator／admin／★owner 分組；bool 參數改成開關。
- 右下角 🛒 批次按鈕＋側邊抽屜：依 Safe 分組、顯示解碼後參數、↑↓ 調順序、✕ 刪除、下載 Transaction Builder JSON（格式同前）。批次項目多存 `c`、`sig`（顯示用即時解碼）、`q`（快速開關）、`tag`。
- `window.confirm／alert` 換成自訂確認框與提示（toast）。`window.ASCAdmin` 多了 `render`、`batch`。
- 測試：雲端 Playwright＋假狀態（桌機 1366、手機 390 無橫向捲動）：直接模式確認框、Safe 模式開關加入／取消、加入 owner 與 admin 操作、搜尋、調順序、下載 JSON 解碼正確、中英切換、Safe 簽署人鎖定 Safe 模式。
