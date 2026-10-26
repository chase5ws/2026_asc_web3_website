/* ASC Token：行情（走勢圖）、買入、兌換、我的點數、轉出 */
(() => {
    const CH = window.ASCChain, U = window.ASCUI;
    const { C, E, read, write } = CH;
    const { S, D, $, t, el, esc, send, int, usdt, asc } = U;
    const P = { pts: null, loading: false, err: false };
    const value = () => (D.pool ? D.pool[5] : 0n); // 每 100 點的份額（USDT 最小單位）→ 每 1 點 = /100
    const per1 = () => (D.pool && D.pool[4] > 0n ? Number(value()) / 100 / 1e6 : Number(D.pool?.[10] || 0n) / 1e6);
    const fmt = (n, dp = 4) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: dp });

    /* ───── 走勢圖（SVG 階梯線） ───── */
    async function loadChart() {
        if (P.loading || P.pts) return;
        P.loading = true;
        try { P.pts = await window.ASCPrice.history(D.pool?.[10]); } catch (e) { console.warn("走勢", e); P.err = true; }
        P.loading = false;
        drawChart();
    }
    function drawChart() {
        const svg = $("tChart");
        const pts = (P.pts || []).slice();
        const nowV = Math.round(per1() * 1e6);
        if (pts.length) pts.push({ t: Math.floor(Date.now() / 1000), v: nowV });
        const sig = JSON.stringify([pts.length, pts[pts.length - 2]?.t, nowV, S.lang]);
        if (svg._sig === sig) return;
        svg._sig = sig;
        if (pts.length < 2) { svg.innerHTML = `<text x="400" y="115" text-anchor="middle">${esc(P.loading || !P.pts ? t("loading") : t("t.chartNone"))}</text>`; return; }
        const W = 800, H = 220, L = 52, R = 10, T = 14, B = 26;
        const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
        let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
        if (hi === lo) { hi += Math.max(1, hi * 0.05); lo = Math.max(0, lo - Math.max(1, lo * 0.05)); }
        const x = (tt) => L + ((tt - t0) / Math.max(1, t1 - t0)) * (W - L - R);
        const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
        let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t).toFixed(1)} V${y(pts[i].v).toFixed(1)}`;
        const area = `${d} V${H - B} H${L} Z`;
        const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#22355f" stroke-dasharray="3 4"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${(v / 1e6).toFixed(4)}</text>`).join("");
        const dfmt = (tt) => new Date(tt * 1000).toLocaleDateString(S.lang === "zh" ? "zh-TW" : "en-US", { month: "short", day: "numeric" });
        svg.innerHTML = `<defs><linearGradient id="tg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#d4af6a" stop-opacity=".35"/><stop offset="1" stop-color="#d4af6a" stop-opacity="0"/></linearGradient></defs>${ticks}<path d="${area}" fill="url(#tg)"/><path d="${d}" fill="none" stroke="#d4af6a" stroke-width="2"/><text x="${L}" y="${H - 8}">${dfmt(t0)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${dfmt(t1)}</text>`;
    }

    function renderPrice() {
        if (!D.ready) return;
        $("tValue").textContent = fmt(per1(), 6);
        $("tBuy").textContent = `${usdt(D.buyPrice, 4)} USDT`;
        $("tSupply").textContent = int(D.pool[4]);
        $("tPool").textContent = `${usdt(D.pool[3])} USDT`;
        $("tReserve").textContent = `${usdt(D.pool[1])} USDT`;
        $("fe1").textContent = `${Number(D.tax) / 100}%`;
        $("fe5").textContent = `${Number(D.mkt.fee) / 100}%`;
        const s = D.nftS;
        $("fe4").textContent = `${int(s[4])}・${int(s[5])}・${int(s[6])}・${int(D.vip.price)} ASC`;
        if (D.keep) {
            const parts = D.keep.map(([d, r], i) => (S.lang === "zh" ? (i === 0 ? `<${D.keep[1][0]} 天 ${r / 100}%` : `${d} 天 ${r / 100}%`) : i === 0 ? `<${D.keep[1][0]} days ${r / 100}%` : `${d}d ${r / 100}%`));
            $("fe2d").textContent = (S.lang === "zh" ? "依持有天數：" : "By holding time: ") + parts.join(S.lang === "zh" ? "、" : ", ");
        }
        loadChart();
        drawChart();
    }

    /* ───── 買入 ───── */
    const parseUsdt = (s) => { try { const v = E.parseUnits((s || "").trim() || "0", 6); return v > 0n ? v : 0n; } catch (_) { return -1n; } };
    const parseInt0 = (s) => (/^\d+$/.test((s || "").trim()) ? BigInt(s.trim()) : (s || "").trim() === "" ? 0n : -1n);
    let pv = { buy: null, ex: null };
    async function previewBuy() {
        const v = parseUsdt($("tIn").value);
        if (v <= 0n) { $("tGet").textContent = "–"; return; }
        const key = String(v);
        pv.buy = key;
        const pts = await read.vault.previewDeposit(v).catch(() => null);
        if (pv.buy === key) $("tGet").textContent = pts == null ? "–" : asc(pts);
    }
    async function previewEx() {
        const v = parseInt0($("tEx").value);
        if (v <= 0n) { $("tBack").textContent = "–"; return; }
        const key = String(v);
        pv.ex = key;
        const r = await read.vault.previewExchange(CH.account || U.DEAD, v).catch(() => null);
        if (pv.ex === key) $("tBack").textContent = r == null ? "–" : `${usdt(r.get)} USDT`;
    }
    function renderTrade() {
        if (!D.ready) return;
        $("tUsdtBal").textContent = CH.account ? usdt(D.usdt) : "–";
        $("tAscBal").textContent = CH.account ? int(D.asc) : "–";
        const st = D.status;
        let cap = "";
        if (st && st[3] > 0n) { const left = st[3] > st[2] ? st[3] - st[2] : 0n; cap = t("t.depCap", { x: usdt(left) }); }
        $("tDepCap").textContent = cap;
        const v = parseUsdt($("tIn").value);
        $("bBuy").disabled = !CH.account || v <= 0n || v > D.usdt || !D.depositOpen || D.shutdown;
        const open = D.pool[9] === 1n || D.shutdown;
        const me = D.me;
        $("tKeep").textContent = !open ? t("t.closed") : st?.flagged ? t("t.flagged", { p: (10000 - Number(D.flagPct)) / 100 }) : CH.account ? t("t.keep", { d: int(me[1]), p: Number(me[2]) / 100 }) : "";
        const ex = parseInt0($("tEx").value);
        $("bEx").disabled = !CH.account || !open || ex <= 0n || ex > D.asc;
    }
    $("tIn").addEventListener("input", () => { previewBuy(); renderTrade(); });
    $("tEx").addEventListener("input", () => { previewEx(); renderTrade(); });
    $("tMax").onclick = () => { $("tEx").value = String(D.asc || 0n); previewEx(); renderTrade(); };
    $("bBuy").onclick = () => {
        const v = parseUsdt($("tIn").value);
        send($("mBuyAsc"), $("bBuy"), async (step) => {
            await CH.approve("usdt", C.vault, v, (k, h) => step(k === "approve" ? "approve" : "pending", k === "approve" ? "USDT" : h));
            return (await write("vault")).deposit(v);
        }).then((r) => { if (r) { $("tIn").value = ""; $("tGet").textContent = "–"; } });
    };
    $("bEx").onclick = () => {
        const v = parseInt0($("tEx").value);
        send($("mEx"), $("bEx"), async () => (await write("vault")).exchange(v)).then((r) => { if (r) { $("tEx").value = ""; $("tBack").textContent = "–"; } });
    };

    /* ───── 我的點數＋轉出 ───── */
    function renderMine() {
        if (!D.ready) return;
        const me = D.me, a = !!CH.account;
        $("tHold").textContent = a ? asc(me[0]) : "–";
        $("tRatio").textContent = a ? `${Number(me[2]) / 100}%` : "–";
        $("tDays").textContent = a ? int(me[1]) : "–";
        $("tAll").textContent = a ? `${usdt(me[5])} USDT` : "–";
        $("tCap").textContent = a ? `${usdt(me[3])} USDT` : "–";
        $("tLeft").textContent = a ? `${usdt(me[4])} USDT` : "–";
        const lad = $("tLadder");
        const sig = JSON.stringify([D.keep, a ? Number(me[1]) : -1, S.lang]);
        if (lad._sig !== sig && D.keep) {
            lad._sig = sig;
            const days = a ? Number(me[1]) : -1;
            let on = -1;
            D.keep.forEach(([d], i) => { if (days >= d) on = i; });
            lad.innerHTML = D.keep.map(([d, r], i) => `<div class="${i === on ? "on" : ""}"><b>${r / 100}%</b>${i === 0 ? "0+" : d + "+"}${S.lang === "zh" ? " 天" : "d"}</div>`).join("");
        }
        $("tFlag").textContent = D.status?.flagged ? t("t.flagged", { p: (10000 - Number(D.flagPct)) / 100 }) : "";
        $("tFlag").classList.toggle("hidden", !D.status?.flagged);
        const amt = parseInt0($("tAmt").value);
        const tax = amt > 0n ? (amt * D.tax + 9999n) / 10000n : 0n;
        $("tRecv").textContent = amt > 0n ? asc(amt - (tax > amt ? amt : tax)) : "–";
        $("tTax").textContent = t("t.tax", { p: Number(D.tax) / 100 });
        const to = $("tTo").value.trim();
        $("bSend").disabled = !a || amt <= 0n || amt > D.asc || !E.isAddress(to) || D.pool[9] !== 1n;
    }
    ["tAmt", "tTo"].forEach((id) => $(id).addEventListener("input", renderMine));
    $("bSend").onclick = () => {
        const to = E.getAddress($("tTo").value.trim()), amt = parseInt0($("tAmt").value);
        send($("mSend"), $("bSend"), async () => (await write("vault")).transfer(to, amt)).then((r) => { if (r) $("tAmt").value = ""; });
    };

    U.renderers.push(() => { if (S.page === "tok" && S.tok === "price") renderPrice(); });
    U.renderers.push(() => { if (S.page === "tok" && S.tok === "trade") renderTrade(); });
    U.renderers.push(() => { if (S.page === "tok" && S.tok === "mine") renderMine(); });
})();
