# ASC 鏢局網站（一頁式，串接 V2）

給玩家用的公開網頁（深藍＋紅，中文／English 可切換）。**一頁式**：最上方「連結錢包」、中英切換，下面 `喵武士 NFT｜首頁｜ASC Token` 三段切換，子選單固定在上方：

| 區塊 | 網址 | 內容（全部直接讀寫 Polygon 上的 V2 合約） |
|---|---|---|
| 首頁 | `#home` | 路線圖、喵喵武士的喵太（四章故事）、技術架構、開發者 |
| NFT · 鑄造 | `#nft/mint` | 已鑄造／我持有；Mint（白名單額度、費用）↔ 解盲盒（選取或全部解盲、RandomSeed 紀錄） |
| NFT · 換裝 | `#nft/equip` | VIP 購買；選一隻已解盲的喵武士 → 疊圖預覽、各部位（可脫下）、我的配件試穿／轉蛋（機率、買次數、抽 1／10 次、結果）→ 確認換裝 |
| NFT · 背包 | `#nft/bag` | 我的喵武士（點開 OpenSea）、配件數量 |
| NFT · 市場 | `#nft/market` | 掛單（分類、排序、購買數量）、上架、我的掛單／下架 |
| Token · 行情 | `#tok/price` | 每 1 ASC 價值、走勢圖、買入價、流通量、可兌換池、保底、手續費卡片（數字讀鏈上） |
| Token · 買入・兌換 | `#tok/trade` | USDT 買 ASC（自動授權）↔ ASC 換 USDT（預估、持有天數比例） |
| Token · 我的點數 | `#tok/mine` | 持有、比例、本期上限、比例階梯、轉出 ASC（33% 稅預估） |
| 綁定錢包 | `/bind/#bind=金鑰` | Discord 機器人開的頁（沒變）；舊網址 `/#bind=` 會自動轉過去 |

需要付 ASC 的動作（鑄造、換裝、VIP、轉蛋、市場購買）會先自動送一次「授權」再送交易；ASC 不夠時直接提示，不會浪費 gas。錯誤訊息把合約的自訂錯誤翻成中文／英文（例如「這個錢包還沒驗證：先到 Discord 綁定」）。

## 檔案

| 檔案 | 說明 |
|---|---|
| `index.html` | 整頁版面 |
| `config.js` | 鏈、RPC、V2 四份合約地址、部署區塊、`assets`（外觀資料的 GitHub Pages）、`botApi` |
| `app/i18n.js` | 中英文文字、故事、配件中文名（`ASC_NAMES.base`，traits.json 的 `zh` 優先） |
| `app/chain.js` | ABI、唯讀 RPC、連錢包（自動切到 Polygon）、錯誤解析、ERC-20 授權、分段 getLogs |
| `app/look.js` | traits.json、配件清單、每顆現在的外觀（讀 `v2/state.json` 再補最新事件，算法跟 sync_v2.py 相同）、疊圖 |
| `app/price.js` | 走勢：讀 `v2/price.json` 再補最新事件 |
| `app/ui.js` | 狀態、分頁（網址 hash）、語言、錢包狀態列、讀鏈、送交易訊息 |
| `app/nft.js`、`app/market.js`、`app/token.js` | 各區塊 |
| `bind/`、`shared/` | 綁定錢包頁（沿用舊程式） |

外觀資料（traits.json、圖層、配件縮圖 `v2/thumbs/`、`v2/state.json`、`v2/price.json`）都在 `2026_asc_web3_ipfs`，由它的 GitHub Action 更新；**新增配件部位只要改那邊的 traits.json，網站不用改**。

舊的多頁版（wallet／story／rules／nft、home.js、app.js、lang.js）已移到 `GitHub/_to_delete/website-old/`。

## 文字與語言

網站的中英文文字與故事在 `app/i18n.js`（`ASC_T`、`ASC_STORY`）；綁定頁沿用 `shared/lang.js`。網頁依瀏覽器語言預設中文或英文，右上角按鈕切換，選擇會記在瀏覽器裡。

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
