# 江湖鏢局金庫網頁

給玩家用的公開網頁（科技江湖風格，深藍＋紅，電腦／平板／手機各有版面，**中文／English 可切換**，整頁有「ASC鏢局」斜向浮水印）：

**多頁網站**，每一頁一個資料夾，上方導覽列切換；每頁都是 Apple 式的一整個畫面一段，往下捲會淡入，畫面底部有「往下捲」提示，最後一段是「下一頁」大按鈕：

| 網址 | 資料夾 | 內容 |
|---|---|---|
| `/` | `index.html`＋`home.js` | **行情**：大字即時幣值（每 1 ASC 值多少）→ 兩邊池子（左 ASC、右金庫代幣、中間走勢圖）→ 金庫數據 → 前往其他頁的圖卡 |
| `/wallet/` | `wallet/` | **我的錢包**：ASC、持有天數與兌換比例階梯、全部可得、本期剩餘 → 兌換（即時預估、最少／本期最多／全部）、轉 ASC |
| `/story/` | `story/` | **鏢局故事**：封面大圖 → 目標／名稱由來／師徒文化 → 四章故事各一整個畫面（圖文左右交錯）→ 漫畫第一話 |
| `/rules/` | `rules/` | **金庫規則**：兌換狀態、期間、上限、保底、手續費、owner、門檻 NFT → 持有天數比例表 → 使用步驟 |
| `/nft/` | `nft/` | **信物 NFT**：鑄造進度、白名單、我的信物、白名單鑄造 |
| `/bind/#bind=金鑰` | `bind/` | **綁定錢包**（Discord 機器人開的頁，沒有導覽列）：簽名後送回機器人（`config.js` 的 `botApi`）。舊網址 `/#bind=` 會自動轉到這裡 |

共用的東西在 `shared/`：`style.css`（全部樣式）、`core.js`（讀鏈、錢包、交易、導覽列、語言、捲動效果）、`lang.js`（中英文文字與故事）。

**純靜態網頁**，金庫資料直接讀 Polygon 鏈上，沒有任何機密。和 Discord 機器人唯一的連結是綁定錢包。

相關專案：金庫合約 `2026_asc_web3_token`（AscPoint）、Discord 機器人 `2026_asc_discord_bot`（只負責綁定錢包）。

## 設定（`config.js`）

| 欄位 | 說明 |
|---|---|
| `vault` | 金庫 AscPoint 地址（已填：`0x9a431fED8Bc5fa595E5c9fdB1abb0a3119fBD5Ad`） |
| `deployBlock` | 金庫部署區塊（96045773），走勢圖從這裡開始 |
| `safe` | 金庫 owner（Safe），只用來顯示 |
| `nft` | 信物 NFT 合約（`0x39c774673A25B0f1F600Bf39edF639c0f44a7488`） |
| `botApi` | **要填**：Discord 機器人的對外網址（機器人的 `PUBLIC_URL`），綁定錢包要用 |
| `refreshSeconds` | 即時幣值更新秒數 |
| `chainId`、`rpcUrl`、`explorer` | 預設 Polygon 主網 |

機器人那邊要把這個網站的網址填進 `WEBSITE_URL`（或 `config.json` 的 `nft.website_url`），「綁定錢包」才會開這個網站。

## 文字與語言

所有中英文文字與鏢局故事都在 `shared/lang.js`（`ASC_TEXT`、`ASC_STORY`），改文字只要改這個檔案。網頁依瀏覽器語言預設中文或英文，右上角按鈕切換，選擇會記在瀏覽器裡。

## 圖片

看 [`assets/README.md`](assets/README.md)：每個圖片欄位的檔名與尺寸。沒放圖片時用漸層代替。

## 放在哪裡

### 24 小時不停機的免費做法（擇一）

| 主機 | 私人 repo | 做法 |
|---|---|---|
| **Cloudflare Pages** | 可以 | Workers & Pages → Create → Pages → 連接 GitHub 選這個 repo，Build command 留空、Output directory 填 `/` |
| **Vercel** | 可以 | Add New Project → 匯入這個 repo，Framework 選 Other |
| **GitHub Pages** | 需要 Pro／Team | Settings → Pages → Source 選「GitHub Actions」，推送後 `.github/workflows/pages.yml` 自動部署（`cp` 那一行要改成複製所有資料夾，見下方「部署設定」） |

### GitHub Codespaces（測試用，不會 24 小時開著）
開 Codespace 後會自動 `node serve.js`（8080），在 Ports 分頁把 8080 設成 Public。

### 本機預覽
```bash
npm start   # http://localhost:8080
```

## 注意
- ethers 6.13.4 從 cdnjs 載入；字型 Noto Serif TC 從 Google Fonts 載入。
- 合約介面（`query` 的數字陣列格式）改了的話，`shared/core.js` 的 `readPool`／`readAll` 要一起改。
- 走勢圖要讀很多鏈上事件，公開 RPC 對區塊範圍有限制，程式會自動分段；讀不到時只顯示即時資料。

## 部署設定（GitHub Pages）
`.github/workflows/pages.yml` 的「只放網頁檔案」那一步請改成：
```yaml
        run: mkdir _site && cp -r index.html home.js config.js shared assets wallet story rules nft bind _site/
```
