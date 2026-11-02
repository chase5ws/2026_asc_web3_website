# contracts-asc：目前主網上的 ASC 合約（參考用，不會放上網站）

這個資料夾是 **2026-10-26 部署到 Polygon 主網的 4 份 V2 合約**的原始碼與 ABI，方便只拿到網站資料夾的人（或 AI）也能讀懂網站在呼叫什麼。

- GitHub Pages 只複製 `index.html config.js app shared assets bind terms privacy`（`.github/workflows/pages.yml`），所以這個資料夾**不會出現在網站上**。
- 合約專案本體（去 ASC 化後改名為 Token／NFT／Part／Market、可部署的新版）在 `2022_web3_solidity_asc_smart_contract`；這裡是**已上鏈那一版**的快照，不要拿來重新部署。

| 合約 | 主網地址 | 原始碼 | ABI |
|---|---|---|---|
| 金庫 AscPointV2（ASC） | `0xB0B0026dBb092adf290df75729619343d51cA4bD` | `source/contracts/token/AscPointV2.sol` | `abi/AscPointV2.json` |
| 喵武士 AscCatSamuraiV2 | `0xc70E923942B9404268C4842E6A42CFE5be6152E0` | `source/contracts/nft/AscCatSamuraiV2.sol` | `abi/AscCatSamuraiV2.json` |
| 配件 AscCatParts | `0x624197e0E623a2684548c6713aaf8104dBEcA2F9` | `source/contracts/parts/AscCatParts.sol` | `abi/AscCatParts.json` |
| 市場 AscMarket | `0xb71aD1e721dE0c5E50223cf4a3C3b3f3E37320c4` | `source/contracts/market/AscMarket.sol` | `abi/AscMarket.json` |
| 權限基底 AscRoles | — | `source/contracts/common/AscRoles.sol` | — |

- `polygon.json`：部署紀錄（地址、區塊、每一步交易）。
- 原始碼取自 Polygonscan 驗證用的 Standard JSON Input（與鏈上 bytecode 比對一致，solc 0.8.26、optimizer 200、evm paris），`source/@openzeppelin/contracts/` 是當時用到的 OpenZeppelin 5.0.2 檔案。
- 權限：owner 是 Safe `0x7c532A61349814633CdE4f81652Cb0E35BEB75f6`；救援錢包 GUARDIAN 寫死 `0xDe8119fE605C934C99cF2ADF2e76e151e8F5E887`。每個管理函式與權限見合約專案的 `AGENTS.md` 第 6 節；網站的管理員面板（`app/admin.js`）照這份介面寫。
