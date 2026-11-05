// 活動徽章合約的測試與編譯：在這個資料夾 npm install → npx hardhat test
// 編譯設定跟主網其他合約相同（0.8.26、optimizer 200、paris），方便 Polygonscan 驗證
require("@nomicfoundation/hardhat-toolbox");
module.exports = { solidity: { version: "0.8.26", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" } } };
