/* 江湖鏢局金庫網頁：直接讀 Polygon 鏈上的 AscPoint 金庫（點數＝ERC-20 代幣 ASC），不經過任何伺服器、沒有任何機密。
 * 唯一會連到 Discord 機器人的是「綁定錢包」：網址 #bind=金鑰 時，簽名後送回機器人（config.js 的 botApi）。
 * 合約介面見 2026_asc_web3_token 的 AGENTS.md（query 的數字陣列格式）。 */
const C = window.ASC_CONFIG;
const $ = (id) => document.getElementById(id);
const E = ethers;

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
    "error NotOwner(address caller)",
    "error ZeroAmount()",
    "error ExchangeClosed()",
    "error NotEnoughPoints(uint256 balance)",
    "error AmountTooSmall()",
    "error ExceedsAvailable(uint256 available)",
    "error OverPeriodCap(uint256 remaining, uint256 resetAt)",
    "error NoGateNft()",
    "error UnknownToken(address token)",
    "error SameAddress()",
    "error InvalidAddress(string value)",
    "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
    "error ERC20InvalidReceiver(address receiver)",
    "error ReentrancyGuardReentrantCall()"
];
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
const NFT_ABI = [
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function maxSupply() view returns (uint256)",
    "function MAX_SUPPLY() view returns (uint256)",
    "function allowListMintOpen() view returns (bool)",
    "function allowList(address) view returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
    "function allowListMint() payable"
];
const ZERO = "0x0000000000000000000000000000000000000000";
const PERIOD = 365 * 86400;
const TIERS = [[0, 7000], [30, 7500], [60, 8000], [90, 8500], [120, 9000], [180, 9400], [240, 9700], [360, 10000]];

const provider = new E.JsonRpcProvider(C.rpcUrl, C.chainId, { staticNetwork: true });
const iface = new E.Interface(VAULT_ABI);
const vault = C.vault ? new E.Contract(C.vault, VAULT_ABI, provider) : null;
const nft = C.nft ? new E.Contract(C.nft, NFT_ABI, provider) : null;

let account = null;
let state = null; // 最新一次讀到的鏈上資料
let selected = 0; // 選中的代幣（金庫存款順序）
const meta = new Map();
const live = new Map(); // token 小寫地址 -> [{ t, p }] 本次開啟後的即時點
let hist = new Map(); // token 小寫地址 -> [{ t, p, supply, avail }]
let lastPrice = new Map();

/* ───────────── 語言（文字在 lang.js） ───────────── */
const TEXT = window.ASC_TEXT;
const STORY = window.ASC_STORY;
let lang = (() => {
    try { const v = localStorage.getItem("asc-lang"); if (v === "zh" || v === "en") return v; } catch (_) { /* 沒有儲存空間 */ }
    return /^zh/i.test(navigator.language || "") ? "zh" : "en";
})();
/** 取文字：L("鍵", { 變數 }) */
function L(key, vars = {}) {
    const raw = TEXT[lang]?.[key] ?? TEXT.zh[key] ?? key;
    return raw.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : vars[k]));
}
function applyText() {
    document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en";
    document.title = L("page.title");
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = L(el.dataset.i18n)));
    document.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = L(el.dataset.i18nHtml)));
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = L(el.dataset.i18nPh)));
    document.querySelectorAll("[data-lang-toggle]").forEach((el) => (el.textContent = L("lang")));
}
function setLang(v) {
    lang = v;
    try { localStorage.setItem("asc-lang", v); } catch (_) { /* 沒有儲存空間 */ }
    applyText();
    renderStory();
    if (account) $("connect").textContent = L("refresh");
    renderFoot();
    if (state) { renderAll(); renderRules().catch(() => {}); renderNft().catch(() => {}); }
}

