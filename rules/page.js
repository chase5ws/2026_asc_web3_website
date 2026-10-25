/* 規則：兌換狀態、期間、上限、門檻 NFT、持有天數比例表、使用步驟 */
(function () {
    const A = window.ASC;
    const { $, L, E, esc, short, link, pct, date, TIERS, C } = A;
    const names = new Map();
    function tiers() {
        $("tiers").innerHTML = TIERS.map(([d, b]) => `<div class="tier"><b>${pct(b)}</b>${d === 0 ? L("mine.tier0") : L("mine.tierN", { d })}</div>`).join("");
    }
    async function render(s) {
        tiers();
        $("rOpen").innerHTML = s.open ? `<span class="chip on">${L("open")}</span>` : `<span class="chip off">${L("closed")}</span>`;
        $("rPeriod").textContent = `${date(s.periodStart)} ～ ${date(s.periodEnd)}`;
        $("rCap").textContent = L("r.capV", { p: pct(s.capBps) });
        $("rOwner").innerHTML = s.owner ? `${link(`address/${s.owner}`, short(s.owner))}${C.safe && s.owner.toLowerCase() === C.safe.toLowerCase() ? L("r.safe") : ""}` : "—";
        $("rVault").innerHTML = link(`address/${C.vault}`, short(C.vault));
        if (!s.gates.length) { $("gates").textContent = L("r.noGate"); return; }
        const rows = await Promise.all(s.gates.map(async (g) => {
            if (!names.has(g)) names.set(g, await new E.Contract(g, ["function name() view returns (string)"], A.provider).name().catch(() => "NFT"));
            return `<div class="kv"><span>${esc(names.get(g))}</span><b>${link(`address/${g}`, short(g))}</b></div>`;
        }));
        $("gates").innerHTML = rows.join("");
    }
    document.addEventListener("DOMContentLoaded", tiers);
    A.onLang(tiers);
    A.onUpdate((s) => render(s).catch(() => {}));
})();
