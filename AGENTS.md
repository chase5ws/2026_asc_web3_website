# AGENTS.md — 給 AI 協作者與開發者

## 專案
江湖鏢局金庫的公開網頁（純靜態，沒有建置步驟）。讀 Polygon 鏈上的點數金庫 **AscPoint**（`2026_asc_web3_token`，點數＝ERC-20 代幣 ASC，0 位小數），玩家用 MetaMask 兌換、轉 ASC；顯示信物 NFT。**Discord 機器人（`2026_asc_discord_bot`）只負責綁定錢包**，兩個專案只透過綁定 API 溝通。使用者用中文溝通。

## 鏈上地址（Polygon 137）
- 金庫 AscPoint／ASC：`0x9a431fED8Bc5fa595E5c9fdB1abb0a3119fBD5Ad`（部署區塊 96045773，owner＝Safe `0x7c532A61349814633CdE4f81652Cb0E35BEB75f6`）
- USDT0：`0xc2132D05D31c914a87C6611C10748AEb04B58e8F`（6 位小數，目前池子的代幣）
- 信物 NFT：`0x39c774673A25B0f1F600Bf39edF639c0f44a7488`（介面不確定，`app.js` 每個欄位讀不到就隱藏）

## 檔案
- `index.html`：版面與 CSS（深藍＋紅，`--bg --card --red --blue …` 在 `:root`；斷點 960px 平板、640px 手機；`[hidden]` 一律隱藏）。圖片欄位見 `assets/README.md`，沒有圖時用漸層。圖示是文字「ASC」；綁定頁背景是「ASC鏢局」斜向重複的浮水印（`--wm` 的 SVG，`.bindview::before` 旋轉 -24°），與機器人網頁 `web.js` 的 `WATERMARK` 相同。
- `app.js`：ethers v6 UMD。
  - 讀取：`query("pool 0x帳號")`、`query("status")`、`query("rule")`、`totalSupply`、`balanceOf`。`pool` 的數字陣列 `[點數, 門檻OK, 期末, 持有天數, 比例bps]＋每種代幣 8 個 [餘額, 保底, 鎖住, 可兌換, 100點份額, 每人上限, 本期剩餘, 全部可得]`；代幣地址從文字 `|| 符號 0x地址:` 解析。
  - 交易：`exchange(token, points)`、`transfer(to, amount)`；自訂錯誤在 ABI 裡，`explain()` 轉中文。
  - 預估：`previewFor()` 和合約相同（份額＝可兌換×點數÷totalSupply，×比例，捨到小數點後 1 位）。
  - 走勢：`loadHistory()` 從 `deployBlock` 分段 `getLogs`（自動縮小範圍），快取在 localStorage（`asc-history:金庫`），`replay()` 依合約規則重算每筆交易後的「每 1 ASC 價值」；加上本次開啟後每次更新的即時點。
  - 綁定：網址 `#bind=<48 碼金鑰>` 時只顯示綁定頁：`GET {botApi}/api/bind/<金鑰>` 取得要簽的文字 → `personal_sign` → `POST {botApi}/api/bind/<金鑰>` `{ address, signature }`。
- `config.js`：`window.ASC_CONFIG`（鏈、RPC、`vault`、`deployBlock`、`safe`、`nft`、`botApi`、`refreshSeconds`）。
- `serve.js`：零依賴靜態伺服器（白名單：三個網頁檔＋`assets/` 圖片），預設 8080。
- `.github/workflows/pages.yml`：部署網頁檔與 `assets/` 到 GitHub Pages。

## 原則
- 不放任何機密、不依賴後端；機器人離線時只有綁定錢包不能用。
- 台灣慣例：漲紅（`--up`）跌綠（`--down`）。
- 金庫 owner 指令（發 ASC、存款、開關）在 Safe 的 Transaction Builder 做，不在網頁。

## 測試方式
曾用 Chromium＋假 RPC＋假 MetaMask 測過（桌面 1366、平板 820、手機 390）：即時幣值、走勢重播、兌換預估與按鈕、最少／本期最多、轉 ASC 防呆、交易完成、綁定錢包簽名送回。手機寬度沒有橫向捲動。

## 變更紀錄
- 2026-10-20：從 `2026_asc_web3_token/site/` 搬出成為獨立專案（舊版金庫的 claim 介面）。
- 2026-10-24：**改接已上線的 AscPoint**（ASC、`query`、`exchange`、`transfer`）；新增即時幣值（左右兩邊池子、中間價格與走勢圖）、我的 ASC 與持有比例階梯、兌換預估、轉 ASC、規則與門檻；**綁定錢包頁從機器人搬到網站**（`#bind=`）；改成科技江湖風格（深藍＋紅）、三種裝置版面；圖片欄位 `assets/`；信物 NFT 改為 `0x39c7…7488`；移除機器人的 `/api/exchange/stats`（匯率分母改用鏈上 totalSupply）。
