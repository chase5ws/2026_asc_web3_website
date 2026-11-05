
## 2026-11-01 風險提示縮小
- index.html 移除首頁、價格、交易區三個 note warn 提示框；改在 footer 最後一行用 11px 淡色小字（risk.short + 服務條款連結）。服務條款第 4 節保留完整聲明。

## 2026-11-04 喵武士圖鑑（#nft/all）
- 使用者：NFT 被拆成不同部位（配件是 ERC-1155），想要一個看到全部組合起來的地方。新增 NFT 子分頁「圖鑑」：列出所有已鑄造的喵武士，已解盲的用 traits 圖層疊出完整外觀（跟換裝、轉蛋同一套 `ASCLook`），盲盒顯示 box.png（不洩漏外觀）；篩選全部／已解盲／盲盒／我的（連錢包才有）。點一隻：大圖、每個部位（縮圖、部位、稀有度）、持有者（`ownerOf`，點開 Polygonscan）、在 OpenSea 查看（`config.opensea/合約/編號`）、下載組合圖（`2026_asc_web3_ipfs/v2/images/<id>.png`）、自己的可「去換裝」。網址 `#nft/all/<編號>` 直接打開那一隻（`ui.js` fromHash）。圖鑑不需要錢包，NFT 區塊上方的「先連結錢包」提示在圖鑑隱藏。
- Discord 機器人的官方連結「喵喵武士 NFT」改連到圖鑑（原本的 OpenSea 合集網址 asc-cat-samurai-595172199 失效）。

## 2026-11-04 衣櫃 owner 顯示 0x0000…0000
- 使用者回報管理面板「衣櫃 Wardrobe」的 owner 是 0x0000…0000。衣櫃是 UUPS 代理，initialize 一定會設 owner；讀到 0x0 代表 `config.js` 的 `wardrobe` 很可能填成部署網頁結果表的「實作」地址（實作合約 `_disableInitializers`，永遠沒有 owner），或代理沒有 initialize。這裡沒辦法讀鏈確認。
- 管理面板加檢查：讀 `wardrobe` 地址的 ERC-1967 實作欄位（`IMPL_SLOT`），owner 是 0x0 時在權限表下方說明是「不是代理（填成實作）」還是「代理沒 initialize」。確認正確的代理地址後要改 `config.js` 的 `wardrobe` 與 `2026_asc_web3_ipfs` 的 Actions 變數 `WARDROBE_ADDRESS`（sync_v2.py 預設值也是 0x6bB0…）。
- 2026-11-04 追查：Polygonscan 上 `0x6bB0…26BB` 是驗證過的 Wardrobe「實作」，部署錢包 0xa2BC 的最後一筆是 Create: Wardrobe，代理（ERC1967Proxy＋initialize）、setOperator、setFixedSlots、transferOwnership 都還沒做。`deploy.html` 沒有本機進度時改成直接沿用這個實作（預填實作的部署交易 0x9795…b5c2，不重新部署）；`pages.yml` 暫時把部署頁發到 `/wardrobe-deploy/`（使用者要在 GitHub Pages 上操作），代理部署好、Safe 接手後刪掉那一步。
- 2026-11-04 再修：部署頁第 1 步改成直接標記完成（實作固定 0x6bB0…26BB），按開始從「部署代理」做起。
- 2026-11-05 衣櫃代理上線：代理 `0x68eD0610A8244769eA2C745dA49a2FBA4354490A`（區塊 96756878），setOperator、setFixedSlots、transferOwnership(Safe) 都完成、讀回檢查通過；`config.js` 的 `wardrobe` 改成代理，部署結果記在 `contracts-asc/wardrobe/polygon.json`。使用者按了兩次開始，多部署了一個沒用到的代理 `0x7c32…313f`（owner 是部署錢包、沒有任何資產，不用理）。`pages.yml` 拿掉 `/wardrobe-deploy/`。下一步：`2026_asc_web3_ipfs` 的 Actions 變數 `WARDROBE_ADDRESS` 改成代理，管理面板「衣櫃上線」產生 Safe 批次。

## 2026-11-05 清理與管理按鈕
- 刪除（移到 `_to_delete/`，已加進 .gitignore，確認後整個資料夾刪掉）：衣櫃一次性部署頁 `contracts-asc/wardrobe/deploy.html` 與它的測試 `tests/DeployPage.test.js`、`Claude outputs/`（AI 的預覽圖與打包檔）、4 個 `.fuse_hidden*`（同步留下的舊檔副本，被 commit 進來）。
- 沒用到的程式：i18n `q.gacha`、`q.notVip`、`g.sum`；CSS `.adm-mode`、`.sw.eqsw`、`.lg-frame`、`.adnav`；config `nftV1`（V1 地址留在 AGENTS.md）。檢查過圖片（assets 全部有用到）、JS 函式、HTML id。
- 管理入口：原本是三段切換旁邊的金色「⚙ 管理」按鈕；改成連上 owner／admin／operator（或 Safe 簽署人、待接受的新主人）錢包時，三段切換中間的「首頁」直接變成紫色「管理介面」（`ASCUI.S.adm`，admin.js 的 `jumpBtn` 設定、ui.js 的 `layout` 套用；layout 每次重畫都會重設 #sw3 的 class，所以狀態放在 S 不放 class，避免重畫迴圈）。首頁從左上角標誌回去；失去權限時停在管理頁會自動回首頁。
- 2026-11-05 衣櫃上線批次已由 Safe 執行（MultiSend 0xA83c…1836）：鏈上讀回 owner＝Safe、pendingOwner＝0、admin／operator＝0xa2BC、seedClosed＝true、changeFee 10、未暫停、公庫存每種 50（抽查 #0、#1034）；NFT 的舊換裝費＝1,000,000,000（舊 V2 換裝停用）。`contracts-asc/wardrobe/migration.js` 已不需要，可刪。
- 2026-11-05 換裝頁改版（使用者回饋：不知道要先點部位才會出現配件和 VIP 借穿）：一進來預設選第一個部位；步驟標成 ① 選喵武士 ② 點部位 ③ 挑配件；③ 上方加部位分頁（顯示每個部位可換的數量：自己的＋VIP 可借的），清單分成「我背包裡的」與「★ VIP 免費借穿」；點部位不再取消選取，手機上點部位會捲到 ③；該部位沒東西時說明去市場、轉蛋或買 VIP。拿掉 i18n `q.mine`、`q.stockPick`，新增 `q.step2`、`q.step3`、`q.bagT`、`q.noSlot`。
