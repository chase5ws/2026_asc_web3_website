# 衣櫃（Wardrobe）— ASC 主網資料

合約原始碼的正本在合約模板專案 `2026_web3_solidity_smart_contract/contracts/wardrobe/`（通用版）；這裡是 ASC 用的那一版快照與工具，不會上網站（pages.yml 不複製 `contracts-asc/`）。

| 檔案 | 說明 |
|---|---|
| `Wardrobe.sol` | 部署的那一版原始碼（含 operator：只能緊急暫停） |
| `Wardrobe.abi.json` | ABI（網站 `app/chain.js` 照這份） |
| `verify-wardrobe.json` | Polygonscan 驗證：Standard-Json-Input，v0.8.26+commit.8a97fa7a、optimizer 200、paris（跟 V2 同設定）。已確認重新編譯的 bytecode 與部署結果一致 |
| `deploy.html` | **一次性部署網頁**（ethers 與 bytecode 都內嵌）：`npm start` → http://localhost:8080/contracts-asc/wardrobe/deploy.html，MetaMask 部署 → setOperator → setFixedSlots → transferOwnership(Safe)。部署完可以刪 |
| `migration.js` | 列出 V2 時期穿上、還穿著的配件（上線批次的 giveParts＋seedWorn 用；管理面板也會做同樣的事） |
| `tests/` | 衣櫃 × 主網合約原始碼的整合測試（2026-11-03：8 項全過；模擬鏈上用真瀏覽器點完 deploy.html 全流程並模擬 Safe 接手） |
| `polygon.json` | 部署後放這裡（deploy.html 下載的結果） |

## 上線順序
1. `deploy.html` 部署（owner 先是部署錢包，最後 transferOwnership 給 Safe；admin 會在 Safe 接手時清空，所以由 Safe 設）。
2. 網站改接衣櫃（換裝頁、出圖同步、管理面板）。
3. Safe 上線批次：衣櫃 `acceptOwnership` → `setAdmin` → NFT `giveParts(衣櫃, …)`（補登記＋公庫存）→ 衣櫃 `seedWorn`、`addStock`、`closeSeed` → NFT `setPrices(鑄造, 1000000000, 轉蛋)` 停用舊換裝。
