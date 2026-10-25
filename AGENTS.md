# AGENTS.md — 給 AI 協作者與開發者

## 專案
江湖鏢局金庫的公開網頁（純靜態，沒有建置步驟）。讀 Polygon 鏈上的點數金庫 **AscPoint**（`2026_asc_web3_token`，點數＝ERC-20 代幣 ASC，0 位小數），玩家用 MetaMask 兌換、轉 ASC；顯示信物 NFT。**Discord 機器人（`2026_asc_discord_bot`）只負責綁定錢包**，兩個專案只透過綁定 API 溝通。使用者用中文溝通。

## 鏈上地址（Polygon 137）
- 金庫 AscPoint／ASC：`0x9a431fED8Bc5fa595E5c9fdB1abb0a3119fBD5Ad`（部署區塊 96045773，owner＝Safe `0x7c532A61349814633CdE4f81652Cb0E35BEB75f6`）
- USDT0：`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`（6 位小數，目前池子的代幣）
- 信物 NFT：`0x39c774673A25B0f1F600Bf39edF639c0f44a7488`（介面不確定，`nft/page.js` 每個欄位讀不到就隱藏）

## 檔案（多頁，每頁一個資料夾）
- 每頁 `<body data-page="home|wallet|story|rules|nft|bind" data-root="./ 或 ../">`，依序載入 ethers（cdnjs）→ `{root}config.js` → `{root}shared/lang.js` → `{root}shared/core.js` → 該頁程式（首頁 `home.js`，其他 `資料夾/page.js`）。CSS 一律 `{root}shared/style.css`。
- `shared/core.js` → `window.ASC`：
  - 工具：`C E $ L esc say short link num tenth pct date unitOf TIERS ROOT PAGE`；`lang`／`state`／`account` 是 getter。
  - 鏈：`provider vault iface refresh() connect() walletSigner() sendTx(msgEl, label, fn, contract=vault) explain(e) loadHistory()`（回傳 Map 代幣小寫地址 → `[{t,p}]`）。
  - 事件：`onUpdate(fn)` 每次讀到鏈上資料（有就立刻呼叫一次）、`onLang(fn)` 切換語言後。
  - 自動：畫導覽列（`PAGES` 陣列，加新頁改這裡＋lang 的 `nav.*`／`page.*`）、頁尾 `#foot`、`.reveal` 淡入、底部「往下捲」提示、`eth_accounts` 靜默帶入已授權錢包（換頁不用再連）、每 `refreshSeconds` 更新（story、bind 不讀鏈）、`#bind=` 轉到 `bind/`。
  - `readPool`：`query("pool 0x帳號")` 的數字陣列 `[點數, 門檻OK, 期末, 持有天數, 比例bps]＋每種代幣 8 個 [餘額, 保底, 鎖住, 可兌換, 100點份額, 每人上限, 本期剩餘, 全部可得]`；代幣地址從文字 `|| 符號 0x地址:` 解析。`readAll` 另讀 `status`、`rule`、`totalSupply`。
  - 走勢：`loadHistory()` 從 `deployBlock` 分段 `getLogs`，快取 localStorage `asc-history:金庫`，`replay()` 依合約規則重算每筆交易後的「每 1 ASC 價值」。
- `shared/style.css`：深藍＋紅（`:root` 變數），斷點 960／640px；Apple 式：`.screen`（一整個畫面）、`.display` 大標、`.eyebrow`、`.lead`、`.hero-price`、`.cue`（往下捲提示）、`.reveal`＋`.d1~.d3`（淡入延遲）、`.tiles/.tile`（前往其他頁）、`.next`（下一頁）、`.chap`（故事章節，`.flip` 左右交換）、`.story-hero`。整頁浮水印 `body::before`（`--wm` SVG）。
- `shared/lang.js`：`ASC_TEXT`（`zh`／`en`）與 `ASC_STORY`。HTML 用 `data-i18n`／`data-i18n-html`／`data-i18n-ph`；**新增文字要兩種語言都加**。
- `home.js`：大字幣值、兩邊池子、走勢圖（階梯線）、數據。`wallet/page.js`：`previewFor()` 與合約相同算法、`fill()` 二分搜尋、兌換與轉 ASC 防呆。`story/page.js`：章節依語言重畫。`rules/page.js`、`nft/page.js`（NFT 每個欄位讀不到就隱藏）、`bind/page.js`（`GET`／`POST {botApi}/api/bind/<金鑰>`，`personal_sign`）。
- `config.js`：`window.ASC_CONFIG`（鏈、RPC、`vault`、`deployBlock`、`safe`、`nft`、`botApi`、`refreshSeconds`）。
- `serve.js`：零依賴靜態伺服器：只給 html/js/css/圖片，資料夾給 `index.html`（`/wallet` 301 到 `/wallet/`），擋隱藏檔、`..`、`serve.js`、`package.json`。
- `.github/workflows/pages.yml`：部署到 GitHub Pages（要複製所有頁面資料夾，見 README）。

## 原則
- 不放任何機密、不依賴後端；機器人離線時只有綁定錢包不能用。
- 台灣慣例：漲紅（`--up`）跌綠（`--down`）。
- 金庫 owner 指令（發 ASC、存款、開關）在 Safe 的 Transaction Builder 做，不在網頁。

## 測試方式
曾用 Chromium＋假 RPC＋假 MetaMask 測過（桌面 1366、手機 390，每一頁）：即時幣值、走勢重播、兌換預估與按鈕、最少／本期最多、轉 ASC 防呆、交易完成、綁定錢包簽名送回。手機寬度沒有橫向捲動。

## 變更紀錄
- 2026-10-20：從 `2026_asc_web3_token/site/` 搬出成為獨立專案（舊版金庫的 claim 介面）。
- 2026-10-24：**改接已上線的 AscPoint**（ASC、`query`、`exchange`、`transfer`）；新增即時幣值（左右兩邊池子、中間價格與走勢圖）、我的 ASC 與持有比例階梯、兌換預估、轉 ASC、規則與門檻；**綁定錢包頁從機器人搬到網站**（`#bind=`）；改成科技江湖風格（深藍＋紅）、三種裝置版面；圖片欄位 `assets/`；信物 NFT 改為 `0x39c7…7488`；移除機器人的 `/api/exchange/stats`（匯率分母改用鏈上 totalSupply）。
- 2026-10-25：中英文版（`lang.js`、右上角切換）；整頁「ASC鏢局」斜向浮水印；新增「鏢局故事」區塊（目標、名稱由來、師徒文化＋四章故事與漫畫裁圖 `assets/story-*.jpg`，點圖放大）；網站圖示 `assets/favicon.svg` 等。
- 2026-10-25：**改成多頁網站**（每頁一個資料夾：行情首頁、wallet、story、rules、nft、bind），Apple 式一整個畫面一段＋往下捲提示＋淡入＋下一頁；共用程式搬到 `shared/`；舊的 `app.js`、`lang.js` 不再使用；機器人綁定連結改為 `/bind/#bind=`。
