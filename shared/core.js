/* 江湖鏢局金庫：每一頁共用的程式（讀鏈、語言、導覽列、錢包、交易、捲動效果）。
 * 每頁的 <body data-page="home|wallet|story|rules|nft|bind" data-root="./ 或 ../">，頁面自己的程式在各資料夾的 page.js，
 * 用 ASC.onUpdate(fn) 收到最新鏈上資料、ASC.L("鍵") 取文字。合約介面見 2026_asc_web3_token 的 AGENTS.md。 */
(function () {
    const C = window.ASC_CONFIG;
    const E = window.ethers;
    const $ = (id) => document.getElementById(id);
    const ROOT = document.body.dataset.root || "./";
    const PAGE = document.body.dataset.page || "home";

    const VAULT_ABI = [
        "function query(string what) view returns (uint256[] values, string text)",
        "function balanceOf(address) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
        "function exchange(address token, uint256 points) returns (uint256)",
        "function transfer(address to, uint256 value) returns (bool)",
        "event Deposited(address indexed token, uint256 amount, uint256 totalDeposited)",
        "event Exchanged(address indexed user, address indexed token, uint256 points, uint256 amount)",
        "event ExchangeFee(address indexed token, uint256 toReserve, uint256 toNextPeriod, uint256 toHolders)",
        "event ReserveWithdrawn(address indexed token, address indexed to, uint256 amount, uint256 reserveLeft)",
        "event PeriodReset(uint256 start, uint256 end)",
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "error NotOwner(address caller)", "error ZeroAmount()", "error ExchangeClosed()", "error NotEnoughPoints(uint256 balance)",
        "error AmountTooSmall()", "error ExceedsAvailable(uint256 available)", "error OverPeriodCap(uint256 remaining, uint256 resetAt)",
        "error NoGateNft()", "error UnknownToken(address token)", "error SameAddress()", "error InvalidAddress(string value)",
        "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)", "error ERC20InvalidReceiver(address receiver)",
        "error ReentrancyGuardReentrantCall()"
    ];
    const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
    const ZERO = "0x0000000000000000000000000000000000000000";
    const PERIOD = 365 * 86400;
    const TIERS = [[0, 7000], [30, 7500], [60, 8000], [90, 8500], [120, 9000], [180, 9400], [240, 9700], [360, 10000]];

    const provider = E ? new E.JsonRpcProvider(C.rpcUrl, C.chainId, { staticNetwork: true }) : null;
    const iface = E ? new E.Interface(VAULT_ABI) : null;
    const vault = E && C.vault ? new E.Contract(C.vault, VAULT_ABI, provider) : null;

    /* ───────────── 語言（文字在 shared/lang.js） ───────────── */
    const TEXT = window.ASC_TEXT;
    let lang = (() => {
        try { const v = localStorage.getItem("asc-lang"); if (v === "zh" || v === "en") return v; } catch (_) { /* 沒有儲存空間 */ }
        return /^zh/i.test(navigator.language || "") ? "zh" : "en";
    })();
    const L = (key, vars = {}) => String(TEXT[lang]?.[key] ?? TEXT.zh[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
    const langListeners = [];
    function applyText() {
        document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
        document.title = `${L("page." + PAGE)}｜${L("brand.title")}`;
        document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = L(el.dataset.i18n)));
        document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = L(el.dataset.i18nHtml)));
        document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = L(el.dataset.i18nPh)));
        document.querySelectorAll("[data-lang-toggle]").forEach((el) => (el.textContent = L("lang")));
        const btn = $("connect");
        if (btn) btn.textContent = account ? short(account) : L("connect");
    }
    function setLang(v) {
        lang = v;
        try { localStorage.setItem("asc-lang", v); } catch (_) { /* 沒有儲存空間 */ }
        applyText();
        renderFoot();
        langListeners.forEach((fn) => fn());
        if (state) listeners.forEach((fn) => fn(state));
    }

    /* ───────────── 小工具 ───────────── */
    const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
    const link = (path, text) => `<a href="${C.explorer}/${path}" target="_blank" rel="noopener">${text}</a>`;
    const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
    const say = (el, text, cls) => { el.className = "msg " + (cls || "muted"); el.textContent = text; };
    const num = (v, d, max = 4) => Number(E.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max });
    const unitOf = (d) => (d >= 1 ? 10n ** BigInt(d - 1) : 1n);
    const tenth = (v, d) => num(v - (v % unitOf(d)), d, 1); // 合約只算到小數點後 1 位
    const pct = (bps) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    const date = (ts) => new Date(ts * 1000).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
    const storage = {
        get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 私密視窗或空間不足時略過 */ } }
    };

    /* ───────────── 讀取鏈上資料 ───────────── */
    const meta = new Map();
    async function tokenMeta(address) {
        const k = address.toLowerCase();
        if (!meta.has(k)) {
            const t = new E.Contract(address, ERC20_ABI, provider);
            const [symbol, decimals] = await Promise.all([t.symbol().catch(() => "TOKEN"), t.decimals().catch(() => 18n)]);
            meta.set(k, { symbol: String(symbol).slice(0, 12), decimals: Number(decimals) });
        }
        return meta.get(k);
    }

    /** query("pool 0x…")：[點數, 門檻OK, 期末, 持有天數, 比例bps]＋每種代幣 8 個；代幣地址從文字「|| 符號 0x地址:」解析 */
    async function readPool(who) {
        const [values, text] = await vault.query(`pool ${who || ZERO}`);
        const v = [...values];
        const addrs = [...String(text).matchAll(/\|\| \S+ (0x[0-9a-fA-F]{40}):/g)].map((m) => E.getAddress(m[1]));
        const tokens = await Promise.all(addrs.map(async (address, i) => {
            const o = 5 + 8 * i;
            return { address, ...(await tokenMeta(address)), balance: v[o], reserve: v[o + 1], locked: v[o + 2], available: v[o + 3], share100: v[o + 4], cap: v[o + 5], left: v[o + 6], all: v[o + 7] };
        }));
        return { points: v[0], gateOk: v[1] === 1n, periodEnd: Number(v[2]), days: Number(v[3]), keepBps: Number(v[4]), tokens };
    }

    async function readAll() {
        const [pool, status, rule, supply] = await Promise.all([readPool(account), vault.query("status"), vault.query("rule"), vault.totalSupply()]);
        const r = [...rule[0]];
        const gatePart = String(rule[1]).split("Gate:")[1] ?? "";
        return {
            ...pool,
            open: status[0][0] === 1n,
            owner: /Owner (0x[0-9a-fA-F]{40})/.exec(status[1])?.[1] ?? null,
            capBps: Number(r[0]), periodStart: Number(r[2]), periodEnd: Number(r[3]), issued: r[5], supply,
            gates: [...gatePart.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => E.getAddress(m[0]))
        };
    }

    /* ───────────── 歷史幣值：從部署區塊重播金庫事件 ───────────── */
    let hist = new Map(); // token 小寫地址 -> [{ t, p }]
    async function getLogsRange(from, to) {
        const out = [];
        let step = 20000;
        for (let start = from; start <= to;) {
            const end = Math.min(start + step - 1, to);
            try {
                out.push(...(await provider.getLogs({ address: C.vault, fromBlock: start, toBlock: end })));
                start = end + 1;
            } catch (err) {
                if (step <= 1000) throw err;
                step = Math.floor(step / 2);
            }
        }
        return out;
    }
    async function loadHistory() {
        if (!vault || !C.deployBlock) return hist;
        const key = `asc-history:${C.vault.toLowerCase()}`;
        const cache = storage.get(key) ?? { last: C.deployBlock - 1, logs: [], times: {} };
        const latest = await provider.getBlockNumber();
        if (latest - cache.last > 3_000_000) return hist;
        const fresh = cache.last < latest ? await getLogsRange(cache.last + 1, latest) : [];
        for (const l of fresh) cache.logs.push({ b: l.blockNumber, i: l.index, h: l.transactionHash, topics: l.topics, data: l.data });
        cache.last = latest;
        for (const b of new Set([C.deployBlock, ...cache.logs.map((l) => l.b)])) if (!cache.times[b]) cache.times[b] = (await provider.getBlock(b))?.timestamp ?? 0;
        storage.set(key, cache);
        hist = replay(cache);
        return hist;
    }
    /** 依合約規則重算每筆交易後的「每 1 ASC 價值」 */
    function replay(cache) {
        let periodStart = cache.times[C.deployBlock];
        let supply = 0n;
        const pools = new Map();
        const pool = (t) => {
            const k = t.toLowerCase();
            if (!pools.has(k)) pools.set(k, { bal: 0n, dep: 0n, fee: 0n, out: 0n, lockP: -1, lock: 0n });
            return pools.get(k);
        };
        const curStart = (ts) => periodStart + Math.floor((ts - periodStart) / PERIOD) * PERIOD;
        const logs = [...cache.logs].sort((a, b) => a.b - b.b || a.i - b.i);
        const out = new Map();
        for (let i = 0; i < logs.length; i++) {
            const l = logs[i];
            const ts = cache.times[l.b];
            let ev = null;
            try { ev = iface.parseLog({ topics: l.topics, data: l.data }); } catch (_) { /* 不是金庫的事件 */ }
            if (ev) {
                const a = ev.args;
                if (ev.name === "Transfer") { if (a.from === ZERO) supply += a.value; if (a.to === ZERO) supply -= a.value; }
                else if (ev.name === "Deposited") { const p = pool(a.token); p.bal += a.amount; p.dep += a.amount; }
                else if (ev.name === "Exchanged") pool(a.token).bal -= a.amount;
                else if (ev.name === "ExchangeFee") {
                    const p = pool(a.token); p.fee += a.toReserve;
                    const s = curStart(ts);
                    if (p.lockP !== s) { p.lockP = s; p.lock = 0n; }
                    p.lock += a.toNextPeriod;
                } else if (ev.name === "ReserveWithdrawn") { const p = pool(a.token); p.bal -= a.amount; p.out += a.amount; }
                else if (ev.name === "PeriodReset") periodStart = Number(a.start);
            }
            if (logs[i + 1]?.h === l.h) continue; // 同一筆交易處理完才記一個點
            for (const [k, p] of pools) {
                const full = (p.dep * 5000n) / 10000n + p.fee;
                const reserve = full > p.out ? full - p.out : 0n;
                const locked = p.lockP === curStart(ts) ? p.lock : 0n;
                const avail = p.bal > reserve + locked ? p.bal - reserve - locked : 0n;
                const m = meta.get(k);
                if (!m || supply === 0n) continue;
                if (!out.has(k)) out.set(k, []);
                out.get(k).push({ t: ts, p: Number(E.formatUnits(avail, m.decimals)) / Number(supply) });
            }
        }
        return out;
    }

    /* ───────────── 錢包與交易 ───────────── */
    let account = null;
    function openInMetaMask() {
        location.href = "https://metamask.app.link/dapp/" + location.host + location.pathname + location.hash;
    }
    async function walletSigner() {
        if (!window.ethereum) {
            openInMetaMask();
            throw new Error(L("err.noWallet"));
        }
        const hex = "0x" + C.chainId.toString(16);
        try {
            await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
        } catch (e) {
            if (e && e.code === 4902) await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: C.chainName, nativeCurrency: { name: C.currency, symbol: C.currency, decimals: 18 }, rpcUrls: [C.rpcUrl], blockExplorerUrls: [C.explorer] }] });
            else throw e;
        }
        return new E.BrowserProvider(window.ethereum).getSigner();
    }
    async function connect() {
        const signer = await walletSigner();
        account = await signer.getAddress();
        applyText();
        await refresh();
        return account;
    }
    /** 換頁時不用再按一次：錢包已授權過這個網站就直接帶入（不跳視窗） */
    async function silentAccount() {
        try {
            const [a] = (await window.ethereum?.request({ method: "eth_accounts" })) ?? [];
            if (a) account = E.getAddress(a);
        } catch (_) { /* 沒有錢包 */ }
    }
    function explain(e) {
        if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return L("err.cancel");
        let name = e?.revert?.name;
        let args = e?.revert?.args;
        const data = e?.data || e?.info?.error?.data?.data || e?.info?.error?.data;
        if (!name && typeof data === "string" && data.startsWith("0x")) {
            try { const p = iface.parseError(data); name = p?.name; args = p?.args; } catch (_) { /* 不是合約的錯誤 */ }
        }
        if (name === "OverPeriodCap") return args ? L("err.OverPeriodCap", { v: num(args[0], state?.tokens[0]?.decimals ?? 6), date: date(Number(args[1])) }) : L("err.OverPeriodCap0");
        if (name && TEXT.zh["err." + name]) return L("err." + name);
        return L("err.fail", { e: e?.shortMessage || e?.message || e });
    }
    async function sendTx(msgEl, label, fn, contract = vault) {
        try {
            const signer = await walletSigner();
            say(msgEl, L("tx.wallet", { label }));
            const tx = await fn(contract.connect(signer));
            say(msgEl, L("tx.sent"));
            await tx.wait();
            say(msgEl, L("tx.mined"));
            await refresh();
            msgEl.className = "msg";
            msgEl.innerHTML = `<span class="ok">${L("tx.done")}</span> ${link(`tx/${tx.hash}`, L("tx.view"))}`;
            return tx;
        } catch (e) {
            say(msgEl, explain(e), "err");
            return null;
        }
    }

    /* ───────────── 狀態與更新 ───────────── */
    let state = null;
    const listeners = [];
    let busy = false;
    async function refresh() {
        if (!vault || busy) return state;
        busy = true;
        try {
            state = await readAll();
            listeners.forEach((fn) => fn(state));
            const tick = $("tick");
            if (tick) tick.textContent = L("tick.updated", { t: new Date().toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-GB", { hour12: false }) });
        } catch (e) {
            const tick = $("tick");
            if (tick) tick.textContent = L("tick.fail", { e: e.shortMessage || e.message });
        } finally {
            busy = false;
        }
        return state;
    }

    /* ───────────── 導覽列、頁尾、捲動效果 ───────────── */
    const PAGES = [["home", ""], ["wallet", "wallet/"], ["story", "story/"], ["rules", "rules/"], ["nft", "nft/"]];
    function renderHeader() {
        const h = document.createElement("header");
        h.innerHTML = `<div class="bar">
  <a class="brand" href="${ROOT}"><span class="logo">ASC</span><span><b data-i18n="brand.title"></b><small data-i18n="brand.sub"></small></span></a>
  <nav>${PAGES.map(([k, href]) => `<a href="${ROOT}${href}" class="${k === PAGE ? "on" : ""}" data-i18n="nav.${k}"></a>`).join("")}</nav>
  <div class="row"><button class="lang" data-lang-toggle></button><button id="connect"></button></div>
</div>`;
        document.body.prepend(h);
        $("connect").onclick = () => (account ? refresh() : connect().catch((e) => alert(e?.message || e)));
    }
    function renderFoot() {
        const f = $("foot");
        if (!f) return;
        f.innerHTML = `<span>${L("foot.1", { chain: esc(C.chainName), vault: link(`address/${C.vault}`, short(C.vault)), nft: C.nft ? link(`address/${C.nft}`, short(C.nft)) : "—" })}</span><span>${L("safety")} ${L("foot.2")}</span>`;
    }
    /** 捲動淡入＋底部「往下看」提示（捲到接近最底就消失） */
    function setupScroll() {
        const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12 });
        const watch = () => document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
        watch();
        new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
        const cue = document.createElement("div");
        cue.className = "cue";
        cue.innerHTML = `<span data-i18n="cue"></span><i></i>`;
        document.body.appendChild(cue);
        const check = () => cue.classList.toggle("hide", window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 160);
        window.addEventListener("scroll", check, { passive: true });
        window.addEventListener("resize", check);
        if (window.ResizeObserver) new ResizeObserver(check).observe(document.body); // 圖片載入後頁面變長也要重算
        setTimeout(check, 300);
    }
    function bindZoom(root = document) {
        root.querySelectorAll("[data-zoom]").forEach((img) => (img.onclick = () => {
            const z = document.createElement("div");
            z.className = "zoom";
            z.innerHTML = `<img src="${img.src}" alt="">`;
            z.onclick = () => z.remove();
            document.body.appendChild(z);
        }));
    }

    /* ───────────── 啟動 ───────────── */
    async function boot() {
        // 舊網址 #bind=金鑰（Discord 舊連結）一律轉到綁定頁
        if (PAGE !== "bind" && /(?:^#|&)bind=[0-9a-f]{48}/.test(location.hash)) {
            location.replace(`${ROOT}bind/${location.hash}`);
            return;
        }
        if (PAGE !== "bind") renderHeader();
        document.querySelectorAll("[data-lang-toggle]").forEach((b) => (b.onclick = () => setLang(lang === "zh" ? "en" : "zh")));
        applyText();
        renderFoot();
        if (PAGE !== "bind") setupScroll();
        bindZoom();
        if (window.ethereum?.on) window.ethereum.on("accountsChanged", () => location.reload());
        if (PAGE === "bind" || PAGE === "story") return;
        if (!vault) {
            const tick = $("tick");
            if (tick) tick.textContent = L("tick.noVault");
            return;
        }
        await silentAccount();
        applyText();
        await refresh();
        setInterval(() => { if (!document.hidden) refresh(); }, Math.max(Number(C.refreshSeconds) || 15, 5) * 1000);
    }

    window.ASC = {
        C, E, $, L, esc, say, short, link, num, tenth, pct, date, unitOf, TIERS, ROOT, PAGE,
        get lang() { return lang; }, get state() { return state; }, get account() { return account; },
        provider, vault, iface, refresh, connect, walletSigner, sendTx, explain, loadHistory, bindZoom, openInMetaMask,
        onUpdate(fn) { listeners.push(fn); if (state) fn(state); },
        onLang(fn) { langListeners.push(fn); }
    };
    document.addEventListener("DOMContentLoaded", boot);
})();
