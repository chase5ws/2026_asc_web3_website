// npm run build：編譯後把部署頁要用的 abi／bytecode 與 Polygonscan 驗證用的 Standard-Json-Input 匯出到這個資料夾
const fs = require("fs");
const path = require("path");
const art = (name, file) => JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", file, `${name}.json`), "utf8"));
const badges = art("EventBadges", "contracts/EventBadges.sol");
const proxy = art("ERC1967Proxy", "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol");
fs.writeFileSync(path.join(__dirname, "build.json"), JSON.stringify({ EventBadges: { abi: badges.abi, bytecode: badges.bytecode }, ERC1967Proxy: { abi: proxy.abi, bytecode: proxy.bytecode } }));
fs.writeFileSync(path.join(__dirname, "EventBadges.abi.json"), JSON.stringify(badges.abi, null, 2));
// 驗證用：build-info 裡就是當初編譯的 Standard-Json-Input（只留需要的原始碼）
const dir = path.join(__dirname, "artifacts", "build-info");
const info = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).find((x) => x.input.sources["contracts/EventBadges.sol"]);
const input = { ...info.input, sources: Object.fromEntries(Object.entries(info.input.sources).filter(([k]) => !k.endsWith("Mocks.sol"))) };
fs.writeFileSync(path.join(__dirname, "verify-badges.json"), JSON.stringify(input));
console.log(`已匯出 build.json、EventBadges.abi.json、verify-badges.json（solc ${info.solcLongVersion}）`);
