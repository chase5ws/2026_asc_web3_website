require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const path = require("path");
const solcPkg = path.join(__dirname, "node_modules", "solc");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async () => ({ compilerPath: path.join(solcPkg, "soljson.js"), isSolcJs: true, version: "0.8.26", longVersion: require(solcPkg).version() }));
module.exports = { solidity: { version: "0.8.26", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" } } };
