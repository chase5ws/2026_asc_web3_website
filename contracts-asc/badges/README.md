# 活動徽章（EventBadges）— 活動背景

每場活動一個徽章（ERC-1155，**不能轉移**），當成喵武士的背景穿。不用改 NFT 合約、也不用升級衣櫃。

| 規則 | 做法 |
|---|---|
| 怎麼領 | 活動期間在官網「喵武士 NFT → 活動」輸入公告的代碼按領取（`claim`），每個錢包每場一次 |
| 誰能領 | 可設定只限 Discord 綁定過的錢包（金庫 `isVerified`）、只限持有喵武士 |
| 期限、名額 | 每場有開始／截止時間與人數上限（0＝不限）；過了就領不到 |
| 不能轉賣 | 轉移、授權都會失敗；管理員可以補發（`grant`）、收回（`revoke`） |
| 穿背景 | 換裝頁「背景」部位（`wear`，免費）；VIP 不能借穿（沒有公庫存） |
| 喵武士轉手 | 背景只在「領取者本人還持有這隻」時有效（`backgroundOf`），轉手後自動消失，徽章留在原錢包可以穿到別隻 |
| 代碼 | 鏈上只存 `keccak256(abi.encodePacked(活動編號, 代碼))`；第一個人領取後代碼會出現在交易資料裡，所以建議開「只限 Discord 綁定」 |

## 檔案
| 檔案 | 說明 |
|---|---|
| `contracts/EventBadges.sol` | 合約（UUPS 可升級，owner／admin／operator／guardian 跟衣櫃相同） |
| `contracts/Mocks.sol` | 測試用的假 NFT、假金庫；順便讓 hardhat 編譯 ERC1967Proxy |
| `test/EventBadges.test.js` | 測試 |
| `export.js` | `npm run build` 匯出 `build.json`（部署頁用）、`EventBadges.abi.json`、`verify-badges.json`（Polygonscan 驗證） |
| `deploy.html` | 一次性部署頁（讀同資料夾的 build.json），GitHub Pages 發到 `/badges-deploy/`，部署完刪掉 |

## 上線順序
1. 這個資料夾：`npm install` → `npm test`（全部通過）→ `npm run build`。
2. 部署（GitHub Pages）：推上去後 GitHub Actions 會自動測試、編譯（`npm run build`），通過才發布部署頁；等 Pages 更新後開 `https://chase5ws.github.io/2026_asc_web3_website/badges-deploy/`，MetaMask 用部署錢包，按一次「開始部署」（實作 → 代理 → setOperator → transferOwnership(Safe)）。部署完把 `pages.yml` 的「活動徽章部署頁」那一步刪掉。
3. 把結果的代理地址填進網站 `config.js` 的 `badges`。
4. 管理面板產生 Safe 批次：`acceptOwnership`、`setAdmin`。
5. 建活動：管理面板「活動徽章」→ 填編號、代碼、時間 → 送出（代碼只在你的瀏覽器算雜湊，不會上鏈）。
6. 背景圖：放到 `2026_asc_web3_ipfs` 的 `layers/Background/`，在 `traits.json` 的 Background 選項加 `"badge": 活動編號`；出圖同步會產生徽章 metadata（`v2/badges/<編號>.json`）並把背景畫在最底層。

## 背景預設與測試
- `traits.json` 的 Background 第一個選項是 `Transparent`（`file: null`）：沒穿活動背景時圖片背景是透明的，metadata 的 Background 屬性寫 Transparent。
- 合約還沒部署前要看效果：在 `2026_asc_web3_ipfs/v2/overrides.json` 寫 `{"0": {"Background": "White"}}`，出圖同步與網站都會把 #0 畫上白色背景（鏈上有穿背景時以鏈上為準）。測試完把那一行拿掉就回到透明。