/* ───────────── 小工具 ───────────── */
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const link = (path, text) => `<a href="${C.explorer}/${path}" target="_blank" rel="noopener">${text}</a>`;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
const say = (el, text, cls) => { el.className = "msg " + (cls || "muted"); el.textContent = text; };
const ipfs = (u) => (String(u || "").startsWith("ipfs://") ? C.ipfsGateway + u.slice(7).replace(/^ipfs\//, "") : u);
const num = (v, d, max = 4) => Number(E.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max });
const unitOf = (d) => (d >= 1 ? 10n ** BigInt(d - 1) : 1n);
const tenth = (v, d) => num(v - (v % unitOf(d)), d, 1); // 合約只算到小數點後 1 位
const pct = (bps) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const date = (ts) => new Date(ts * 1000).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
const storage = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* 私密視窗或空間不足時略過 */ } }
};

async function tokenMeta(address) {
    const k = address.toLowerCase();
    if (!meta.has(k)) {
        const t = new E.Contract(address, ERC20_ABI, provider);
        const [symbol, decimals] = await Promise.all([t.symbol().catch(() => "TOKEN"), t.decimals().catch(() => 18n)]);
        meta.set(k, { symbol: String(symbol).slice(0, 12), decimals: Number(decimals) });
    }
    return meta.get(k);
}

/** 錯誤訊息轉成中文（合約的自訂錯誤） */
function explain(e) {
    if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return L("err.cancel");
    let name = e?.revert?.name;
    let args = e?.revert?.args;
    const data = e?.data || e?.info?.error?.data?.data || e?.info?.error?.data;
    if (!name && typeof data === "string" && data.startsWith("0x")) {
        try { const p = iface.parseError(data); name = p?.name; args = p?.args; } catch (_) { /* 不是合約的錯誤 */ }
    }
    if (name === "OverPeriodCap") return args ? L("err.OverPeriodCap", { v: num(args[0], tokenNow()?.decimals ?? 6), date: date(Number(args[1])) }) : L("err.OverPeriodCap0");
    if (name && TEXT.zh["err." + name]) return L("err." + name);
    return L("err.fail", { e: e?.shortMessage || e?.message || e });
}

/* ───────────── 讀取鏈上資料 ───────────── */

/** query("pool 0x…")：每種代幣的池子＋這個帳號能拿多少 */
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
    const [pool, status, rule, supply] = await Promise.all([
        readPool(account),
        vault.query("status"),
        vault.query("rule"),
        vault.totalSupply()
    ]);
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

const tokenNow = () => state?.tokens[selected] ?? null;

/* ───────────── 歷史幣值：從部署區塊開始重播金庫事件 ───────────── */

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
    if (!vault || !C.deployBlock) return;
    const key = `asc-history:${C.vault.toLowerCase()}`;
    const cache = storage.get(key) ?? { last: C.deployBlock - 1, logs: [], times: {} };
    const latest = await provider.getBlockNumber();
    if (latest - cache.last > 3_000_000) return; // 太久沒開過、範圍太大就略過歷史（即時資料不受影響）
    const fresh = cache.last < latest ? await getLogsRange(cache.last + 1, latest) : [];
    for (const l of fresh) cache.logs.push({ b: l.blockNumber, i: l.index, h: l.transactionHash, topics: l.topics, data: l.data });
    cache.last = latest;
    const blocks = new Set([C.deployBlock, ...cache.logs.map((l) => l.b)]);
    for (const b of blocks) if (!cache.times[b]) cache.times[b] = (await provider.getBlock(b))?.timestamp ?? 0;
    storage.set(key, cache);
    hist = replay(cache);
}

