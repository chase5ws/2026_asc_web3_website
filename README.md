# 江湖鏢局金庫網頁

給玩家看的公開網頁：顯示點數金庫每個幣種池子的餘額、輪次與匯率、NFT 鑄造進度與領取門檻；玩家連接 MetaMask 後可以看到自己能領多少、一鍵全部領取，在白名單內也可以直接鑄造 NFT。

- **純靜態網頁**（`index.html`、`app.js`、`config.js`），所有資料直接讀 Polygon 鏈上，不經過任何伺服器、沒有任何機密。
- 匯率需要「全服點數」，只有 Discord 機器人知道：`config.js` 填了 `botApi` 才會顯示匯率；機器人離線時網頁照常可以領取，只是不顯示匯率。
- 相關專案：金庫合約 `2026_asc_web3_token`、Discord 機器人 `2026_asc_discord_bot`。

## 設定

編輯 `config.js`：

| 欄位 | 說明 |
|---|---|
| `vault` | 點數金庫（AscPointVault）合約地址，部署後填寫 |
| `nft` | AscCatSamurai NFT 合約（已填好） |
| `botApi` | 選填。Discord 機器人的對外網址（機器人的 `PUBLIC_URL`），用來顯示匯率 |
| `chainId`、`rpcUrl`、`explorer` | 預設 Polygon 主網；在 Amoy 測試網試跑時改成 80002、`https://rpc-amoy.polygon.technology`、`https://amoy.polygonscan.com` |

## 放在哪裡

### GitHub Codespaces（可以，但不會 24 小時開著）

1. 在 repo 頁面按 **Code → Codespaces → Create codespace**。`.devcontainer/devcontainer.json` 會在 Codespace 開機時自動執行 `node serve.js`，在 8080 埠架好網頁。
2. 打開下方的 **連接埠（Ports）** 分頁，在 8080 上按右鍵 → **Port Visibility → Public**，那個 `https://….app.github.dev` 網址就是給玩家的網址。
3. 如果網頁沒起來，在終端機執行 `npm start`。

限制：
- Codespace 閒置一段時間（預設 30 分鐘，最多可調到 4 小時）就會停止，停止後網址打不開；重新打開 Codespace 才會恢復。
- 每個 Codespace 的網址都不一樣，刪掉重建網址就變了。
- 適合測試、給少數人看；要給所有玩家長期使用，請用下面的免費靜態主機。

### 24 小時不停機的免費做法（擇一）

| 主機 | 私人 repo | 做法 |
|---|---|---|
| **Cloudflare Pages** | 可以 | Cloudflare → Workers & Pages → Create → Pages → 連接 GitHub 選這個 repo，Build command 留空、Output directory 填 `/` |
| **Vercel** | 可以 | Vercel → Add New Project → 匯入這個 repo，Framework 選 Other，直接部署 |
| **GitHub Pages** | 需要 GitHub Pro／Team | Settings → Pages → Source 選「GitHub Actions」，推送後 `.github/workflows/pages.yml` 自動部署 |

以上都會在你推送到 `main` 後自動更新。網頁內容沒有機密，也可以把 repo 設成公開，直接用 GitHub Pages。

### 本機預覽

```bash
npm start   # http://localhost:8080
```

## 檔案

```
index.html   版面與樣式（淺色／深色、手機寬度）
app.js       讀鏈上資料、連接錢包、領取、鑄造
config.js    鏈、合約地址、機器人網址
serve.js     零依賴的靜態伺服器（Codespaces 與本機預覽用；只提供上面三個檔案）
```

## 注意

- 網頁用的 ethers 6.13.4 從 cdnjs 載入。
- 合約的函式介面改了（例如 `poolStatus` 回傳順序），`app.js` 開頭的 ABI 要一起改。
