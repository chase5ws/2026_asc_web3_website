/* 共用：狀態、分頁、語言、錢包列、讀鏈資料、送交易的訊息 */
(() => {
    const CH = window.ASCChain, LK = window.ASCLook;
    const { C, E, read } = CH;
    const T = window.ASC_T, N = window.ASC_NAMES;
    const $ = (id) => document.getElementById(id);
    const $$ = (q, root = document) => [...root.querySelectorAll(q)];
    const DEAD = "0x000000000000000000000000000000000000dEaD";
    const store = { get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };

    const S = { lang: store.get("asc-lang") || (/^zh/i.test(navigator.language || "zh") ? "zh" : "en"), page: "home", nft: "mint", tok: "price", mt: "mint", tr: "buy", eq: "mine", open: {} };
    const D = { ready: false, pool: null, me: null, status: null, nftS: null, nftMe: null, vip: null, mkt: null, usdt: 0n, asc: 0n, bag: {}, ids: [], listings: [], prizes: [], miss: 0, keep: null, tax: 3300n, flagPct: 9500n };
    const renderers = [];

    /* ───── 文字 ───── */
    function t(key, vars) {
        let s = T[S.lang][key] ?? T.zh[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
    }
    const baseName = (n) => n.replace(/\d+$/, "");
    function partName(p) {
        if (!p) return "";
        const num = (p.name.match(/(\d+)$/) || [])[1];
        if (S.lang === "zh") {
            if (p.zh) return p.zh;
            const b = N.base[baseName(p.name)];
            if (b) return num != null && b !== "不戴" ? `${b} ${Number(num) + 1}` : b;
        }
        return p.name;
    }
    const optName = (opt, slot) => (opt?.file ? partName(LK.L.byPid[slot * 256 + LK.L.cats[slot].options.indexOf(opt)]) : S.lang === "zh" ? "不穿" : "None");
    const slotName = (cat) => N.slots[S.lang][cat] || cat;
    const tierTag = (tier) => `<span class="rk ${tier}">${N.tiers[S.lang][tier] || tier}</span>`;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const el = (h) => { const x = document.createElement("template"); x.innerHTML = h.trim(); return x.content.firstChild; };

    /* ───── 數字 ───── */
    const usdt = (v, dp = 2) => {
        const n = Number(E.formatUnits(v ?? 0n, 6));
        return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: Math.max(dp, n !== 0 && Math.abs(n) < 0.01 ? 6 : dp) });
    };
    const int = (v) => Number(v ?? 0).toLocaleString("en-US");
    const date = (sec) => new Date(Number(sec) * 1000).toLocaleDateString(S.lang === "zh" ? "zh-TW" : "en-US", { year: "numeric", month: "short", day: "numeric" });
    const asc = (v) => `${int(v)} ASC`;
    const fee = (v) => (BigInt(v ?? 0) === 0n ? t("n.free") : asc(v));

    /* ───── 配件卡片 ───── */
    function tile(p, extra = "", onClick, on, cls = "") {
        const n = el(`<button type="button" class="tile${on ? " on" : ""} ${cls}"><img src="${p.thumb}" alt="" loading="lazy"><span>${esc(partName(p))}</span>${tierTag(p.tier)}${extra}</button>`);
        if (onClick) n.onclick = onClick;
        else n.disabled = false;
        return n;
    }

    /* ───── 交易：訊息、授權、錯誤 ───── */
    function errText(x) {
        if (x.code) return t("e." + x.code, { m: x.msg || "" });
        const args = (x.args ? [...x.args] : []).map((a) => (typeof a === "bigint" ? (x.name === "OverDepositCap" ? usdt(a) : int(a)) : a));
        const vars = Object.fromEntries(args.map((a, i) => [i, a]));
        const key = "e." + x.name;
        return T[S.lang][key] ? t(key, vars) : `${x.name}`;
    }
    function say(box, text, kind, hash) {
        if (!box) return;
        box.className = "msg" + (kind ? " " + kind : "");
        box.textContent = text;
        if (hash) {
            const a = document.createElement("a");
            a.href = CH.link("tx", hash); a.target = "_blank"; a.rel = "noopener"; a.textContent = t("tx.view");
            box.appendChild(a);
        }
    }
    let busy = false;
    /** fn(step) 回傳交易（或 null）；step("approve", 代幣名) 顯示授權步驟 */
    async function send(box, btn, fn) {
        if (busy) return null;
        busy = true;
        const btns = [btn].flat().filter(Boolean);
        btns.forEach((b) => (b.disabled = true));
        try {
            if (!CH.account) await CH.connect();
            say(box, t("tx.wallet"));
            const onStep = (kind, x) => (kind === "approve" ? say(box, t("tx.approve", { t: x })) : say(box, t("tx.pending"), "", x));
            const tx = await fn(onStep);
            let receipt = null;
            if (tx) {
                say(box, t("tx.pending"), "", tx.hash);
                receipt = await tx.wait();
                if (!receipt || receipt.status !== 1) throw new Error("reverted");
                say(box, t("tx.done"), "ok", tx.hash);
            }
            await refresh();
            return receipt;
        } catch (e) {
            console.warn(e);
            say(box, errText(CH.explain(e)), "bad");
            return null;
        } finally {
            busy = false;
            btns.forEach((b) => (b.disabled = false));
            draw();
        }
    }
    /** 費用 ASC：NFT 合約用 burnFrom 收費，要先授權（0 就不用） */
    async function payAsc(spender, amount, step) {
        amount = BigInt(amount);
        if (amount > (D.asc ?? 0n)) { const e = new Error("NotEnoughPoints"); e.revert = { name: "NotEnoughPoints", args: [D.asc] }; throw e; }
        return CH.approve("vault", spender, amount, (k, h) => step(k === "approve" ? "approve" : "pending", k === "approve" ? "ASC" : h));
    }

    /* ───── 讀鏈 ───── */
    let loading = null;
    async function refresh() {
        if (loading) return loading;
        loading = (async () => {
            const who = CH.account || DEAD;
            const [vi, st, ni, vipPrice, vipDays, gp, fee, flagFee, maxTrade, tax, flagPct, keepDays, keepRates, depositOpen, shutdown, verifiedOnly, buyP] = await Promise.all([
                read.vault.info(who), read.vault.userStatus(who), read.nft.info(who), read.nft.vipPrice(), read.nft.vipDays(), read.nft.gachaPool(),
                read.market.feeBps(), read.market.flagFeeBps(), read.market.maxTradeValue(), read.vault.transferTaxBps(), read.vault.flagPenaltyBps(),
                Promise.all([...Array(8).keys()].map((i) => read.vault.keepDays(i))), Promise.all([...Array(8).keys()].map((i) => read.vault.keepRates(i))),
                read.vault.depositOpen(), read.vault.shutdown(), read.vault.verifiedOnly(), read.vault.buyPrice()
            ]);
            Object.assign(D, {
                pool: vi.pool, me: vi.me, status: st, nftS: ni.s, nftMe: ni.me, vip: { price: vipPrice, days: vipDays },
                prizes: gp.prizes.map((p) => ({ pid: Number(p.partId), w: Number(p.weight) })), miss: Number(gp.miss),
                mkt: { fee, flagFee, maxTrade }, tax, flagPct, keep: keepDays.map((d, i) => [Number(d), Number(keepRates[i])]),
                depositOpen, shutdown, verifiedOnly, buyPrice: buyP
            });
            if (!LK.L.traits) await LK.loadTraits();
            const n = Number(await read.market.listingCount());
            const lists = [];
            for (let a = 0; a < n; a += 200) lists.push(...(await read.market.listings(a, 200)).map((l, i) => ({ id: a + i, seller: l.seller, pid: Number(l.id), left: l.remaining, price: l.unitPrice, active: l.active })));
            D.listings = lists.filter((l) => l.active);
            if (CH.account) {
                const pids = LK.L.parts.map((p) => p.pid);
                const [u, bal, ids] = await Promise.all([
                    read.usdt.balanceOf(CH.account), read.parts.balancesOf(CH.account, pids),
                    Promise.all([...Array(Number(ni.me[3])).keys()].map((i) => read.nft.tokenOfOwnerByIndex(CH.account, i)))
                ]);
                D.usdt = u;
                D.asc = vi.me[0];
                D.bag = Object.fromEntries(pids.map((p, i) => [p, Number(bal[i])]).filter(([, q]) => q > 0));
                D.ids = ids.map(Number).sort((a, b) => a - b);
            } else Object.assign(D, { usdt: 0n, asc: 0n, bag: {}, ids: [] });
            await LK.sync().catch((e) => console.warn("外觀同步", e));
            D.ready = true;
        })().catch((e) => console.warn("讀鏈失敗", e)).finally(() => { loading = null; draw(); });
        return loading;
    }

    /* ───── 畫面 ───── */
    function applyText() {
        document.documentElement.lang = S.lang === "zh" ? "zh-Hant" : "en";
        $$("[data-t]").forEach((x) => { const v = T[S.lang][x.dataset.t]; if (typeof v === "string") x.textContent = v; });
        $("langSw").classList.toggle("right", S.lang === "en");
        $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    }
    const narrow = () => matchMedia("(max-width:860px)").matches;
    function chips() {
        const a = CH.account;
        $$(".conn").forEach((c) => c.classList.toggle("hidden", !a));
        $$(".needwallet").forEach((c) => c.classList.toggle("hidden", !!a));
        const ct = $("connectText");
        ct.textContent = a ? (narrow() ? CH.short(a).replace("…", "…") : `${CH.short(a)}`) : t("connect");
        $("connect").classList.toggle("on", !!a);
        if (!a || !D.status) return;
        const v = $("chVer");
        v.className = "chip " + (D.status.flagged ? "bad" : D.status.verified ? "" : "warn");
        v.innerHTML = `<span data-t="c.vault">${esc(t("c.vault"))}</span> <b>${esc(D.status.flagged ? t("c.flagged") : D.status.verified ? t("c.verified") : t("c.unverified"))}</b>`;
        const until = Number(D.nftMe?.[1] || 0);
        const vip = until > Date.now() / 1000;
        $("chVip").className = "chip " + (vip ? "" : "warn");
        $("chVip").innerHTML = `<b>${esc(vip ? t("c.vipOn", { d: date(until) }) : t("c.vipOff"))}</b>`;
        $("chAllow").textContent = int(D.nftMe?.[0] || 0);
        $("chAsc").textContent = int(D.asc);
    }
    function layout() {
        $("sw3").className = "sw3 p-" + S.page;
        $$("[data-go]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.go === S.page)));
        if (narrow()) { $$('#sw3 [data-go="nft"]').forEach((b) => (b.textContent = t("nav.nftS"))); $$('#sw3 [data-go="tok"]').forEach((b) => (b.textContent = t("nav.tokS"))); }
        $$("[data-subs]").forEach((g) => g.classList.toggle("hidden", g.dataset.subs !== S.page));
        $$("[data-page]").forEach((p) => p.classList.toggle("hidden", p.dataset.page !== S.page));
        $$('[data-subs="nft"] .sub').forEach((b) => b.classList.toggle("on", S.page === "nft" && b.dataset.sub === S.nft));
        $$('[data-subs="tok"] .sub').forEach((b) => b.classList.toggle("on", S.page === "tok" && b.dataset.sub === S.tok));
        $$('[data-page="nft"] [data-part]').forEach((p) => p.classList.toggle("hidden", p.dataset.part !== S.nft));
        $$('[data-page="tok"] [data-part]').forEach((p) => p.classList.toggle("hidden", p.dataset.part !== S.tok));
        $("nftTitle").textContent = t("n.title." + S.nft);
        $("tokTitle").textContent = t("t.title." + S.tok);
        $("nftOver").classList.toggle("hidden", S.nft !== "mint");
        for (const [sw, key, attr, right, pane] of [["mtSw", "mt", "data-mt", "reveal", "data-mtp"], ["trSw", "tr", "data-tr", "redeem", "data-trp"], ["eqSw", "eq", "data-eq", "gacha", null]]) {
            $(sw).classList.toggle("right", S[key] === right);
            $$(`[${attr}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute(attr) === S[key])));
            if (pane) $$(`[${pane}]`).forEach((p) => p.classList.toggle("hidden", p.getAttribute(pane) !== S[key]));
        }
        $("eqMine").classList.toggle("hidden", S.eq !== "mine");
        $("eqGacha").classList.toggle("hidden", S.eq !== "gacha");
    }
    function chapters() {
        const box = $("chaps");
        box.innerHTML = "";
        window.ASC_STORY[S.lang].forEach((c, i) => {
            const art = el(`<article class="chap"><div class="pics ${c.img.length > 1 ? "four" : "one"}"></div><span class="tag"></span><h3></h3><div class="txt${S.open[i] ? "" : " short"}"></div><button type="button"></button></article>`);
            c.img.forEach((n) => { const im = document.createElement("img"); im.src = `./assets/${n}`; im.alt = c.title; im.loading = "lazy"; art.querySelector(".pics").appendChild(im); });
            art.querySelector(".tag").textContent = c.tag;
            art.querySelector("h3").textContent = c.title;
            c.text.forEach((x) => { const p = document.createElement("p"); p.textContent = x; art.querySelector(".txt").appendChild(p); });
            const b = art.querySelector("button");
            b.textContent = t(S.open[i] ? "st.less" : "st.more");
            b.onclick = () => { S.open[i] = !S.open[i]; chapters(); };
            box.appendChild(art);
        });
    }
    function foot() {
        $("foot").innerHTML = [["ASC", C.vault], ["NFT", C.nft], [S.lang === "zh" ? "配件" : "Parts", C.parts], [S.lang === "zh" ? "市場" : "Market", C.market], ["Safe", C.safe]]
            .map(([n, a]) => `<a href="${CH.link("address", a)}" target="_blank" rel="noopener">${esc(n)} ${CH.short(a)}</a>`).join("") + `<span>Polygon · chainId ${C.chainId}</span>`;
    }
    let lastLang = null;
    function draw() {
        applyText();
        layout();
        chips();
        if (lastLang !== S.lang) { chapters(); foot(); lastLang = S.lang; }
        for (const r of renderers) { try { r(); } catch (e) { console.error(e); } }
    }

    /* ───── 分頁（網址 #nft/equip、#tok/trade） ───── */
    function go(page, sub, push = true) {
        S.page = page;
        if (sub && page !== "home") S[page] = sub;
        if (push) history.replaceState(null, "", page === "home" ? location.pathname + location.search : `#${page}/${S[page]}`);
        draw();
    }
    function fromHash() {
        const h = location.hash.slice(1);
        if (h.startsWith("bind=")) { location.replace("./bind/" + location.hash); return; }
        const [p, s] = h.split("/");
        if (p === "nft" || p === "tok") go(p, s, false);
        else if (p === "home") go("home", null, false);
    }
    $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
    $$("[data-subs] .sub").forEach((b) => (b.onclick = () => go(b.parentElement.dataset.subs, b.dataset.sub)));
    $$("[data-jump]").forEach((b) => (b.onclick = () => { const [p, s] = b.dataset.jump.split(":"); go(p, s); window.scrollTo(0, 0); }));
    $$("[data-lang]").forEach((b) => (b.onclick = () => { S.lang = b.dataset.lang; store.set("asc-lang", S.lang); draw(); }));
    $$("[data-mt]").forEach((b) => (b.onclick = () => { S.mt = b.dataset.mt; draw(); }));
    $$("[data-tr]").forEach((b) => (b.onclick = () => { S.tr = b.dataset.tr; draw(); }));
    $$("[data-eq]").forEach((b) => (b.onclick = () => { S.eq = b.dataset.eq; draw(); }));
    $("connect").onclick = async () => {
        if (CH.account) { window.open(CH.link("address", CH.account), "_blank", "noopener"); return; }
        $("connectText").textContent = t("connecting");
        try { await CH.connect(); } catch (e) { const x = CH.explain(e); if (x.code !== "REJECTED") alertBox(errText(x)); }
        draw();
    };
    function alertBox(text) {
        let n = $("toast");
        if (!n) { n = el(`<div id="toast" class="note warn" style="position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:20;max-width:min(520px,92vw)"></div>`); document.body.appendChild(n); }
        n.textContent = text;
        n.hidden = false;
        clearTimeout(n._t);
        n._t = setTimeout(() => (n.hidden = true), 6000);
    }
    addEventListener("hashchange", fromHash);
    addEventListener("resize", () => draw());
    CH.onAccount(() => { draw(); refresh(); });

    window.ASCUI = { S, D, $, $$, t, el, esc, say, send, payAsc, refresh, draw, go, tile, partName, optName, slotName, tierTag, usdt, int, asc, fee, date, errText, renderers, DEAD, alertBox };

    // 啟動（等其他檔案註冊好畫面再畫）
    addEventListener("DOMContentLoaded", async () => {
        fromHash();
        draw();
        await CH.silent();
        await refresh();
        setInterval(() => { if (!document.hidden) refresh(); }, (C.refreshSeconds || 20) * 1000);
    });
})();
