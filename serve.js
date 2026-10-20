// 零依賴的靜態網頁伺服器：npm start（預設 8080 埠，可用 PORT 環境變數改）
// 在 Codespaces 會自動啟動；本機也可以直接用來預覽。
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const FILES = new Set(["index.html", "app.js", "config.js"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http.createServer((req, res) => {
    const name = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
    if (!FILES.has(name)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("找不到頁面");
    }
    res.writeHead(200, {
        "Content-Type": TYPES[path.extname(name)],
        "Cache-Control": name === "config.js" ? "no-cache" : "max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
    });
    fs.createReadStream(path.join(ROOT, name)).pipe(res);
}).listen(PORT, () => console.log(`江湖鏢局金庫網頁：http://localhost:${PORT}`));
