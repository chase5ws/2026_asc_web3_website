/* NFT：鑄造、解盲、VIP、換裝、轉蛋、背包 */
(() => {
    const CH = window.ASCChain, LK = window.ASCLook, U = window.ASCUI;
    const { C, write } = CH;
    const { S, D, $, t, el, esc, send, payAsc, int, fee, date, tile, partName, optName, slotName, tierTag } = U;
    const Q = { id: null, try: {}, take: new Set(), slot: null, sel: new Set() };
    const same = (box, sig) => { if (box._sig === sig) return true; box._sig = sig; return false; };
    const tok = (id) => LK.L.tokens[String(id)];
    const revealed = (id) => !!tok(id)?.revealed;
    const isVip = () => Number(D.nftMe?.[1] || 0) > Date.now() / 1000;
    const nft = () => write("nft");

    /** 某顆現在的外觀（換裝試穿：try／take 疊上去） */
    function picksOf(id, withTry) {
        const look = LK.lookOf(id);
        if (!look) return [];
        if (!withTry) return look.picks;
        const traits = Object.fromEntries(look.picks.map((p) => [p.cat, p.opt.name]));
        for (const [slot, pid] of Object.entries(Q.try)) { const cat = LK.L.cats[slot]; traits[cat.trait_type] = cat.options[pid % 256].name; }
        for (const slot of Q.take) { const e = LK.empty(LK.L.cats[slot]); if (e) traits[LK.L.cats[slot].trait_type] = e.name; }
        return LK.picks(traits);
    }
    function catCard(id, on, onClick, check) {
        const b = el(`<button type="button" class="${on ? "on" : ""}"></button>`);
        if (revealed(id)) { const st = document.createElement("div"); st.className = "stack"; LK.compose(st, picksOf(id)); b.appendChild(st); }
        else b.appendChild(el(`<span class="boxed">?</span>`));
        if (check) b.appendChild(el(`<span class="chk">${on ? "✓" : ""}</span>`));
        b.appendChild(el(`<span>#${id}${tok(id)?.ref != null ? ` · V1 #${tok(id).ref}` : ""}</span>`));
        if (onClick) b.onclick = onClick;
        return b;
    }

    /* ───── 鑄造 ───── */
    function renderMint() {
        if (!D.ready) return;
        const s = D.nftS, me = D.nftMe;
        $("nMinted").textContent = `${int(s[0])} / ${int(s[1])}`;
        $("nMine").textContent = CH.account ? int(me[3]) : "–";
        const oc = $("overCats");
        if (!same(oc, "v1")) oc.innerHTML = [0, 7, 22].map((n) => `<img src="${LK.A}/images/${n}.png" alt="#${n}" loading="lazy">`).join("");
        $("nAllow").textContent = CH.account ? int(me[0]) : "–";
        $("nFee").textContent = fee(s[4]);
        const sale = s[3] === 1n, sold = s[2] >= s[1];
        const poor = CH.account && s[4] > D.asc;
        const note = !sale ? t("n.closed") : sold ? t("e.SoldOut") : CH.account && me[0] === 0n ? t("n.allowNone") : poor ? t("t.buyFirst") : "";
        $("nMintNote").textContent = note;
        $("nMintNote").classList.toggle("hidden", !note);
        $("bMint").disabled = !CH.account || !sale || sold || me[0] === 0n || poor;

        // 解盲
        const boxes = D.ids.filter((id) => !revealed(id));
        const fresh = (Q.fresh || []).filter((id) => D.ids.includes(id) && revealed(id));
        $("nBoxCount").textContent = boxes.length ? int(boxes.length) : "";
        for (const id of [...Q.sel]) if (!boxes.includes(id)) Q.sel.delete(id);
        const nb = $("nBoxes");
        if (!same(nb, JSON.stringify([boxes, [...Q.sel], fresh, S.lang]))) {
            nb.innerHTML = "";
            if (!boxes.length && !fresh.length) nb.appendChild(el(`<p class="muted">${esc(CH.account ? t("n.noBox") : t("lock"))}</p>`));
            boxes.forEach((id) => nb.appendChild(catCard(id, Q.sel.has(id), () => { Q.sel.has(id) ? Q.sel.delete(id) : Q.sel.add(id); renderMint(); }, true)));
            fresh.forEach((id) => { const c = catCard(id, false, () => U.go("nft", "equip")); c.appendChild(el(`<span class="new">${esc(t("n.revealed"))}</span>`)); nb.appendChild(c); });
        }
        $("bRevealAll").disabled = !boxes.length;
        $("bRevealSel").disabled = !Q.sel.size;
        const seeds = $("nSeeds");
        const mine = D.ids.map((id) => [id, tok(id)]).filter(([, x]) => x);
        if (!same(seeds, JSON.stringify([mine.map(([id, x]) => [id, x.seed, x.ref]), S.lang]))) {
            seeds.innerHTML = mine.map(([id, x]) => `<span>#${id} · ${x.ref != null ? esc(t("n.preset", { r: x.ref })) + " · " + esc(t("n.seedNone")) : x.seed ? "seed " + esc(x.seed) : "…"}</span>`).join("") || `<span>–</span>`;
        }
    }
    $("bMint").onclick = () => send($("mMint"), $("bMint"), async (step) => { await payAsc(C.nft, D.nftS[4], step); return (await nft()).randomMint(); });
    const reveal = (ids) => send($("mReveal"), [$("bRevealAll"), $("bRevealSel")], async () => (await nft()).reveal(ids)).then((r) => { if (r) { Q.sel.clear(); Q.fresh = ids; S.mt = "reveal"; U.draw(); } });
    $("bRevealAll").onclick = () => reveal(D.ids.filter((id) => !revealed(id)));
    $("bRevealSel").onclick = () => reveal([...Q.sel]);

    /* ───── VIP＋換裝 ───── */
    function renderEquip() {
        if (!D.ready) return;
        const s = D.nftS, until = Number(D.nftMe?.[1] || 0), price = D.vip.price;
        $("vDesc").textContent = price > 0n ? t("v.price", { p: int(price), d: int(D.vip.days) }) : t("v.off");
        $("vUntil").textContent = CH.account ? (isVip() ? t("v.until", { d: date(until) }) : t("v.none")) : "";
        $("bVip").disabled = !CH.account || price === 0n;
        $("vPer").disabled = price === 0n;
        $("qFee").textContent = fee(s[5]);

        const cats = D.ids.filter(revealed);
        if (!cats.includes(Q.id)) { Q.id = cats[0] ?? null; Q.try = {}; Q.take.clear(); }
        const qc = $("qCats");
        if (!same(qc, JSON.stringify([cats, Q.id, S.lang, cats.map((id) => tok(id)?.traits)]))) {
            qc.innerHTML = "";
            if (!cats.length) qc.appendChild(el(`<p class="muted">${esc(CH.account ? t("q.noneCat") : t("lock"))}</p>`));
            cats.forEach((id) => qc.appendChild(catCard(id, id === Q.id, () => { Q.id = id; Q.try = {}; Q.take.clear(); Q.slot = null; renderEquip(); })));
        }
        $("qBox").classList.toggle("hidden", Q.id == null);
        const cur = Q.id != null ? picksOf(Q.id) : [];
        const now = Q.id != null ? picksOf(Q.id, true) : [];
        const prev = $("qPrev");
        const sig = JSON.stringify(now.map((p) => p.opt.name));
        if (prev._sig !== sig) { prev._sig = sig; LK.compose(prev, now); }

        const slots = $("eqSlots");
        if (!same(slots, JSON.stringify([sig, Q.slot, [...Q.take], Q.try, S.lang]))) {
            slots.innerHTML = "";
            LK.L.cats.forEach((cat, slot) => {
                const p = now.find((x) => x.slot === slot);
                const trying = Q.try[slot] != null || Q.take.has(slot);
                const canTake = !!LK.empty(cat);
                const thumb = p?.part ? `<img src="${p.part.thumb}" alt="">` : `<span class="boxed" style="width:44px;height:44px;border-radius:8px;display:grid;place-items:center;background:var(--bg2);color:var(--muted)">–</span>`;
                const row = el(`<div class="slot${trying ? " try" : ""}${Q.slot === slot ? " on" : ""}" role="button" tabindex="0">${thumb}<span><small>${esc(slotName(cat.trait_type))} · ${esc(trying ? t("q.trying") : t("q.wear"))}</small>${esc(p ? optName(p.opt, slot) : "–")}</span></div>`);
                if (canTake && (p?.opt.file || Q.take.has(slot))) {
                    const x = el(`<button type="button" class="x">${esc(Q.take.has(slot) ? t("q.untake") : t("q.take"))}</button>`);
                    x.onclick = (e) => { e.stopPropagation(); Q.take.has(slot) ? Q.take.delete(slot) : (Q.take.add(slot), delete Q.try[slot]); renderEquip(); };
                    row.appendChild(x);
                }
                row.onclick = () => { Q.slot = Q.slot === slot ? null : slot; S.eq = "mine"; U.draw(); };
                slots.appendChild(row);
            });
        }

        // 我的配件（可以點來試穿）
        const mine = $("eqMine");
        const bag = Object.entries(D.bag).map(([pid, q]) => [LK.L.byPid[pid], q]).filter(([p]) => p && (Q.slot == null || p.slot === Q.slot));
        if (!same(mine, JSON.stringify([bag.map(([p, q]) => [p.pid, q]), Q.try, Q.id, S.lang]))) {
            mine.innerHTML = "";
            if (!bag.length) mine.appendChild(el(`<p class="muted small">${esc(t("q.noBag"))}</p>`));
            bag.forEach(([p, q]) => mine.appendChild(tile(p, `<span class="q">×${q}</span>`, () => {
                if (Q.id == null) return;
                const wearing = cur.find((x) => x.slot === p.slot)?.part?.pid === p.pid;
                if (Q.try[p.slot] === p.pid || wearing) delete Q.try[p.slot];
                else { Q.try[p.slot] = p.pid; Q.take.delete(p.slot); }
                renderEquip();
            }, Q.try[p.slot] === p.pid)));
        }
        const changes = Object.entries(Q.try).filter(([slot, pid]) => cur.find((x) => x.slot === Number(slot))?.part?.pid !== pid);
        const takes = [...Q.take].filter((slot) => cur.find((x) => x.slot === slot)?.opt.file);
        $("qNeed").textContent = Q.id != null ? (isVip() ? t("q.need", { n: changes.length, m: takes.length }) : t("q.notVip")) : "";
        $("bEquip").disabled = Q.id == null || !isVip() || !(changes.length + takes.length);
        $("eqReset").disabled = !(Object.keys(Q.try).length + Q.take.size);
        Q._changes = changes.map(([, pid]) => pid);
        Q._takes = takes;

        renderGacha();
    }
    $("eqReset").onclick = () => { Q.try = {}; Q.take.clear(); renderEquip(); };
    $("bVip").onclick = () => {
        const n = Number($("vPer").value || 1);
        send($("mVip"), $("bVip"), async (step) => { await payAsc(C.nft, D.vip.price * BigInt(n), step); return (await nft()).buyVip(n); });
    };
    $("bEquip").onclick = async () => {
        const id = Q.id, parts = [...Q._changes], clear = [...Q._takes];
        const r = await send($("mEquip"), $("bEquip"), async (step) => { await payAsc(C.nft, D.nftS[5], step); return (await nft()).equip(id, parts, clear); });
        if (r) { Q.try = {}; Q.take.clear(); }
    };

    /* ───── 轉蛋 ───── */
    function renderGacha() {
        const s = D.nftS;
        const total = D.prizes.reduce((a, p) => a + p.w, 0) + D.miss;
        const pool = $("eqPool");
        if (!same(pool, JSON.stringify([D.prizes, D.miss, S.lang, Q.try]))) {
            pool.innerHTML = "";
            D.prizes.forEach((x) => {
                const p = LK.L.byPid[x.pid];
                if (!p) return;
                const pct = total ? ((x.w / total) * 100).toFixed(x.w / total < 0.01 ? 2 : 1) : "0";
                pool.appendChild(tile(p, `<span class="q">${pct}%</span>`, () => { if (Q.id == null) return; Q.try[p.slot] = p.pid; Q.take.delete(p.slot); renderEquip(); }, Q.try[p.slot] === p.pid));
            });
            if (D.miss && total) pool.appendChild(el(`<div class="tile miss" style="justify-content:center"><b style="font:900 28px var(--serif);color:var(--muted)">×</b><span>${esc(t("g.miss"))}</span><span class="q">${((D.miss / total) * 100).toFixed(1)}%</span></div>`));
        }
        const pulls = D.nftMe?.[2] || 0n;
        $("gPulls").textContent = CH.account ? int(pulls) : "–";
        $("gFee").textContent = fee(s[6]);
        const vipOnly = s[7] === 1n && !isVip();
        $("gNote").textContent = vipOnly ? t("g.vipOnly") : !D.prizes.length ? t("e.EmptyPool") : "";
        $("gNote").classList.toggle("hidden", !(vipOnly || !D.prizes.length));
        const off = !CH.account || vipOnly || !D.prizes.length;
        $("bPull1").disabled = $("bPull10").disabled = off;
        $("bBuyPulls").disabled = off || s[6] === 0n;
    }
    $("bBuyPulls").onclick = () => {
        const n = Number($("gN").value || 1);
        send($("mGacha"), $("bBuyPulls"), async (step) => { await payAsc(C.nft, D.nftS[6] * BigInt(n), step); return (await nft()).buyPulls(n); });
    };
    async function pull(times) {
        const have = D.nftMe?.[2] || 0n;
        const pay = (BigInt(times) > have ? BigInt(times) - have : 0n) * D.nftS[6];
        $("gResults").innerHTML = "";
        const r = await send($("mGacha"), [$("bPull1"), $("bPull10")], async (step) => { await payAsc(C.nft, pay, step); return (await nft()).gacha(times); });
        if (!r) return;
        const iface = CH.read.nft.interface;
        const got = r.logs.filter((l) => l.address.toLowerCase() === C.nft.toLowerCase()).map((l) => { try { return iface.parseLog(l); } catch (_) { return null; } }).filter((e) => e?.name === "GachaPull");
        const box = $("gResults");
        got.forEach((e, i) => {
            const p = e.args.hit ? LK.L.byPid[Number(e.args.partId)] : null;
            const n = p ? tile(p, "") : el(`<div class="tile miss" style="justify-content:center"><b style="font:900 28px var(--serif);color:var(--muted)">×</b><span>${esc(t("g.miss"))}</span></div>`);
            n.style.animationDelay = `${i * 0.08}s`;
            box.appendChild(n);
        });
        const hits = got.filter((e) => e.args.hit).length;
        U.say($("mGacha"), hits ? `${t("g.got")} ${hits} / ${got.length}` : t("g.nothing"), hits ? "ok" : "", r.hash);
    }
    $("bPull1").onclick = () => pull(1);
    $("bPull10").onclick = () => pull(10);

    /* ───── 背包 ───── */
    function renderBag() {
        if (!D.ready) return;
        $("bCatCount").textContent = CH.account ? int(D.ids.length) : "";
        const bc = $("bCats");
        if (!same(bc, JSON.stringify([D.ids, D.ids.map((id) => [tok(id)?.revealed, tok(id)?.traits]), S.lang, !!CH.account]))) {
            bc.innerHTML = "";
            if (!D.ids.length) bc.appendChild(el(`<p class="muted">${esc(CH.account ? t("b.empty") : t("lock"))}</p>`));
            D.ids.forEach((id) => bc.appendChild(catCard(id, false, () => window.open(`${C.opensea}/${C.nft}/${id}`, "_blank", "noopener"))));
        }
        const parts = Object.entries(D.bag).map(([pid, q]) => [LK.L.byPid[pid], q]).filter(([p]) => p);
        $("bagCount").textContent = parts.length ? int(parts.reduce((a, [, q]) => a + q, 0)) : "";
        const bp = $("bagParts");
        if (!same(bp, JSON.stringify([parts.map(([p, q]) => [p.pid, q]), S.lang, !!CH.account]))) {
            bp.innerHTML = "";
            if (!parts.length) bp.appendChild(el(`<p class="muted">${esc(CH.account ? t("b.empty") : t("lock"))}</p>`));
            parts.forEach(([p, q]) => bp.appendChild(tile(p, `<span class="q">×${q}</span>`)));
        }
    }

    U.renderers.push(() => { if (S.page === "nft" && S.nft === "mint") renderMint(); });
    U.renderers.push(() => { if (S.page === "nft" && S.nft === "equip") renderEquip(); });
    U.renderers.push(() => { if (S.page === "nft" && S.nft === "bag") renderBag(); });
})();
