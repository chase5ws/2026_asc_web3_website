/* 綁定錢包（獨立小頁，不依賴其他程式）：Discord 機器人給的連結 bind/#bind=金鑰
 *   GET {botApi}/api/bind/<金鑰> 讀要簽的文字 → MetaMask personal_sign → POST {address, signature} 送回機器人 */
(function () {
    const C = window.ASC_CONFIG || {};
    const $ = (id) => document.getElementById(id);
    const TEXT = {
        zh: {
            lang: "EN", title: "連結錢包", go: "連接錢包並簽名", text: "要簽署的文字（不花 Gas、不授權任何資產）", loading: "讀取中…",
            noApi: "網站還沒有設定機器人網址（config.js 的 botApi），請聯絡總鏢頭。", offline: "連不到機器人，請確認機器人在線上後重新整理。",
            invalid: "連結無效", noWallet: "找不到錢包。電腦請安裝 MetaMask；手機會跳到 MetaMask App 開啟此頁。",
            pick: "請在錢包中選擇要綁定的帳戶…", sign: "請在錢包中確認簽名（不會花費 Gas）…", verify: "驗證中…", fail: "綁定失敗",
            ok: "綁定成功：{a}\n可以關閉此頁，回到 Discord 按「我的錢包」查看。", cancel: "你取消了簽名。",
            safety: "機器人和網站永遠不會向你要私鑰或助記詞。"
        },
        en: {
            lang: "中文", title: "Connect Wallet", go: "Connect & Sign", text: "Message to sign (no gas, no asset approval)", loading: "Loading…",
            noApi: "The bot address (botApi in config.js) is not set. Please contact the chief escort.", offline: "Can't reach the bot. Make sure it's online and refresh.",
            invalid: "Invalid link", noWallet: "No wallet found. Install MetaMask on desktop; on mobile this page will open in the MetaMask app.",
            pick: "Choose the account to bind in your wallet…", sign: "Confirm the signature in your wallet (no gas)…", verify: "Verifying…", fail: "Binding failed",
            ok: "Bound: {a}\nYou can close this page and press \"My Wallet\" in Discord.", cancel: "You cancelled the signature.",
            safety: "The bot and this site will never ask for your private key or seed phrase."
        }
    };
    // 跟主頁共用語言設定（localStorage asc-lang＝zh／en）
    let lang = (() => {
        try { const v = String(localStorage.getItem("asc-lang") || "").replace(/"/g, ""); if (v === "zh" || v === "en") return v; } catch (_) {}
        return /^zh/i.test(navigator.language || "") ? "zh" : "en";
    })();
    const L = (k, vars = {}) => String(TEXT[lang][k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (vars[x] ?? m));
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
    const hexUtf8 = (s) => "0x" + [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
    let msgKey = null, msgKind = "", msgVars = {}, session = null;

    function say(key, kind = "", vars = {}) {
        msgKey = key; msgKind = kind; msgVars = vars;
        const m = $("bindMsg");
        m.className = "msg" + (kind ? " " + kind : "");
        m.textContent = key == null ? "" : TEXT[lang][key] !== undefined ? L(key, vars) : key; // 不在字典裡的（伺服器回的錯誤）直接顯示
    }
    function apply() {
        document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
        document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = L(el.dataset.i18n)));
        $("langBtn").textContent = L("lang");
        if (session) $("bindWho").innerHTML = `Discord：<b>${esc(session.username)}</b>`;
        else if ($("bindWho").dataset.k) $("bindWho").textContent = L($("bindWho").dataset.k);
        if (msgKey != null) say(msgKey, msgKind, msgVars);
    }
    $("langBtn").onclick = () => {
        lang = lang === "zh" ? "en" : "zh";
        try { localStorage.setItem("asc-lang", lang); } catch (_) {} // 跟主頁一樣存純文字 zh／en
        apply();
    };

    const token = /(?:^#|&)bind=([0-9a-f]{48})/.exec(location.hash)?.[1];
    const api = String(C.botApi || "").replace(/\/$/, "");

    async function start() {
        apply();
        if (!token) return say("invalid", "err");
        if (!api) return say("noApi", "err");
        $("bindWho").dataset.k = "loading";
        apply();
        try {
            const r = await fetch(`${api}/api/bind/${token}`, { signal: AbortSignal.timeout(10000) });
            session = await r.json();
            if (!session.ok) throw new Error(session.error || L("invalid"));
        } catch (e) {
            session = null;
            $("bindWho").dataset.k = "";
            $("bindWho").textContent = "";
            return say(e.message === "Failed to fetch" || e.name === "TimeoutError" ? "offline" : e.message, "err");
        }
        $("bindText").textContent = session.message;
        apply();
        $("bindGo").disabled = false;
        $("bindGo").onclick = async () => {
            if (!window.ethereum) {
                say("noWallet", "warn");
                return setTimeout(() => (location.href = "https://metamask.app.link/dapp/" + location.host + location.pathname + location.hash), 800);
            }
            $("bindGo").disabled = true;
            try {
                say("pick");
                const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
                say("sign");
                const signature = await window.ethereum.request({ method: "personal_sign", params: [hexUtf8(session.message), addr] });
                say("verify");
                const r = await fetch(`${api}/api/bind/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr, signature }) }).then((x) => x.json());
                if (!r.ok) throw new Error(r.error || L("fail"));
                $("bindGo").hidden = true;
                say("ok", "ok", { a: short(r.address) });
                history.replaceState?.(null, "", location.pathname);
            } catch (e) {
                say(e?.code === 4001 ? "cancel" : e.message || String(e), "err");
                $("bindGo").disabled = false;
            }
        };
    }
    start();
})();
