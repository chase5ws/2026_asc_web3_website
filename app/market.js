/* 配件市場：掛單列表、購買、上架、下架 */
(() => {
    const CH = window.ASCChain, LK = window.ASCLook, U = window.ASCUI;
    const { C, write, read } = CH;
    const { S, D, $, t, el, esc, send, int, tierTag, partName, slotName } = U;
    const M = { cat: "all" };
    const same = (box, sig) => { if (box._sig === sig) return true; box._sig = sig; return false; };
    const me = () => CH.account?.toLowerCase();
    const feeOf = (seller) => (seller && D.status?.flagged && seller.toLowerCase() === me() ? D.mkt.flagFee : D.mkt.fee);

    async function buy(l, btn) {
        const qty = BigInt(Math.max(1, Math.min(Number(btn.closest(".lot").querySelector("select")?.value || 1), Number(l.left))));
        const paid = qty * l.price;
        await send($("mBuy"), btn, async (step) => {
            await CH.approve("vault", C.market, paid, (k, h) => step(k === "approve" ? "approve" : "pending", k === "approve" ? "ASC" : h));
            return (await write("market")).buy(l.id, qty, l.price);
        });
    }
    function render() {
        if (!D.ready) return;
        const cats = $("mkCats");
        if (!same(cats, JSON.stringify([M.cat, S.lang, LK.L.cats.length]))) {
            cats.innerHTML = "";
            ["all", ...LK.L.cats.map((c) => c.trait_type)].forEach((c) => {
                const b = el(`<button type="button" class="${M.cat === c ? "on" : ""}">${esc(c === "all" ? t("m.all") : slotName(c))}</button>`);
                b.onclick = () => { M.cat = c; render(); };
                cats.appendChild(b);
            });
        }
        const sort = $("mkSort").value;
        const lots = D.listings.filter((l) => LK.L.byPid[l.pid] && (M.cat === "all" || LK.L.byPid[l.pid].cat === M.cat))
            .sort((a, b) => (sort === "low" ? (a.price < b.price ? -1 : a.price > b.price ? 1 : a.id - b.id) : a.price > b.price ? -1 : a.price < b.price ? 1 : a.id - b.id));
        const list = $("mkList");
        if (!same(list, JSON.stringify([lots.map((l) => [l.id, String(l.left), String(l.price)]), S.lang, me()]))) {
            list.innerHTML = "";
            if (!lots.length) list.appendChild(el(`<p class="muted">${esc(t("m.empty"))}</p>`));
            for (const l of lots) {
                const p = LK.L.byPid[l.pid];
                const mine = l.seller.toLowerCase() === me();
                const qtyOpts = [...Array(Math.min(Number(l.left), 20)).keys()].map((i) => `<option>${i + 1}</option>`).join("");
                const n = el(`<div class="lot${mine ? " self" : ""}"><img src="${p.thumb}" alt="" loading="lazy"><span class="nm">${esc(partName(p))}</span><span class="meta">${tierTag(p.tier)}<span>${esc(slotName(p.cat))}</span></span><span class="meta"><a class="ext" href="${CH.link("address", l.seller)}" target="_blank" rel="noopener">${mine ? esc(t("m.you")) : CH.short(l.seller)}</a><span>${esc(t("m.left"))} ${int(l.left)}</span></span><span class="pr">${int(l.price)} <small class="muted" style="font-size:12px">ASC</small></span>${!mine && Number(l.left) > 1 ? `<select aria-label="${esc(t("m.qty"))}" style="min-height:34px;background:var(--bg2);color:var(--ink);border:1px solid var(--line2);border-radius:8px">${qtyOpts}</select>` : ""}<button type="button">${esc(mine ? t("m.cancelB") : t("m.buyB"))}</button></div>`);
                const b = n.querySelector("button");
                b.onclick = () => (mine ? send($("mBuy"), b, async () => (await write("market")).cancel(l.id)) : buy(l, b));
                if (!CH.account) b.disabled = true;
                list.appendChild(n);
            }
        }
        // 上架
        const pick = $("mkPick");
        const bag = Object.entries(D.bag).map(([pid, q]) => [LK.L.byPid[pid], q]).filter(([p]) => p);
        if (!same(pick, JSON.stringify([bag.map(([p, q]) => [p.pid, q]), S.lang]))) {
            const cur = pick.value;
            pick.innerHTML = bag.length ? bag.map(([p, q]) => `<option value="${p.pid}">${esc(partName(p))} ×${q}</option>`).join("") : `<option value="">${esc(t("m.noParts"))}</option>`;
            if (cur && bag.some(([p]) => String(p.pid) === cur)) pick.value = cur;
        }
        const qty = Math.max(0, parseInt($("mkQty").value, 10) || 0), price = Math.max(0, parseInt($("mkPrice").value, 10) || 0);
        const total = BigInt(qty) * BigInt(price);
        const f = feeOf(CH.account);
        const cut = (total * f + 9999n) / 10000n;
        $("mkGet").textContent = `${int(total - cut)} ASC`;
        $("mkFee").textContent = t("m.feeNote2", { f: Number(f) / 100 });
        const have = D.bag[pick.value] || 0;
        $("bList").disabled = !CH.account || !bag.length || qty < 1 || qty > have || price < 1;
        // 我的掛單
        const mine = $("mkMine");
        const my = D.listings.filter((l) => l.seller.toLowerCase() === me());
        if (!same(mine, JSON.stringify([my.map((l) => [l.id, String(l.left)]), S.lang]))) {
            mine.innerHTML = "";
            if (!my.length) mine.appendChild(el(`<p class="muted small">${esc(t("m.noMine"))}</p>`));
            for (const l of my) {
                const p = LK.L.byPid[l.pid];
                if (!p) continue;
                const r = el(`<div class="mine-row"><img src="${p.thumb}" alt=""><span>${esc(partName(p))}<br><small class="muted">${int(l.price)} ASC · ${esc(t("m.left"))} ${int(l.left)}</small></span><button type="button">${esc(t("m.cancelB"))}</button></div>`);
                const b = r.querySelector("button");
                b.onclick = () => send($("mList"), b, async () => (await write("market")).cancel(l.id));
                mine.appendChild(r);
            }
        }
    }
    $("bList").onclick = () => {
        const pid = Number($("mkPick").value), qty = parseInt($("mkQty").value, 10), price = parseInt($("mkPrice").value, 10);
        send($("mList"), $("bList"), async (step) => {
            if (!(await read.parts.isApprovedForAll(CH.account, C.market))) {
                step("approve", S.lang === "zh" ? "配件給市場代管" : "parts for the market");
                const tx = await (await write("parts")).setApprovalForAll(C.market, true);
                step("pending", tx.hash);
                await tx.wait();
            }
            return (await write("market")).listPart(pid, qty, price);
        });
    };
    ["mkSort", "mkPrice", "mkQty", "mkPick"].forEach((id) => $(id).addEventListener("input", render));
    U.renderers.push(() => { if (S.page === "nft" && S.nft === "market") render(); });
})();
