/* 我的錢包：持有 ASC、持有天數與比例、兌換、轉 ASC */
(function () {
    const A = window.ASC;
    const { $, L, E, C, esc, say, short, link, num, tenth, pct, date, unitOf, TIERS } = A;
    let selected = 0;

    function previewFor(s, t, p) {
        if (!t || s.supply === 0n || p <= 0n) return null;
        const share = (t.available * p) / s.supply;
        const raw = (share * BigInt(s.keepBps)) / 10000n;
        const get = raw - (raw % unitOf(t.decimals));
        return { share, get, fee: share - get };
    }

    function render(s) {
        if (!s || !A.account) return;
        $("mineLocked").hidden = true;
        $("mineTop").hidden = false;
        $("actions").hidden = false;
        if (selected >= s.tokens.length) selected = 0;
        const t = s.tokens[selected];
        $("myAsc").textContent = `${s.points.toLocaleString()} ASC`;
        $("myAddr").innerHTML = link(`address/${A.account}`, short(A.account));
        $("myDays").textContent = s.points > 0n ? s.days : 0;
        $("myKeep").textContent = pct(s.keepBps);
        const next = TIERS.find(([d]) => d > s.days);
        const cur = [...TIERS].reverse().find(([d]) => d <= s.days) ?? TIERS[0];
        $("myProg").style.width = next ? `${((s.days - cur[0]) / (next[0] - cur[0])) * 100}%` : "100%";
        $("myNext").textContent = s.points === 0n ? L("mine.none") : next ? L("mine.next", { d: next[0] - s.days, p: pct(next[1]) }) : L("mine.max");
        $("tiers").innerHTML = TIERS.map(([d, b]) => `<div class="tier ${d === cur[0] ? "now" : d < cur[0] ? "done" : ""}"><b>${pct(b)}</b>${d === 0 ? L("mine.tier0") : L("mine.tierN", { d })}</div>`).join("");
        $("myAll").textContent = t ? `${tenth(t.all, t.decimals)} ${t.symbol}` : "—";
        $("myLeft").textContent = t ? L("mine.left", { v: `${num(t.left, t.decimals)} ${t.symbol}`, date: date(s.periodEnd) }) : "";
        $("gateWarn").hidden = s.gateOk;
        if (!s.gateOk) $("gateWarn").textContent = L("mine.gate");
        $("exToken").innerHTML = s.tokens.map((x, i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${esc(x.symbol)}</option>`).join("");
        updatePreview();
        updateTransfer();
    }

    function updatePreview() {
        const s = A.state;
        const t = s?.tokens[selected];
        const raw = $("exPoints").value.trim();
        const box = $("exPreview");
        const go = $("exGo");
        go.disabled = true;
        go.textContent = L("ex.title");
        if (!s) return;
        if (!t) { box.innerHTML = `<span class="muted small">${L("ex.noToken")}</span>`; return; }
        if (!/^\d+$/.test(raw) || raw === "0") { box.innerHTML = `<span class="muted small">${L("ex.enter", { n: s.points.toLocaleString() })}</span>`; return; }
        const p = BigInt(raw);
        const r = previewFor(s, t, p);
        const problems = [];
        if (!s.open) problems.push(L("ex.pClosed"));
        if (!s.gateOk) problems.push(L("ex.pGate"));
        if (p > s.points) problems.push(L("ex.pPoints", { n: s.points }));
        if (r && r.get === 0n) problems.push(L("ex.pSmall"));
        if (r && r.get > t.left) problems.push(L("ex.pCap", { v: num(t.left, t.decimals) }));
        box.innerHTML = r ? `<div class="kv"><span>${L("ex.share")}</span><b>${num(r.share, t.decimals)} ${esc(t.symbol)}</b></div>
<div class="kv"><span>${L("ex.keep", { p: pct(s.keepBps) })}</span><b class="${problems.length ? "" : "ok"}">${num(r.get, t.decimals, 1)} ${esc(t.symbol)}</b></div>
<div class="kv"><span>${L("ex.fee")}</span><b>${num(r.fee, t.decimals)}</b></div>
${problems.length ? `<div class="warn small">${problems.join("・")}</div>` : `<div class="small muted">${L("ex.note")}</div>`}` : "";
        go.disabled = !!problems.length || !r;
        if (r && !problems.length) go.textContent = L("ex.go", { p, v: `${num(r.get, t.decimals, 1)} ${t.symbol}` });
    }

    /** 最少＝剛好換得到 0.1；本期最多＝不超過本期上限；全部＝所有 ASC（二分搜尋） */
    function fill(kind) {
        const s = A.state;
        const t = s?.tokens[selected];
        if (!t || s.points === 0n) return;
        let p = s.points;
        if (kind !== "all") {
            let lo = 1n, hi = s.points, ans = null;
            while (lo <= hi) {
                const mid = (lo + hi) / 2n;
                const r = previewFor(s, t, mid);
                const ok = kind === "min" ? r && r.get > 0n : r && r.get <= t.left;
                if (ok) { ans = mid; if (kind === "min") hi = mid - 1n; else lo = mid + 1n; }
                else if (kind === "min") lo = mid + 1n; else hi = mid - 1n;
            }
            if (ans === null) return say($("exMsg"), kind === "min" ? L("ex.fillMin") : L("ex.fillMax"), "warn");
            p = ans;
        }
        $("exPoints").value = String(p);
        updatePreview();
    }

    function updateTransfer() {
        const s = A.state;
        if (!s || !A.account) return;
        const to = $("txTo").value.trim();
        const amt = $("txAmt").value.trim();
        let problem = "";
        if (!s.open) problem = L("tx.closed");
        else if (to && !E.isAddress(to)) problem = L("tx.bad");
        else if (to && E.getAddress(to) === E.getAddress(A.account)) problem = L("tx.self");
        else if (to && E.getAddress(to) === E.getAddress(C.vault)) problem = L("tx.vault");
        else if (amt && (!/^\d+$/.test(amt) || amt === "0")) problem = L("tx.int");
        else if (amt && BigInt(amt) > s.points) problem = L("ex.pPoints", { n: s.points });
        $("txGo").disabled = !!problem || !to || !amt;
        if (problem) say($("txMsg"), problem, "warn");
        else if ($("txMsg").classList.contains("warn")) say($("txMsg"), "");
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("connect2").onclick = () => A.connect().catch((e) => say($("exMsg"), e?.message || String(e), "err"));
        $("exToken").onchange = () => { selected = Number($("exToken").value); render(A.state); };
        $("exPoints").oninput = updatePreview;
        document.querySelectorAll("[data-fill]").forEach((b) => (b.onclick = () => fill(b.dataset.fill)));
        $("exGo").onclick = () => {
            const t = A.state.tokens[selected];
            const p = BigInt($("exPoints").value);
            A.sendTx($("exMsg"), L("ex.title"), (c) => c.exchange(t.address, p));
        };
        $("txTo").oninput = $("txAmt").oninput = updateTransfer;
        $("txGo").onclick = () => {
            const to = E.getAddress($("txTo").value.trim());
            if (!confirm(L("tx.confirm", { n: $("txAmt").value, to }))) return;
            A.sendTx($("txMsg"), L("tx.title"), (c) => c.transfer(to, BigInt($("txAmt").value)));
        };
    });
    A.onUpdate(render);
})();