/** 依合約的規則重算每一筆交易之後的「每 1 ASC 價值」 */
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
        let ev;
        try { ev = iface.parseLog({ topics: l.topics, data: l.data }); } catch (_) { ev = null; }
        if (ev) {
            const a = ev.args;
            if (ev.name === "Transfer") {
                if (a.from === ZERO) supply += a.value;
                if (a.to === ZERO) supply -= a.value;
            } else if (ev.name === "Deposited") {
                const p = pool(a.token); p.bal += a.amount; p.dep += a.amount;
            } else if (ev.name === "Exchanged") {
                pool(a.token).bal -= a.amount;
            } else if (ev.name === "ExchangeFee") {
                const p = pool(a.token); p.fee += a.toReserve;
                const s = curStart(ts);
                if (p.lockP !== s) { p.lockP = s; p.lock = 0n; }
                p.lock += a.toNextPeriod;
            } else if (ev.name === "ReserveWithdrawn") {
                const p = pool(a.token); p.bal -= a.amount; p.out += a.amount;
            } else if (ev.name === "PeriodReset") {
                periodStart = Number(a.start);
            }
        }
        // 同一筆交易的事件全部處理完才記一個點
        if (logs[i + 1]?.h === l.h) continue;
        for (const [k, p] of pools) {
            const reserveFull = (p.dep * 5000n) / 10000n + p.fee;
            const reserve = reserveFull > p.out ? reserveFull - p.out : 0n;
            const locked = p.lockP === curStart(ts) ? p.lock : 0n;
            const avail = p.bal > reserve + locked ? p.bal - reserve - locked : 0n;
            const m = meta.get(k);
            if (!m || supply === 0n) continue;
            if (!out.has(k)) out.set(k, []);
            out.get(k).push({ t: ts, p: Number(E.formatUnits(avail, m.decimals)) / Number(supply), supply: Number(supply), avail: Number(E.formatUnits(avail, m.decimals)) });
        }
    }
    return out;
}

/* ───────────── 畫面：即時幣值 ───────────── */

function renderTabs() {
    $("tokenTabs").innerHTML = state.tokens.length > 1
        ? state.tokens.map((t, i) => `<button data-tok="${i}" class="${i === selected ? "on" : ""}">${esc(t.symbol)}</button>`).join("")
        : "";
    document.querySelectorAll("[data-tok]").forEach((b) => (b.onclick = () => { selected = Number(b.dataset.tok); renderAll(); }));
}

function renderMarket() {
    const t = tokenNow();
    const supply = state.supply;
    $("mSupply").textContent = `${supply.toLocaleString()} ASC`;
    $("mIssued").textContent = L("m.issuedTotal", { n: state.issued.toLocaleString() });
    $("mIssued2").textContent = `${state.issued.toLocaleString()} ASC`;
    $("mBurned").textContent = `${(state.issued - supply).toLocaleString()} ASC`;
    $("tankAsc").style.height = `${state.issued > 0n ? Number((supply * 100n) / state.issued) : 0}%`;
    $("sSupply").textContent = supply.toLocaleString();
    $("sOpen").innerHTML = state.open ? `<span class="ok">${L("open")}</span>` : `<span class="warn">${L("closed")}</span>`;
    $("sEnd").textContent = date(state.periodEnd);
    if (!t) {
        $("mPrice").textContent = "—";
        $("m100").textContent = L("m.noToken");
        $("sPool").textContent = "—";
        return;
    }
    $("mSym").textContent = t.symbol;
    $("tName").textContent = t.symbol;
    $("tokIcon").textContent = t.symbol.slice(0, 4);
    $("sPool").textContent = `${num(t.balance, t.decimals, 2)} ${t.symbol}`;
    $("mAvail").textContent = `${num(t.available, t.decimals)} ${t.symbol}`;
    $("mBal").textContent = L("m.poolBal", { n: num(t.balance, t.decimals, 2) });
    $("tankTok").style.height = `${t.balance > 0n ? Number((t.available * 100n) / t.balance) : 0}%`;
    const w = (x) => (t.balance > 0n ? Number((x * 10000n) / t.balance) / 100 : 0);
    $("mix").innerHTML = `<i style="width:${w(t.available)}%;background:var(--blue)" title="${L("m.avail")}"></i><i style="width:${w(t.reserve)}%;background:var(--gold)" title="${L("m.reserve")}"></i><i style="width:${w(t.locked)}%;background:var(--red)" title="${L("m.locked")}"></i>`;

    const price = supply > 0n ? Number(E.formatUnits(t.available, t.decimals)) / Number(supply) : 0;
    const k = t.address.toLowerCase();
    const prev = lastPrice.get(k);
    const el = $("mPrice");
    el.textContent = `${price.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${t.symbol}`;
    el.classList.remove("up", "down");
    if (prev !== undefined && price !== prev) {
        el.classList.add(price > prev ? "up" : "down");
        setTimeout(() => el.classList.remove("up", "down"), 2500);
    }
    lastPrice.set(k, price);
    const pts = [...(hist.get(k) ?? []), ...(live.get(k) ?? [])];
    const now = Math.floor(Date.now() / 1000);
    if (!live.has(k)) live.set(k, []);
    const lv = live.get(k);
    if (!lv.length || lv[lv.length - 1].p !== price || now - lv[lv.length - 1].t > 300) lv.push({ t: now, p: price });
    const dayAgo = [...pts].reverse().find((x) => x.t <= now - 86400) ?? pts[0];
    const d = $("mDelta");
    if (dayAgo && dayAgo.p > 0) {
        const ch = ((price - dayAgo.p) / dayAgo.p) * 100;
        d.className = "delta " + (ch > 0 ? "up" : ch < 0 ? "down" : "");
        d.textContent = `${ch > 0 ? "▲" : ch < 0 ? "▼" : "■"} ${Math.abs(ch).toFixed(2)}% (${dayAgo.t <= now - 86400 ? L("m.day") : L("m.since")})`;
    } else d.textContent = " ";
    $("m100").innerHTML = L("m.per100", { v: `${num(t.share100, t.decimals)} ${esc(t.symbol)}` });
    drawChart([...pts, { t: now, p: price }]);
}

