# 江湖鏢局金庫網頁

給玩家用的公開網頁（科技江湖風格，深藍＋紅，電腦／平板／手機各有版面）：

- **即時幣值**：左邊 ASC（玩家手上的點數）、右邊金庫池子（可兌換的代幣），中間是「每 1 ASC 價值」與走勢圖，每 15 秒自動更新，漲跌會閃色。走勢圖從合約部署區塊開始重播鏈上事件算出來（存在瀏覽器裡，下次只讀新的）。
- **我的 ASC**：連接錢包後顯示 ASC、持有天數、兌換比例（70%～100% 的階梯）、全部換掉可得多少、本期還能換多少。
- **兌換**：輸入點數即時預估金額（和合約同樣的算法：只到小數點後 1 位、每期上限、NFT 門檻），按下直接呼叫合約 `exchange`。
- **轉 ASC**：轉到別的錢包（只有兌換開啟時可以；收到的 ASC 持有天數重新計算）。
- **金庫規則**、**領取門檻 NFT**、**信物 NFT**（鑄造進度、白名單鑄造）。
- **綁定錢包頁**：Discord 機器人的「綁定錢包」按鈕會開 `網站網址/#bind=金鑰`，畫面只有背景圖和「連接錢包並簽名」；簽名後送回機器人（`config.js` 的 `botApi`）。

**純靜態網頁**（`index.html`、`app.js`、`config.js`、`assets/`），金庫資料直接讀 Polygon 鏈上，沒有任何機密。和 Discord 機器人唯一的連結是綁定錢包。

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

## 圖片

看 [`assets/README.md`](assets/README.md)：每個圖片欄位的檔名與尺寸。沒放圖片時用漸層代替。

## 放在哪裡

### 24 小時不停機的免費做法（擇一）

| 主機 | 私人 repo | 做法 |
|---|---|---|
| **Cloudflare Pages** | 可以 | Workers & Pages → Create → Pages → 連接 GitHub 選這個 repo，Build command 留空、Output directory 填 `/` |
| **Vercel** | 可以 | Add New Project → 匯入這個 repo，Framework 選 Other |
| **GitHub Pages** | 需要 Pro／Team | Settings → Pages → Source 選「GitHub Actions」，推送後 `.github/workflows/pages.yml` 自動部署（含 `assets/`） |

### GitHub Codespaces（測試用，不會 24 小時開著）
開 Codespace 後會自動 `node serve.js`（8080），在 Ports 分頁把 8080 設成 Public。

### 本機預覽
```bash
npm start   # http://localhost:8080
```

## 注意
- ethers 6.13.4 從 cdnjs 載入；字型 Noto Serif TC 從 Google Fonts 載入。
- 合約介面（`query` 的數字陣列格式）改了的話，`app.js` 的 `readPool`／`readAll` 要一起改。
- 走勢圖要讀很多鏈上事件，公開 RPC 對區塊範圍有限制，程式會自動分段；讀不到時只顯示即時資料。
