# AGENTS.md — 給 AI 協作者與開發者

## 專案
江湖鏢局金庫的公開網頁（純靜態）。讀 Polygon 鏈上的點數金庫（`2026_asc_web3_token` 的 AscPointVault，多幣種）與 AscCatSamurai NFT；玩家用 MetaMask 領取（`claim`／`claimMany`）與白名單鑄造（`allowListMint`）。匯率的分母（全服點數）來自 Discord 機器人（`2026_asc_discord_bot`）的 `GET {botApi}/api/exchange/stats`，回傳 `{ ok, totalPoints }`，選填。

## 檔案
- `index.html`：版面與 CSS token（淺色／深色，`[hidden]` 一律隱藏）。
- `app.js`：ethers v6 UMD（cdnjs 6.13.4）。合約 ABI 在檔案開頭：金庫 `tokens`、`poolStatus`、`userCapBps`、`roundCapBps`、`paused`、`owed`、`userRemaining`、`claim`、`claimMany`、`gateNfts`、`canClaim`；NFT `totalSupply`、`allowListMintOpen`、`allowList`、`balanceOf`、`tokenOfOwnerByIndex`、`tokenURI`、`allowListMint`。沒有持有門檻 NFT（`canClaim` 為 false）時停用領取按鈕。交易上鏈後先 `refresh()` 再顯示完成。
- `config.js`：`window.ASC_CONFIG`（鏈、RPC、explorer、`vault`、`nft`、`nftMaxSupply`、`botApi`、`ipfsGateway`）。
- `serve.js`：零依賴靜態伺服器，只提供上面三個檔案（白名單），預設 8080。
- `.devcontainer/devcontainer.json`：Codespace 開機自動 `node serve.js`（8080）；埠要手動設 Public。
- `.github/workflows/pages.yml`：只把三個網頁檔案部署到 GitHub Pages（私人 repo 需要 Pro）。

## 原則
- 不放任何機密、不依賴後端；機器人離線時領取仍可用。
- 領取門檻的管理在 Discord 機器人，網頁只顯示。

## 變更紀錄
- 2026-10-20：從 `2026_asc_web3_token/site/` 搬出成為獨立專案；新增 `serve.js`、Codespaces 設定、GitHub Pages workflow 與 README（含 Cloudflare Pages／Vercel 免費常駐做法）。網頁曾以 Chromium＋假 RPC＋假 MetaMask 測過：池子、匯率、領取、白名單鑄造、領取門檻、手機寬度、深淺色。