function drawChart(points) {
    const svg = $("chart");
    const pts = points.filter((x) => Number.isFinite(x.p));
    if (pts.length < 2) {
        svg.innerHTML = `<text x="300" y="90" text-anchor="middle" fill="#5b6b93" font-size="14">${L("m.loading")}</text>`;
        $("cFrom").textContent = $("cTo").textContent = $("cInfo").textContent = "";
        return;
    }
    const W = 600, H = 170, P = 10;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
    let lo = Math.min(...pts.map((x) => x.p)), hi = Math.max(...pts.map((x) => x.p));
    if (hi === lo) { hi += hi * 0.05 || 1; lo -= lo * 0.05 || 0; }
    const X = (t) => P + ((t - t0) / Math.max(t1 - t0, 1)) * (W - 2 * P);
    const Y = (p) => H - P - ((p - lo) / (hi - lo)) * (H - 2 * P);
    // 階梯線：幣值只在交易發生時改變
    let d = `M${X(pts[0].t)},${Y(pts[0].p)}`;
    for (let i = 1; i < pts.length; i++) d += `H${X(pts[i].t)}V${Y(pts[i].p)}`;
    const area = `${d}V${H - P}H${X(t0)}Z`;
    const grid = [0.25, 0.5, 0.75].map((f) => `<line class="gd" x1="0" x2="${W}" y1="${P + f * (H - 2 * P)}" y2="${P + f * (H - 2 * P)}"/>`).join("");
    const last = pts[pts.length - 1];
    svg.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0313f" stop-opacity=".35"/><stop offset="1" stop-color="#3d8bff" stop-opacity="0"/></linearGradient></defs>
${grid}<path class="ar" d="${area}"/><path class="ln" d="${d}"/><circle cx="${X(last.t)}" cy="${Y(last.p)}" r="4" fill="#ff5c63"><animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite"/></circle>`;
    $("cFrom").textContent = date(t0);
    $("cTo").textContent = L("m.now");
    $("cInfo").textContent = L("m.hilo", { hi: hi.toPrecision(4), lo: lo.toPrecision(4) });
}

/* ───────────── 畫面：我的 ASC ───────────── */

function previewFor(t, p) {
    const supply = state.supply;
    if (!t || supply === 0n || p <= 0n) return null;
    const share = (t.available * p) / supply;
    const raw = (share * BigInt(state.keepBps)) / 10000n;
    const unit = unitOf(t.decimals);
    const get = raw - (raw % unit);
    return { share, get, fee: share - get };
}

