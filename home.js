/* 首頁：即時幣值（大字）＋ 兩邊池子與走勢圖 ＋ 數據 ＋ 前往其他頁 */
(function () {
    const A = window.ASC;
    const { $, L, E, esc, num, date } = A;
    let selected = 0;
    let hist = new Map();
    const live = new Map();
    const lastPrice = new Map();

    function renderTabs(s) {
        $("tokenTabs").innerHTML = s.tokens.length > 1 ? s.tokens.map((t, i) => `<button data-tok="${i}" class="${i === selected ? "on" : ""}">${esc(t.symbol)}</button>`).join("") : "";
        document.querySelectorAll("[data-tok]").forEach((b) => (b.onclick = () => { selected = Number(b.dataset.tok); render(A.state); }));
    }

    function flash(el, cls) {
        el.classList.remove("up", "down");
        if (cls) { el.classList.add(cls); setTimeout(() => el.classList.remove("up", "down"), 2500); }
    }

    function render(s) {
        if (!s) return;
        if (selected >= s.tokens.length) selected = 0;
        renderTabs(s);
        const t = s.tokens[selected];
        const supply = s.supply;
        $("mSupply").textContent = `${supply.toLocaleString()} ASC`;
        $("mIssued").textContent = L("m.issuedTotal", { n: s.issued.toLocaleString() });
        $("mIssued2").textContent = `${s.issued.toLocaleString()} ASC`;
        $("mBurned").textContent = `${(s.issued - supply).toLocaleString()} ASC`;
        $("tankAsc").style.height = `${s.issued > 0n ? Number((supply * 100n) / s.issued) : 0}%`;
        $("sSupply").textContent = supply.toLocaleString();
        $("sOpen").innerHTML = s.open ? `<span class="ok">${L("open")}</span>` : `<span class="warn">${L("closed")}</span>`;
        $("sEnd").textContent = date(s.periodEnd);
        if (!t) {
            $("mPrice").textContent = $("hPrice").textContent = "—";
            $("m100").textContent = L("m.noToken");
            $("sPool").textContent = "—";
            return;
        }
        $("mSym").textContent = $("tName").textContent = t.symbol;
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
        const txt = price.toLocaleString("en-US", { maximumFractionDigits: 6 });
        $("mPrice").textContent = `${txt} ${t.symbol}`;
        $("hPrice").textContent = txt;
        $("hUnit").textContent = L("home.unit", { sym: t.symbol });
        const dir = prev !== undefined && price !== prev ? (price > prev ? "up" : "down") : "";
        flash($("mPrice"), dir);
        flash($("hPrice"), dir);
        lastPrice.set(k, price);

        const now = Math.floor(Date.now() / 1000);
        if (!live.has(k)) live.set(k, []);
        const lv = live.get(k);
        if (!lv.length || lv[lv.length - 1].p !== price || now - lv[lv.length - 1].t > 300) lv.push({ t: now, p: price });
        const pts = [...(hist.get(k) ?? []), ...lv];
        const dayAgo = [...pts].reverse().find((x) => x.t <= now - 86400) ?? pts[0];
        let delta = " ", cls = "delta";
        if (dayAgo && dayAgo.p > 0) {
            const ch = ((price - dayAgo.p) / dayAgo.p) * 100;
            cls = "delta " + (ch > 0 ? "up" : ch < 0 ? "down" : "");
            delta = `${ch > 0 ? "▲" : ch < 0 ? "▼" : "■"} ${Math.abs(ch).toFixed(2)}% (${dayAgo.t <= now - 86400 ? L("m.day") : L("m.since")})`;
        }
        for (const id of ["mDelta", "hDelta"]) { $(id).className = cls + (id === "hDelta" ? " reveal d2 in" : ""); $(id).textContent = delta; }
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
        let d = `M${X(pts[0].t)},${Y(pts[0].p)}`; // 階梯線：幣值只在交易發生時改變
        for (let i = 1; i < pts.length; i++) d += `H${X(pts[i].t)}V${Y(pts[i].p)}`;
        const grid = [0.25, 0.5, 0.75].map((f) => `<line class="gd" x1="0" x2="${W}" y1="${P + f * (H - 2 * P)}" y2="${P + f * (H - 2 * P)}"/>`).join("");
        const last = pts[pts.length - 1];
        svg.innerHTML = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0313f" stop-opacity=".35"/><stop offset="1" stop-color="#3d8bff" stop-opacity="0"/></linearGradient></defs>
${grid}<path class="ar" d="${d}V${H - P}H${X(t0)}Z"/><path class="ln" d="${d}"/><circle cx="${X(last.t)}" cy="${Y(last.p)}" r="4" fill="#ff5c63"><animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite"/></circle>`;
        $("cFrom").textContent = date(t0);
        $("cTo").textContent = L("m.now");
        $("cInfo").textContent = L("m.hilo", { hi: hi.toPrecision(4), lo: lo.toPrecision(4) });
    }

    A.onUpdate(render);
    let histStarted = false;
    A.onUpdate(() => {
        if (histStarted) return;
        histStarted = true;
        A.loadHistory().then((h) => { hist = h; render(A.state); }).catch(() => {});
    });
})();
