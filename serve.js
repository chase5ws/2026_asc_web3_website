// 零依賴的靜態網頁伺服器：npm start（預設 8080 埠，可用 PORT 環境變數改）
// 在 Codespaces 會自動啟動；本機也可以直接用來預覽。
// 規則：只提供網頁用的副檔名；資料夾自動給 index.html（/wallet → /wallet/）；隱藏檔、.. 一律擋掉。
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon"
};
const BLOCK = new Set(["serve.js", "package.json", "package-lock.json"]);

function notFound(res) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("找不到頁面");
}

http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]); } catch (_) { return notFound(res); }
    const parts = url.split("/").filter(Boolean);
    if (parts.some((p) => p.startsWith(".") || p.includes("\\")) || BLOCK.has(parts.join("/"))) return notFound(res);
    let file = path.join(ROOT, ...parts);
    if (!file.startsWith(ROOT)) return notFound(res);
    let stat = fs.statSync(file, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
        if (!url.endsWith("/")) { res.writeHead(301, { Location: url + "/" }); return res.end(); }
        file = path.join(file, "index.html");
        stat = fs.statSync(file, { throwIfNoEntry: false });
    }
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!stat?.isFile() || !type) return notFound(res);
    res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": file.endsWith("config.js") || type.startsWith("text/html") ? "no-cache" : "max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
    });
    fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`江湖鏢局金庫網頁：http://localhost:${PORT}`));
