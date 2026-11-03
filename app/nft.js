/* NFT：鑄造、解盲、VIP、換裝、轉蛋、背包 */
(() => {
    const CH = window.ASCChain, LK = window.ASCLook, U = window.ASCUI;
    const { C, write } = CH;
    const { S, D, $, t, el, esc, send, payAsc, int, fee, date, tile, partName, optName, slotName, tierTag } = U;
    let FX = null; // 轉蛋動畫（在下面「轉蛋」區塊建立）
    const Q = { id: null, try: {}, borrow: {}, take: new Set(), slot: null, sel: new Set() };
    const NONE = 2 ** 32 - 1; // 衣櫃：脫掉
    const VIP_PLANS = [60, 90, 180, 360]; // 訂閱方案（天）
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
        else b.appendChild(el(`<img class="boxed" src="./assets/box.png" alt="?" loading="lazy" style="object-fit:cover;border-style:solid">`));
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
        const perDay = Number(D.vip.days) ? (Number(price) * Number(D.buyPrice || 0n)) / 1e6 / Number(D.vip.days) : 0;
        $("vDesc").textContent = price > 0n ? t("v.price", { p: int(price), d: int(D.vip.days), u: perDay.toLocaleString("en-US", { maximumFractionDigits: 2 }) }) : t("v.off");
        $("vUntil").textContent = CH.account ? (isVip() ? t("v.until", { d: date(until) }) : t("v.none")) : "";
        $("bVip").disabled = !CH.account || price === 0n;
        $("vPer").disabled = price === 0n;
        // VIP 方案：60／90／180／360 天（每期 vipDays 天，合約一次最多買 12 期）；顯示 ASC 與約當 USDT
        const per = Number(D.vip.days || 30);
        const plans = VIP_PLANS.map((d) => ({ d, n: d / per })).filter((x) => Number.isInteger(x.n) && x.n >= 1 && x.n <= 12);
        const sel = $("vPer");
        const planSig = JSON.stringify([plans, String(price), String(D.buyPrice), S.lang]);
        if (sel._sig !== planSig) {
            sel._sig = planSig;
            const cur = sel.value;
            sel.innerHTML = plans.map((x) => {
                const asc = price * BigInt(x.n);
                const usd = (Number(asc) * Number(D.buyPrice || 0n)) / 1e6;
                return `<option value="${x.n}">${t("v.plan", { d: x.d, a: int(asc), u: usd.toLocaleString("en-US", { maximumFractionDigits: 0 }) })}</option>`;
            }).join("");
            if (cur && plans.some((x) => String(x.n) === cur)) sel.value = cur;
        }
        $("qFee").textContent = !D.wd ? "–" : isVip() ? t("q.vipFree") : fee(D.wd.fee);

        const cats = D.ids.filter(revealed);
        if (!cats.includes(Q.id)) { Q.id = cats[0] ?? null; Q.try = {}; Q.borrow = {}; Q.take.clear(); }
        const qc = $("qCats");
        if (!same(qc, JSON.stringify([cats, Q.id, S.lang, cats.map((id) => tok(id)?.traits)]))) {
            qc.innerHTML = "";
            if (!cats.length) qc.appendChild(el(`<p class="muted">${esc(CH.account ? t("q.noneCat") : t("lock"))}</p>`));
            cats.forEach((id) => qc.appendChild(catCard(id, id === Q.id, () => { Q.id = id; Q.try = {}; Q.borrow = {}; Q.take.clear(); Q.slot = null; renderEquip(); })));
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
                    x.onclick = (e) => { e.stopPropagation(); Q.take.has(slot) ? Q.take.delete(slot) : (Q.take.add(slot), delete Q.try[slot], delete Q.borrow[slot]); renderEquip(); };
                    row.appendChild(x);
                }
                row.onclick = () => { Q.slot = Q.slot === slot ? null : slot; S.eq = "mine"; U.draw(); };
                slots.appendChild(row);
            });
        }

        // 我的配件＋VIP 公庫存（點了試穿）：自己的配件穿上由衣櫃保管、換下退回；VIP 借公庫存的普通配件免費，換下歸還
        const vip = isVip(), W = D.wd;
        const pick = (p, borrow) => {
            if (Q.id == null) return;
            const wearing = cur.find((x) => x.slot === p.slot)?.part?.pid === p.pid;
            if ((Q.try[p.slot] === p.pid && !!Q.borrow[p.slot] === borrow) || wearing) { delete Q.try[p.slot]; delete Q.borrow[p.slot]; }
            else { Q.try[p.slot] = p.pid; if (borrow) Q.borrow[p.slot] = true; else delete Q.borrow[p.slot]; Q.take.delete(p.slot); }
            renderEquip();
        };
        const mine = $("eqMine");
        const bag = Object.entries(D.bag).map(([pid, q]) => [LK.L.byPid[pid], q]).filter(([p]) => p && (Q.slot == null || p.slot === Q.slot));
        // 公庫存種類多：選了部位才列出那個部位的，沒選只顯示一行提示
        const stockAll = Object.entries(W?.stock || {}).map(([pid, n]) => [LK.L.byPid[pid], n]).filter(([p]) => p);
        const stock = Q.slot == null ? [] : stockAll.filter(([p]) => p.slot === Q.slot);
        if (!same(mine, JSON.stringify([bag.map(([p, q]) => [p.pid, q]), stock.map(([p, n]) => [p.pid, n]), stockAll.length, Q.slot, Q.try, Q.borrow, Q.id, S.lang, vip]))) {
            mine.innerHTML = "";
            if (!bag.length && !stock.length && !stockAll.length) mine.appendChild(el(`<p class="muted small">${esc(t("q.noBag"))}</p>`));
            bag.forEach(([p, q]) => mine.appendChild(tile(p, `<span class="q">×${q}</span>`, () => pick(p, false), Q.try[p.slot] === p.pid && !Q.borrow[p.slot])));
            if (Q.slot == null && stockAll.length) mine.appendChild(el(`<p class="eq-stockh small">${esc(vip ? t("q.stockPick") : t("q.stockVip"))}</p>`));
            if (stock.length) {
                mine.appendChild(el(`<p class="eq-stockh small">${esc(vip ? t("q.stockT") : t("q.stockVip"))}</p>`));
                stock.forEach(([p, n]) => {
                    const b = tile(p, `<span class="q free">${esc(t("q.free"))}</span>`, vip ? () => pick(p, true) : () => U.say($("mEquip"), t("q.stockVip")), Q.try[p.slot] === p.pid && !!Q.borrow[p.slot], "stock" + (vip ? "" : " locked"));
                    b.title = t("q.stockLeft", { n });
                    mine.appendChild(b);
                });
            }
        }
        const changes = Object.entries(Q.try).filter(([slot, pid]) => cur.find((x) => x.slot === Number(slot))?.part?.pid !== pid);
        const takes = [...Q.take].filter((slot) => cur.find((x) => x.slot === slot)?.opt.file);
        // 換下來的去向：自己的→退回背包；公庫存→歸還；原始外觀→超稀有由管理員退回，其他消失
        const worn = (W && Q.id != null && W.worn[Q.id]) || [];
        const ret = [], giveBack = [], admin = [], lose = [];
        for (const slot of [...changes.map(([sl]) => Number(sl)), ...takes]) {
            const p = cur.find((x) => x.slot === slot)?.part;
            if (!p) continue;
            const k = worn[slot]?.kind ?? 0;
            (k === 1 ? ret : k === 2 ? giveBack : p.tier === "super" ? admin : lose).push(partName(p));
        }
        const cost = !W ? null : vip ? 0n : W.fee;
        $("qNeed").textContent = Q.id == null ? "" : !W ? t("q.noWd") : W.paused ? t("q.paused") : [
            t("q.need", { n: changes.length, m: takes.length }),
            ret.length ? t("q.ret", { x: ret.join("、") }) : "", giveBack.length ? t("q.giveBack", { x: giveBack.join("、") }) : "",
            admin.length ? t("q.back", { x: admin.join("、") }) : "", lose.length ? t("q.lose", { x: lose.join("、") }) : "",
            changes.length + takes.length ? (cost ? t("q.cost", { f: fee(cost) }) : t("q.costFree")) : ""
        ].filter(Boolean).join("　");
        $("bEquip").disabled = Q.id == null || !W || W.paused || !(changes.length + takes.length);
        $("eqReset").disabled = !(Object.keys(Q.try).length + Q.take.size);
        Q._changes = changes.map(([slot, pid]) => ({ slot: Number(slot), partId: pid, borrow: !!Q.borrow[slot] }));
        Q._takes = takes;

    }
    $("eqReset").onclick = () => { Q.try = {}; Q.borrow = {}; Q.take.clear(); renderEquip(); };
    $("bVip").onclick = () => {
        const n = Number($("vPer").value || 1);
        send($("mVip"), $("bVip"), async (step) => { await payAsc(C.nft, D.vip.price * BigInt(n), step); return (await nft()).buyVip(n); });
    };
    $("bEquip").onclick = async () => {
        const id = Q.id, W = D.wd;
        if (!W) return;
        const cs = [...Q._changes, ...Q._takes.map((slot) => ({ slot, partId: NONE, borrow: false }))];
        const own = cs.filter((c) => c.partId !== NONE && !c.borrow);
        const cost = isVip() ? 0n : W.fee;
        const r = await send($("mEquip"), $("bEquip"), async (step) => {
            // 第一次穿自己的配件：授權衣櫃保管配件（只要一次）
            if (own.length && !W.approved && !(await CH.read.parts.isApprovedForAll(CH.account, C.wardrobe))) {
                step("approve", t("q.partsApprove"));
                const tx = await (await write("parts")).setApprovalForAll(C.wardrobe, true);
                step("pending", tx.hash);
                await tx.wait();
                W.approved = true;
            }
            if (cost > 0n) await payAsc(C.wardrobe, cost, step);
            const c = await write("wardrobe");
            let opts = {};
            try { opts = { gasLimit: ((await c.change.estimateGas(id, cs)) * 13n) / 10n }; } catch (_) { /* 估不出來就交給錢包，錯誤訊息照常顯示 */ }
            return c.change(id, cs, opts);
        });
        if (r) {
            // 本機先套用：外觀、背包、每個部位是誰的（之後讀鏈會是同一份結果）
            const tk = tok(id), wn = W.worn[id] || [];
            if (tk?.traits) LK.applyEquip(tk, cs.filter((c) => c.partId !== NONE).map((c) => c.partId), cs.filter((c) => c.partId === NONE).map((c) => c.slot));
            for (const c of cs) {
                const old = wn[c.slot];
                if (old?.kind === 1) D.bag[old.pid] = (D.bag[old.pid] || 0) + 1;
                if (old?.kind === 2) W.stock[old.pid] = (W.stock[old.pid] || 0) + 1;
                if (c.partId !== NONE && !c.borrow) { D.bag[c.partId] = (D.bag[c.partId] || 0) - 1; if (D.bag[c.partId] <= 0) delete D.bag[c.partId]; }
                if (c.borrow) W.stock[c.partId] = Math.max(0, (W.stock[c.partId] || 0) - 1);
                wn[c.slot] = c.partId === NONE ? { kind: 3, pid: NONE } : { kind: c.borrow ? 2 : 1, pid: c.partId };
            }
            W.worn[id] = wn;
            Q.try = {}; Q.borrow = {}; Q.take.clear();
            renderEquip();
        }
    };
    /** 「刷新」：丟掉外觀快取、重新讀鏈上的背包與喵武士（剛轉蛋、剛換裝看不到時用） */
    $("eqRefresh").onclick = async () => {
        const b = $("eqRefresh");
        if (b.disabled) return;
        b.disabled = true;
        U.say($("mEquip"), t("q.refreshing"));
        try {
            LK.reset();
            await U.refresh();
            U.say($("mEquip"), t("q.refreshed"), "ok");
        } finally {
            b.disabled = false;
            for (const k of ["qCats", "eqSlots", "eqMine", "qPrev"]) $(k)._sig = null;
            U.draw();
        }
    };

    /* ───── 轉蛋 ───── */
    function renderGacha() {
        if (!D.ready) return;
        const s = D.nftS;
        const total = D.prizes.reduce((a, p) => a + p.w, 0) + D.miss;
        // 轉蛋機：最上面一條橫的只放稀有與超稀有（超稀有在前，左右滑動）；普通收在下方「普通配件」
        const pool = $("eqPool");
        if (!same(pool, JSON.stringify([D.prizes, D.miss, S.lang]))) {
            const pc = (w) => { const r = total ? w / total : 0; return (r * 100).toFixed(r < 0.01 ? 2 : 1); };
            const rows = D.prizes.map((x) => ({ p: LK.L.byPid[x.pid], w: x.w })).filter((x) => x.p);
            const order = { super: 0, rare: 1 };
            const feat = rows.filter((x) => x.p.tier !== "normal").sort((a, b) => order[a.p.tier] - order[b.p.tier] || a.w - b.w || a.p.pid - b.p.pid);
            const normal = rows.filter((x) => x.p.tier === "normal").sort((a, b) => a.p.pid - b.p.pid);
            pool.innerHTML = "";
            if (!feat.length) pool.appendChild(el(`<p class="muted small">${esc(D.prizes.length ? "–" : t("e.EmptyPool"))}</p>`));
            feat.forEach((x) => pool.appendChild(tile(x.p, `<span class="q">${pc(x.w)}%</span>`, null, false, "lg-t " + x.p.tier)));
            pool.scrollLeft = 0;
            // 機率摘要：超稀有／稀有／普通／沒中
            const sum = (tier) => rows.filter((x) => x.p.tier === tier).reduce((a, x) => a + x.w, 0);
            $("gOdds").innerHTML = ["super", "rare", "normal"].filter((tier) => sum(tier)).map((tier) => `${tierTag(tier)} ${pc(sum(tier))}%`).concat(D.miss && total ? [`<span class="rk">${esc(t("g.miss"))}</span> ${pc(D.miss)}%`] : []).join("　");
            const np = $("eqPoolNormal");
            np.innerHTML = "";
            normal.forEach((x) => np.appendChild(tile(x.p, `<span class="q">${pc(x.w)}%</span>`)));
            $("gAllSum").textContent = t("g.allSum", { n: normal.length, p: pc(sum("normal")) });
            $("gAllSum").parentElement.classList.toggle("hidden", !normal.length);
            // 寶箱上方飄的光點：顏色依獎池（超稀有金、稀有藍、普通白）
            const dome = $("gDome");
            const cols = [...feat.map((x) => (x.p.tier === "super" ? "#ffd257" : "#6cb6ff")), ...Array(6).fill("#fff3d6")].slice(0, 12);
            dome.innerHTML = cols.map((c, i) => `<i style="--c:${c};left:${10 + ((i * 37) % 80)}%;animation-delay:${((i * 0.53) % 4).toFixed(2)}s;animation-duration:${(3.2 + (i % 4) * 0.6).toFixed(1)}s"></i>`).join("");
            railArrows();
        }
        renderLog();
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
    /* 系統訊息（像線上遊戲的聊天框）：只存在這次開啟的頁面，切換語言會重畫 */
    const LOG = [{ k: "g.log0" }, { k: "g.log1" }];
    function logAdd(...xs) { LOG.push(...xs); if (LOG.length > 60) LOG.splice(2, LOG.length - 60); renderLog(); }
    function renderLog() {
        const box = $("gLog");
        if (same(box, JSON.stringify([LOG, S.lang]))) return;
        const nm = (pid) => { const p = LK.L.byPid[pid]; return p ? partName(p) : "#" + pid; };
        box.innerHTML = LOG.map((x) => {
            if (x.k) return `<p class="sys">${esc(t(x.k, x.v || {}))}</p>`;
            if (x.miss) return `<p class="miss">${esc(t("g.logMiss"))}</p>`;
            if (x.ann) return `<p class="ann">${esc(t("g.logAnn", { x: nm(x.ann) }))}</p>`;
            const p = LK.L.byPid[x.pid];
            return `<p class="got">${esc(t("g.logGot", { x: "\u0000" })).replace("\u0000", `<span class="it ${p?.tier || "normal"}">[${esc(nm(x.pid))}]</span>`)}</p>`;
        }).join("");
        box.scrollTop = box.scrollHeight;
    }
    /** 大獎展示：左右箭頭（桌機用；手機直接滑），到頭就淡掉 */
    function railArrows() {
        const st = $("eqPool");
        $("gPrev").disabled = st.scrollLeft <= 2;
        $("gNext").disabled = st.scrollLeft + st.clientWidth >= st.scrollWidth - 2;
        // 右邊還有東西時淡出邊緣，提示可以往左滑
        st.parentElement.classList.toggle("more", !$("gNext").disabled);
    }
    $("eqPool").addEventListener("scroll", railArrows, { passive: true });
    $("gPrev").onclick = () => $("eqPool").scrollBy({ left: -$("eqPool").clientWidth * 0.8, behavior: "smooth" });
    $("gNext").onclick = () => $("eqPool").scrollBy({ left: $("eqPool").clientWidth * 0.8, behavior: "smooth" });
    addEventListener("resize", () => { if (S.page === "nft" && S.nft === "gacha") railArrows(); });
    $("bBuyPulls").onclick = () => {
        const n = Number($("gN").value || 1);
        send($("mGacha"), $("bBuyPulls"), async (step) => { await payAsc(C.nft, D.nftS[6] * BigInt(n), step); return (await nft()).buyPulls(n); });
    };
    /**
     * 送轉蛋交易：自己估 gas 再乘 2（沒用到的 gas 不收錢）。轉蛋依抽中什麼走不同的路，用量會浮動，
     * 錢包估得剛好時容易 gas 用完失敗（2026-11-03 實際發生過）。
     */
    async function gachaTx(times) {
        const c = await nft();
        let opts = {};
        try { opts = { gasLimit: (await c.gacha.estimateGas(times)) * 2n }; } catch (_) { /* 估不出來（例如會失敗）就交給錢包，錯誤訊息照常顯示 */ }
        const tx = await c.gacha(times, opts);
        FX.open(times);
        return tx;
    }
    async function pull(times) {
        const have = D.nftMe?.[2] || 0n;
        const pay = (BigInt(times) > have ? BigInt(times) - have : 0n) * D.nftS[6];
        $("gResults").innerHTML = "";
        logAdd({ k: "g.logStart", v: { n: times } });
        const r = await send($("mGacha"), [$("bPull1"), $("bPull10")], async (step) => { await payAsc(C.nft, pay, step); return gachaTx(times); });
        if (!r) {
            // 失敗：動畫視窗改成失敗畫面（原因＋交易連結），不會一直卡在轉動中
            const f = send.last;
            if (f) { FX.fail(f.error, f.hash); logAdd({ k: "g.logFail" }); } else FX.close();
            return;
        }
        const iface = CH.read.nft.interface;
        const got = r.logs.filter((l) => l.address.toLowerCase() === C.nft.toLowerCase()).map((l) => { try { return iface.parseLog(l); } catch (_) { return null; } }).filter((e) => e?.name === "GachaPull");
        const box = $("gResults");
        got.forEach((e, i) => {
            const p = e.args.hit ? LK.L.byPid[Number(e.args.partId)] : null;
            const n = p ? tile(p, "", null, false, "lg-t " + p.tier) : el(`<div class="tile lg-t miss"><b>×</b><span>${esc(t("g.miss"))}</span></div>`);
            n.style.animationDelay = `${i * 0.08}s`;
            box.appendChild(n);
        });
        const hits = got.filter((e) => e.args.hit).length;
        U.say($("mGacha"), hits ? `${t("g.got")} ${hits} / ${got.length}` : t("g.nothing"), hits ? "ok" : "", r.hash);
        logAdd(...got.map((e) => (e.args.hit ? { pid: Number(e.args.partId) } : { miss: 1 })),
            ...got.filter((e) => e.args.hit && LK.L.byPid[Number(e.args.partId)]?.tier === "super").map((e) => ({ ann: Number(e.args.partId) })));
        // 本機先把抽到的配件放進背包（換裝頁馬上看得到；之後讀鏈會是同一份數字）
        for (const e of got) if (e.args.hit) { const pid = Number(e.args.partId); D.bag[pid] = (D.bag[pid] || 0) + 1; }
        U.draw();
        FX.show(got.map((e) => { const p = e.args.hit ? LK.L.byPid[Number(e.args.partId)] : null; return { p, tier: p ? p.tier : "miss" }; }));
    }

    /* ───── 轉蛋動畫：扭蛋機轉動（等上鏈）→ 一顆顆扭蛋落下、搖晃、打開；依抽到的稀有度變色與特效 ───── */
    FX = (() => {
        const RANK = { miss: 0, normal: 1, rare: 2, super: 3 };
        let root = null, skip = false, wake = null, timer = null, run = 0, dismissed = false;
        const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
        const wait = (ms) => new Promise((r) => { if (skip) return r(); wake = r; timer = setTimeout(r, ms); });
        const label = (tier) => (tier === "miss" ? t("g.miss") : t("g.tier." + tier));
        function close() {
            run++;
            clearTimeout(timer);
            wake?.();
            root?.remove();
            root = null;
            document.removeEventListener("keydown", onKey);
        }
        /** 右上角 ✕／Esc：隨時可以手動關掉（交易照常進行，結果仍會出現在頁面的系統訊息） */
        function dismiss() { dismissed = true; close(); }
        function onKey(e) { if (e.key === "Escape" && root) dismiss(); }
        function doSkip() {
            if (!root || skip) return;
            skip = true;
            root.classList.add("fast");
            clearTimeout(timer);
            wake?.();
        }
        /** 交易送出後：顯示轉動中的扭蛋機 */
        function open(times) {
            close();
            dismissed = false;
            skip = reduce();
            const rays = Array.from({ length: 9 }, (_, i) => `<i style="--r:${-60 + i * 15}deg;animation-delay:${(i * 0.11).toFixed(2)}s"></i>`).join("");
            root = el(`<div class="gfx spin${skip ? " fast" : ""}" role="dialog" aria-modal="true" aria-live="polite"><div class="gfx-in">
                <div class="gfx-head"><i aria-hidden="true">◆</i><b>${esc(t("g.winT"))}</b><i aria-hidden="true">◆</i><button type="button" class="gfx-x" aria-label="${esc(t("g.fx.close"))}" title="${esc(t("g.fx.close"))}">✕</button></div>
                <div class="gfx-mach" aria-hidden="true"><div class="gfx-rays">${rays}</div><div class="lg-chest big"><i class="lid"></i><i class="lock"></i><i class="base"></i></div></div>
                <p class="gfx-txt">${esc(t("g.fx.spin", { n: times }))}</p>
                <div class="gfx-res${times === 1 ? " one" : ""}"></div>
                <div class="gfx-log hidden"></div>
                <div class="gfx-btns"><button type="button" class="btn alt gfx-skip hidden">${esc(t("g.fx.skip"))}</button><button type="button" class="btn gfx-ok hidden">${esc(t("g.fx.ok"))}</button></div>
            </div></div>`);
            root.querySelector(".gfx-skip").onclick = doSkip;
            root.querySelector(".gfx-ok").onclick = close;
            root.querySelector(".gfx-x").onclick = dismiss;
            root.onclick = (e) => { if (e.target === root && root.classList.contains("done")) close(); };
            document.addEventListener("keydown", onKey);
            document.body.appendChild(root);
        }
        function sparks(card, n) {
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, d = 50 + Math.random() * 60;
                card.appendChild(el(`<span class="gfx-spark" style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;animation-delay:${(Math.random() * 0.1).toFixed(2)}s"></span>`));
            }
        }
        /** 上鏈後：依結果一顆顆打開 */
        async function show(results) {
            if (dismissed) return; // 使用者已經手動關掉，就不再跳出來
            if (!root) open(results.length);
            const me = ++run;
            const one = results.length === 1;
            root.classList.remove("spin");
            root.classList.add("res");
            root.querySelector(".gfx-txt").textContent = t("g.fx.open");
            const box = root.querySelector(".gfx-res");
            box.classList.toggle("one", one);
            root.querySelector(".gfx-skip").classList.toggle("hidden", skip);
            for (const r of results) {
                if (me !== run) return;
                const rank = RANK[r.tier] ?? 0;
                const prize = r.p
                    ? `<img src="${r.p.thumb}" alt=""><span>${esc(partName(r.p))}</span>${tierTag(r.p.tier)}`
                    : `<b>×</b><span>${esc(t("g.miss"))}</span>`;
                const card = el(`<div class="gfx-card t-${r.tier}"><div class="gfx-cap"><i class="top"></i><i class="bot"></i></div><div class="gfx-prize">${prize}</div></div>`);
                box.appendChild(card);
                await wait(one ? 450 : 140);
                card.classList.add("shake");
                // 越稀有搖越久，增加期待感
                await wait((one ? 700 : 160) + rank * (one ? 350 : 140));
                card.classList.add("open");
                if (rank >= 2 && !skip) sparks(card, rank === 3 ? 18 : 10);
                if (rank === 3 && !skip) { const f = el(`<div class="gfx-flash"></div>`); root.appendChild(f); setTimeout(() => f.remove(), 900); }
                // 視窗下方的系統訊息，一行一行跑出來
                const lg = root.querySelector(".gfx-log");
                lg.classList.remove("hidden");
                lg.appendChild(el(r.p
                    ? `<p class="got">${esc(t("g.logGot", { x: "\u0000" })).replace("\u0000", `<span class="it ${r.p.tier}">[${esc(partName(r.p))}]</span>`)}</p>`
                    : `<p class="miss">${esc(t("g.logMiss"))}</p>`));
                if (rank === 3) lg.appendChild(el(`<p class="ann">${esc(t("g.logAnn", { x: partName(r.p) }))}</p>`));
                lg.scrollTop = lg.scrollHeight;
                await wait(one ? 500 : rank >= 2 ? 420 : 120);
            }
            if (me !== run) return;
            const hits = results.filter((r) => r.p);
            const best = hits.reduce((b, r) => (RANK[r.tier] > RANK[b?.tier ?? "miss"] ? r : b), null);
            root.querySelector(".gfx-txt").innerHTML = hits.length
                ? `${esc(t("g.got"))} <b>${hits.length}</b> / ${results.length}${best && RANK[best.tier] >= 2 ? `　${esc(t("g.fx.best"))} ${tierTag(best.tier)} ${esc(partName(best.p))}` : ""}`
                : esc(t("g.nothing"));
            root.classList.add("done");
            root.querySelector(".gfx-skip").classList.add("hidden");
            root.querySelector(".gfx-ok").classList.remove("hidden");
            root.querySelector(".gfx-ok").focus();
        }
        /** 交易失敗：停止轉動，顯示原因與交易連結 */
        function fail(msg, hash) {
            if (!root || dismissed) return;
            run++;
            clearTimeout(timer);
            root.classList.remove("spin");
            root.classList.add("fail", "done");
            const txt = root.querySelector(".gfx-txt");
            txt.innerHTML = `<b>${esc(t("g.fx.fail"))}</b><br>${esc(msg || "")}${hash ? `<br><a href="${CH.link("tx", hash)}" target="_blank" rel="noopener">${esc(t("tx.view"))}</a>` : ""}`;
            root.querySelector(".gfx-skip").classList.add("hidden");
            const ok = root.querySelector(".gfx-ok");
            ok.textContent = t("g.fx.close");
            ok.classList.remove("hidden");
            ok.focus();
        }
        return { open, show, close, fail, label };
    })();
    window.ASCGachaFX = FX; // 方便在瀏覽器主控台預覽動畫：ASCGachaFX.show([{ p: ASCLook.L.parts[0], tier: "super" }])
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
    U.renderers.push(() => { if (S.page === "nft" && S.nft === "gacha") renderGacha(); });
    U.renderers.push(() => { if (S.page === "nft" && S.nft === "bag") renderBag(); });
})();