function renderMine() {
    if (!account) return;
    $("mineLocked").hidden = true;
    $("mineBox").hidden = false;
    const t = tokenNow();
    $("myAsc").textContent = `${state.points.toLocaleString()} ASC`;
    $("myAddr").innerHTML = link(`address/${account}`, short(account));
    $("myDays").textContent = state.points > 0n ? state.days : 0;
    $("myKeep").textContent = pct(state.keepBps);
    const next = TIERS.find(([d]) => d > state.days);
    const cur = [...TIERS].reverse().find(([d]) => d <= state.days) ?? TIERS[0];
    $("myProg").style.width = next ? `${((state.days - cur[0]) / (next[0] - cur[0])) * 100}%` : "100%";
    $("myNext").textContent = state.points === 0n ? L("mine.none") : next ? L("mine.next", { d: next[0] - state.days, p: pct(next[1]) }) : L("mine.max");
    $("tiers").innerHTML = TIERS.map(([d, b]) => `<div class="tier ${d === cur[0] ? "now" : d < cur[0] ? "done" : ""}"><b>${pct(b)}</b>${d === 0 ? L("mine.tier0") : L("mine.tierN", { d })}</div>`).join("");
    $("myAll").textContent = t ? `${tenth(t.all, t.decimals)} ${t.symbol}` : "—";
    $("myLeft").textContent = t ? L("mine.left", { v: `${num(t.left, t.decimals)} ${t.symbol}`, date: date(state.periodEnd) }) : "";
    $("gateWarn").hidden = state.gateOk;
    if (!state.gateOk) $("gateWarn").textContent = L("mine.gate");
    const sel = $("exToken");
    sel.innerHTML = state.tokens.map((x, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${esc(x.symbol)}</option>`).join("");
    updatePreview();
    updateTransfer();
}

function updatePreview() {
    const t = state?.tokens[Number($("exToken").value || 0)];
    const raw = $("exPoints").value.trim();
    const box = $("exPreview");
    const go = $("exGo");
    go.disabled = true;
    if (!t) { box.innerHTML = `<span class="muted small">${L("ex.noToken")}</span>`; return; }
    if (!/^\d+$/.test(raw) || raw === "0") { box.innerHTML = `<span class="muted small">${L("ex.enter", { n: state.points.toLocaleString() })}</span>`; return; }
    const p = BigInt(raw);
    const r = previewFor(t, p);
    const problems = [];
    if (!state.open) problems.push(L("ex.pClosed"));
    if (!state.gateOk) problems.push(L("ex.pGate"));
    if (p > state.points) problems.push(L("ex.pPoints", { n: state.points }));
    if (r && r.get === 0n) problems.push(L("ex.pSmall"));
    if (r && r.get > t.left) problems.push(L("ex.pCap", { v: num(t.left, t.decimals) }));
    box.innerHTML = r ? `<div class="kv"><span>${L("ex.share")}</span><b>${num(r.share, t.decimals)} ${esc(t.symbol)}</b></div>
<div class="kv"><span>${L("ex.keep", { p: pct(state.keepBps) })}</span><b class="${problems.length ? "" : "ok"}">${num(r.get, t.decimals, 1)} ${esc(t.symbol)}</b></div>
<div class="kv"><span>${L("ex.fee")}</span><b>${num(r.fee, t.decimals)}</b></div>
${problems.length ? `<div class="warn small">${problems.join("・")}</div>` : `<div class="small muted">${L("ex.note")}</div>`}` : "";
    go.disabled = !!problems.length || !r;
    go.textContent = r && !problems.length ? L("ex.go", { p, v: `${num(r.get, t.decimals, 1)} ${t.symbol}` }) : L("ex.title");
}

function fill(kind) {
    const t = state?.tokens[Number($("exToken").value || 0)];
    if (!t || state.points === 0n) return;
    let p = state.points;
    if (kind !== "all") {
        // 二分搜尋：最少＝剛好換得到 0.1；本期最多＝不超過本期上限的最大點數
        let lo = 1n, hi = state.points, ans = null;
        while (lo <= hi) {
            const mid = (lo + hi) / 2n;
            const r = previewFor(t, mid);
            const ok = kind === "min" ? r && r.get > 0n : r && r.get <= t.left;
            if (kind === "min" ? ok : ok) {
                ans = mid;
                if (kind === "min") hi = mid - 1n; else lo = mid + 1n;
            } else if (kind === "min") lo = mid + 1n; else hi = mid - 1n;
        }
        if (ans === null) return say($("exMsg"), kind === "min" ? L("ex.fillMin") : L("ex.fillMax"), "warn");
        p = ans;
    }
    $("exPoints").value = String(p);
    updatePreview();
}

function updateTransfer() {
    const to = $("txTo").value.trim();
    const amt = $("txAmt").value.trim();
    let problem = "";
    if (!state.open) problem = L("tx.closed");
    else if (to && !E.isAddress(to)) problem = L("tx.bad");
    else if (to && E.isAddress(to) && E.getAddress(to) === E.getAddress(account)) problem = L("tx.self");
    else if (to && E.isAddress(to) && E.getAddress(to) === E.getAddress(C.vault)) problem = L("tx.vault");
    else if (amt && (!/^\d+$/.test(amt) || amt === "0")) problem = L("tx.int");
    else if (amt && BigInt(amt) > state.points) problem = L("ex.pPoints", { n: state.points });
    $("txGo").disabled = !!problem || !to || !amt;
    if (problem) say($("txMsg"), problem, "warn");
    else if ($("txMsg").classList.contains("warn")) say($("txMsg"), "");
}

/* ───────────── 規則、門檻 ───────────── */

async function renderRules() {
    $("rOpen").innerHTML = state.open ? `<span class="chip on">${L("open")}</span>` : `<span class="chip off">${L("closed")}</span>`;
    $("rPeriod").textContent = `${date(state.periodStart)} ～ ${date(state.periodEnd)}`;
    $("rCap").textContent = L("r.capV", { p: pct(state.capBps) });
    $("rOwner").innerHTML = state.owner ? `${link(`address/${state.owner}`, short(state.owner))}${C.safe && state.owner.toLowerCase() === C.safe.toLowerCase() ? L("r.safe") : ""}` : "—";
    $("rVault").innerHTML = link(`address/${C.vault}`, short(C.vault));
    if (!state.gates.length) return ($("gates").textContent = L("r.noGate"));
    const rows = await Promise.all(state.gates.map(async (g) => {
        const name = await new E.Contract(g, ["function name() view returns (string)"], provider).name().catch(() => "NFT");
        return `<div class="kv"><span>${esc(name)}</span><b>${link(`address/${g}`, short(g))}</b></div>`;
    }));
    $("gates").innerHTML = rows.join("");
}

/* ───────────── 信物 NFT（合約介面可能不同，讀不到的欄位就隱藏） ───────────── */

async function renderNft() {
    if (!nft) return;
    const opt = (p) => p.then((v) => v).catch(() => null);
    const [name, supply, max1, max2, open] = await Promise.all([opt(nft.name()), opt(nft.totalSupply()), opt(nft.maxSupply()), opt(nft.MAX_SUPPLY()), opt(nft.allowListMintOpen())]);
    const max = Number(max1 ?? max2 ?? C.nftMaxSupply ?? 0);
    $("nftName").textContent = name ?? "—";
    $("minted").textContent = supply !== null ? `${supply}${max ? ` / ${max}` : ""}` : "—";
    $("mintBar").style.width = supply !== null && max ? `${Math.min((Number(supply) / max) * 100, 100)}%` : "0";
    $("wlRow").hidden = open === null;
    if (open !== null) $("wlOpen").textContent = open ? L("open") : L("closed");
    $("nftLink").innerHTML = link(`address/${C.nft}`, L("nft.contract", { a: short(C.nft) }));
    if (!account) return;
    const [allowed, bal] = await Promise.all([opt(nft.allowList(account)), opt(nft.balanceOf(account))]);
    $("myNftRow").hidden = false;
    $("myNft").textContent = bal && bal > 0n ? L("nft.hold", { n: bal }) : allowed ? L("nft.allowed") : L("nft.notYet");
    $("mint").hidden = !(allowed && open);
    $("mint").onclick = mintNft;
    if (bal && bal > 0n) {
        try {
            const id = await nft.tokenOfOwnerByIndex(account, 0);
            const m = await (await fetch(ipfs(await nft.tokenURI(id)), { signal: AbortSignal.timeout(6000) })).json();
            if (m.image) $("nftPic").innerHTML = `<img src="${esc(ipfs(m.image))}" alt="">`;
        } catch (_) { /* 沒有 metadata 就不顯示圖 */ }
    }
}

/* ───────────── 錢包與交易 ───────────── */

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

async function sendTx(msgEl, label, fn) {
    try {
        const signer = await walletSigner();
        say(msgEl, L("tx.wallet", { label }));
        const c = vault.connect(signer);
        const tx = await fn(c);
        say(msgEl, L("tx.sent"));
        await tx.wait();
        say(msgEl, L("tx.mined"));
        await refresh();
        msgEl.className = "msg";
        msgEl.innerHTML = `<span class="ok">${L("tx.done")}</span> ${link(`tx/${tx.hash}`, L("tx.view"))}`;
    } catch (e) {
        say(msgEl, explain(e), "err");
    }
}

async function mintNft() {
    const msg = $("nftMsg");
    try {
        const signer = await walletSigner();
        say(msg, L("nft.confirm"));
        const tx = await nft.connect(signer).allowListMint({ value: 0 });
        say(msg, L("tx.sent"));
        await tx.wait();
        await refresh();
        msg.className = "msg";
        msg.innerHTML = `<span class="ok">${L("nft.done")}</span> ${link(`tx/${tx.hash}`, L("tx.view"))}`;
    } catch (e) {
        say(msg, explain(e), "err");
    }
}

async function connect() {
    try {
        const signer = await walletSigner();
        account = await signer.getAddress();
        $("who").textContent = short(account);
        $("connect").textContent = L("refresh");
        await refresh();
    } catch (e) {
        say($("exMsg"), e?.message || String(e), "err");
        alertTop(e?.message || String(e));
    }
}

function alertTop(text) {
    $("tick").textContent = text;
}

/* ───────────── 主流程 ───────────── */

function renderAll() {
    if (!state) return;
    renderTabs();
    renderMarket();
    renderMine();
}

let busy = false;
async function refresh() {
    if (!vault || busy) return;
    busy = true;
    try {
        state = await readAll();
        if (selected >= state.tokens.length) selected = 0;
        renderAll();
        renderRules().catch(() => {});
        renderNft().catch(() => {});
        $("tick").textContent = L("tick.updated", { t: new Date().toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-GB", { hour12: false }) });
    } catch (e) {
        $("tick").textContent = L("tick.fail", { e: e.shortMessage || e.message });
    } finally {
        busy = false;
    }
}

/* ───────────── 鏢局故事 ───────────── */

let chapterIdx = 0;
function renderStory() {
    const st = STORY[lang] ?? STORY.zh;
    $("about").innerHTML = st.about.map((a) => `<div class="card"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div>`).join("");
    $("chapterTabs").innerHTML = st.chapters.map((c, i) => `<button data-ch="${i}" class="${i === chapterIdx ? "on" : ""}">${esc(c.tag)}・${esc(c.title)}</button>`).join("");
    document.querySelectorAll("[data-ch]").forEach((b) => (b.onclick = () => { chapterIdx = Number(b.dataset.ch); renderStory(); }));
    const c = st.chapters[chapterIdx];
    $("chapter").innerHTML = `<div class="text"><h3><small>${esc(c.tag)}</small>${esc(c.title)}</h3>${c.text.map((p) => `<p>${esc(p)}</p>`).join("")}</div>
<div class="art">${c.img.map((f) => `<img src="assets/${f}" alt="" loading="lazy" data-zoom>`).join("")}</div>`;
    bindZoom();
}

function bindZoom() {
    document.querySelectorAll("[data-zoom]").forEach((img) => (img.onclick = () => {
        const z = document.createElement("div");
        z.className = "zoom";
        z.innerHTML = `<img src="${img.src}" alt="">`;
        z.onclick = () => z.remove();
        document.body.appendChild(z);
    }));
}

function renderFoot() {
    $("foot").innerHTML = `<span>${L("foot.1", { chain: esc(C.chainName), vault: link(`address/${C.vault}`, short(C.vault)), nft: C.nft ? link(`address/${C.nft}`, short(C.nft)) : "—" })}</span><span>${L("safety")} ${L("foot.2")}</span>`;
}

function startSite() {
    renderStory();
    $("connect").onclick = () => (account ? refresh() : connect());
    $("connect2").onclick = connect;
    $("exToken").onchange = () => { selected = Number($("exToken").value); renderAll(); };
    $("exPoints").oninput = updatePreview;
    document.querySelectorAll("[data-fill]").forEach((b) => (b.onclick = () => fill(b.dataset.fill)));
    $("exGo").onclick = () => {
        const t = state.tokens[Number($("exToken").value)];
        const p = BigInt($("exPoints").value);
        sendTx($("exMsg"), L("ex.title"), (c) => c.exchange(t.address, p));
    };
    $("txTo").oninput = $("txAmt").oninput = updateTransfer;
    $("txGo").onclick = () => {
        const to = E.getAddress($("txTo").value.trim());
        if (!confirm(L("tx.confirm", { n: $("txAmt").value, to }))) return;
        sendTx($("txMsg"), L("tx.title"), (c) => c.transfer(to, BigInt($("txAmt").value)));
    };
    renderFoot();
    if (window.ethereum?.on) window.ethereum.on("accountsChanged", () => location.reload());
    if (!vault) {
        $("tick").textContent = L("tick.noVault");
        return;
    }
    refresh().then(() => loadHistory().then(renderAll).catch(() => {}));
    setInterval(() => { if (!document.hidden) refresh(); }, Math.max(Number(C.refreshSeconds) || 15, 5) * 1000);
}

/* ───────────── 綁定錢包（#bind=金鑰，從 Discord 開啟） ───────────── */

async function startBind(token) {
    $("app").hidden = true;
    $("bindView").hidden = false;
    document.title = `${L("bind.title")}｜ASC`;
    $("bindWho").textContent = L("bind.loading");
    const msg = $("bindMsg");
    const api = String(C.botApi || "").replace(/\/$/, "");
    if (!api) return say(msg, L("bind.noApi"), "err");
    let session;
    try {
        const r = await fetch(`${api}/api/bind/${token}`, { signal: AbortSignal.timeout(10000) });
        session = await r.json();
        if (!session.ok) throw new Error(session.error || L("bind.invalid"));
    } catch (e) {
        $("bindWho").textContent = "";
        return say(msg, e.message === "Failed to fetch" ? L("bind.offline") : e.message, "err");
    }
    $("bindWho").innerHTML = `Discord：<b>${esc(session.username)}</b>`;
    $("bindText").textContent = session.message;
    $("bindGo").disabled = false;
    $("bindGo").onclick = async () => {
        if (!window.ethereum) {
            say(msg, L("bind.noWallet"), "warn");
            return setTimeout(openInMetaMask, 800);
        }
        $("bindGo").disabled = true;
        try {
            say(msg, L("bind.pick"));
            const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
            say(msg, L("bind.sign"));
            const signature = await window.ethereum.request({ method: "personal_sign", params: [E.hexlify(E.toUtf8Bytes(session.message)), addr] });
            say(msg, L("bind.verify"));
            const r = await fetch(`${api}/api/bind/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr, signature }) }).then((x) => x.json());
            if (!r.ok) throw new Error(r.error || L("bind.fail"));
            $("bindGo").hidden = true;
            msg.className = "msg ok";
            msg.textContent = L("bind.ok", { a: short(r.address) });
            history.replaceState?.(null, "", location.pathname);
        } catch (e) {
            say(msg, e?.code === 4001 ? L("bind.cancel") : e.message || String(e), "err");
            $("bindGo").disabled = false;
        }
    };
}

applyText();
document.querySelectorAll("[data-lang-toggle]").forEach((b) => (b.onclick = () => { setLang(lang === "zh" ? "en" : "zh"); if (bindToken) startBind(bindToken); }));
const bindToken = /(?:^#|&)bind=([0-9a-f]{48})/.exec(location.hash)?.[1];
if (bindToken) startBind(bindToken);
else startSite();
