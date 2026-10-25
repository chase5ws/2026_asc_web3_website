/* 信物 V2：隨機鑄造、VIP、舊信物領回、自選配件／換裝（即時預覽）、轉蛋與背包、我的喵武士、隨機執行紀錄（瀏覽器驗算）
 * 合約：2026_asc_web3_ipfs/contract/contracts/AscCatSamuraiV2.sol；配件對照表與圖層：{v2Site}/traits.json、{v2Site}/layers/ */
(function () {
    const A = window.ASC;
    const { C, E, $, L, esc, say, short, link } = A;
    if (!E) return;
    const SITE = String(C.v2Site || "").replace(/\/$/, "");
    const CATS = 5;
    const ABI = [
        "function totalSupply() view returns (uint256)", "function nextId() view returns (uint256)", "function maxSupply() view returns (uint256)",
        "function saleOpen() view returns (bool)", "function paused() view returns (bool)", "function legacyCount() view returns (uint256)",
        "function prices() view returns (uint256, uint256, uint256, uint256, uint256)", "function maxRandomPerWallet() view returns (uint256)",
        "function randomMinted(address) view returns (uint256)", "function isVip(address) view returns (bool)",
        "function balanceOf(address) view returns (uint256)", "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
        "function traitsOf(uint256) view returns (uint8[5])", "function traitsRange(uint256, uint256) view returns (bool[], uint40[])",
        "function comboOwner(uint8[5]) view returns (uint256)", "function backpack(address) view returns (uint256[][5])",
        "function options(uint256) view returns (uint16[], bool[])", "function gachaPool() view returns (tuple(uint8 cat, uint8 idx, uint16 weight)[], uint32)",
        "function claim(uint256[] ids)", "function randomMint() returns (uint256)", "function buyVip()",
        "function customMint(uint8[5] t) returns (uint256)", "function changeTraits(uint256 id, uint8[5] t)", "function gacha(uint256 times)",
        "event Minted(uint256 indexed tokenId, address indexed to, uint8 kind, uint40 traits)",
        "event TraitsChanged(uint256 indexed tokenId, address indexed owner, uint40 oldTraits, uint40 newTraits)",
        "event RandomSeed(address indexed user, uint8 indexed purpose, uint256 indexed ref, bytes32 prevBlockHash, uint256 prevrandao, uint256 nonce, bytes32 seed)",
        "event GachaPull(address indexed user, bytes32 seed, uint256 roll, uint256 totalWeight, bool hit, uint8 cat, uint8 idx)",
        "error SaleClosed()", "error SoldOut()", "error NotVip()", "error AlreadyVip()", "error WalletLimit()", "error BadTrait(uint256, uint256)",
        "error ComboTaken(uint256)", "error NoItem(uint256, uint256)", "error NotTokenOwner(uint256)", "error NoChange()", "error BadAmount()",
        "error NotLegacy(uint256)", "error LegacyNotReady(uint256)", "error NotOldOwner(uint256)", "error NoRandomResult()", "error EmptyPool()",
        "error EnforcedPause()", "error ERC721InvalidSender(address)", "error ReentrancyGuardReentrantCall()", "error SafeERC20FailedOperation(address)",
        "error ERC20InsufficientBalance(address, uint256, uint256)", "error ERC20InsufficientAllowance(address, uint256, uint256)"
    ];
    const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address, address) view returns (uint256)", "function approve(address, uint256) returns (bool)", "function transfer(address, uint256) returns (bool)"];
    const OLD = ["function balanceOf(address) view returns (uint256)", "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)"];
    const iface = new E.Interface(ABI);
    const nft = C.nftV2 ? new E.Contract(C.nftV2, ABI, A.provider) : null;
    const usdt = C.usdt ? new E.Contract(C.usdt, ERC20, A.provider) : null;
    const oldNft = C.nft ? new E.Contract(C.nft, OLD, A.provider) : null;
    const coder = E.AbiCoder.defaultAbiCoder();

    const U = (v) => Number(E.formatUnits(v ?? 0n, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 });
    const price = (v) => (v === 0n ? L("v2.free") : `${U(v)} USDT`);
    const unpack = (p) => Array.from({ length: CATS }, (_, c) => Number((BigInt(p) >> BigInt(8 * c)) & 0xffn));
    const pack = (t) => t.reduce((a, v, c) => a | (BigInt(v) << BigInt(8 * c)), 0n);

    let T = null; // traits.json
    let opts = null; // 鏈上權重 [{weights, rare}]
    let pool = null; // 轉蛋獎池 {prizes, miss}
    let info = null; // 合約狀態
    let me = null; // 我的資料
    let mode = "new";
    let sel = [0, 0, 0, 0, 0];
    let pickId = null;
    let busy = false;

    /* ───────────── 配件與圖層 ───────────── */
    const opt = (c, i) => T?.categories[c]?.options[i];
    const optName = (c, i) => { const o = opt(c, i); return o ? (A.lang === "zh" && o.zh ? o.zh : o.name) : `#${i}`; };
    const tierOf = (c, i) => opt(c, i)?.tier || "normal";
    const tierTag = (t) => `<span class="tier ${t}">${L("v2.tier." + t)}</span>`;
    const layerUrl = (c, i) => { const f = opt(c, i)?.file; return f ? `${SITE}/${f}` : null; };
    function drawStack(el, t, extra = "") {
        el.innerHTML = extra + t.map((v, c) => layerUrl(c, v)).filter(Boolean).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("");
    }

    /* ───────────── 交易 ───────────── */
    function explain(e) {
        if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return L("err.cancel");
        let name = e?.revert?.name;
        const data = e?.data || e?.info?.error?.data?.data || e?.info?.error?.data;
        if (!name && typeof data === "string" && data.startsWith("0x")) { try { name = iface.parseError(data)?.name; } catch (_) { /* 不是 V2 的錯誤 */ } }
        if (name && window.ASC_TEXT.zh["v2.err." + name]) return L("v2.err." + name);
        return A.explain(e);
    }
    async function send(msgEl, label, fn, contract = nft) {
        try {
            const signer = await A.walletSigner();
            say(msgEl, L("tx.wallet", { label }));
            const tx = await fn(contract.connect(signer));
            say(msgEl, L("tx.sent"));
            const rc = await tx.wait();
            msgEl.className = "msg";
            msgEl.innerHTML = `<span class="ok">${L("tx.done")}</span> ${link(`tx/${tx.hash}`, L("tx.view"))}`;
            return rc;
        } catch (e) {
            say(msgEl, explain(e), "err");
            return null;
        }
    }
    /** 需要付 USDT 的動作：確認金額 → 授權不足就先授權剛好的金額 → 執行 */
    async function payThen(msgEl, label, amount, fn) {
        if (!A.account) { await A.connect().catch(() => {}); if (!A.account) return null; }
        if (amount > 0n) {
            if (!confirm(L("v2.confirmPay", { p: U(amount), label }))) return null;
            const allowance = await usdt.allowance(A.account, C.nftV2).catch(() => 0n);
            if (allowance < amount && !(await send(msgEl, L("v2.approve"), (c) => c.approve(C.nftV2, amount), usdt))) return null;
        }
        const rc = await send(msgEl, label, fn);
        if (rc) await load(true);
        return rc;
    }
    const logsOf = (rc, name) => rc.logs.map((l) => { try { return iface.parseLog(l); } catch (_) { return null; } }).filter((x) => x && x.name === name);

    /* ───────────── 讀鏈 ───────────── */
    async function loadStatic() {
        if (!T) T = await (await fetch(`${SITE}/traits.json`, { cache: "no-cache" })).json();
        if (!opts) opts = await Promise.all(Array.from({ length: CATS }, (_, c) => nft.options(c).then(([w, r]) => ({ weights: w.map(Number), rare: [...r] }))));
        if (!pool) { const [p, miss] = await nft.gachaPool(); pool = { prizes: p.map((x) => ({ cat: Number(x.cat), idx: Number(x.idx), weight: Number(x.weight) })), miss: Number(miss) }; }
    }
    async function load(force = false) {
        if (!nft || (busy && !force)) return;
        busy = true;
        try {
            await loadStatic();
            const [supply, nextId, max, sale, prices, maxR, legacy] = await Promise.all([nft.totalSupply(), nft.nextId(), nft.maxSupply(), nft.saleOpen(), nft.prices(), nft.maxRandomPerWallet(), nft.legacyCount()]);
            info = { supply, nextId, max, sale, maxR, legacy: Number(legacy), fee: { random: prices[0], custom: prices[1], change: prices[2], vip: prices[3], gacha: prices[4] } };
            me = null;
            const a = A.account;
            if (a) {
                const [vip, rMinted, bal, bag, n, [exists]] = await Promise.all([nft.isVip(a), nft.randomMinted(a), usdt.balanceOf(a), nft.backpack(a), nft.balanceOf(a), nft.traitsRange(0, legacy)]);
                const ids = await Promise.all(Array.from({ length: Number(n) }, (_, i) => nft.tokenOfOwnerByIndex(a, i)));
                const tokens = await Promise.all(ids.map(async (id) => ({ id: Number(id), t: (await nft.traitsOf(id)).map(Number) })));
                tokens.sort((x, y) => x.id - y.id);
                let claimable = [];
                if (oldNft) {
                    const on = Number(await oldNft.balanceOf(a).catch(() => 0n));
                    const oldIds = await Promise.all(Array.from({ length: on }, (_, i) => oldNft.tokenOfOwnerByIndex(a, i).then(Number).catch(() => -1)));
                    claimable = oldIds.filter((id) => id >= 0 && id < info.legacy && !exists[id]).sort((x, y) => x - y);
                }
                me = { vip, rMinted, bal, bag: bag.map((r) => r.map(Number)), tokens, claimable };
            }
            render();
        } catch (e) {
            console.warn("V2", e);
        } finally {
            busy = false;
        }
    }

    /* ───────────── 畫面 ───────────── */
    function render() {
        if (!info) return;
        $("v2Top").hidden = false;
        ["v2Workshop", "v2Gacha", "v2Mine", "v2Log"].forEach((id) => ($(id).hidden = false));
        $("v2Minted").textContent = `${info.supply} / ${info.max}`;
        $("v2Bar").style.width = `${Math.min((Number(info.supply) / Number(info.max)) * 100, 100)}%`;
        $("v2Sale").textContent = info.sale ? L("v2.open") : L("v2.closed");
        const f = info.fee;
        $("v2pRandom").textContent = price(f.random); $("v2pCustom").textContent = price(f.custom); $("v2pChange").textContent = price(f.change);
        $("v2pVip").textContent = price(f.vip); $("v2pGacha").textContent = price(f.gacha);
        $("v2VipBtn").textContent = L("v2.buyVip", { p: U(f.vip) });
        $("v2G1").textContent = `${L("v2.g1")}・${price(f.gacha)}`;
        $("v2G10").textContent = `${L("v2.g10")}・${price(f.gacha * 10n)}`;
        $("v2Vip").textContent = me ? (me.vip ? L("v2.vipYes") : L("v2.vipNo")) : "—";
        $("v2Usdt").textContent = me ? U(me.bal) : "—";
        $("v2RandomLeft").textContent = me && info.maxR > 0n ? L("v2.randomLeft", { n: Math.max(Number(info.maxR - me.rMinted), 0) }) : "";
        $("v2RandomBtn").disabled = !info.sale;
        $("v2VipBtn").hidden = !!me?.vip;
        $("v2ClaimBox").hidden = !me;
        if (me) {
            $("v2ClaimBtn").hidden = !me.claimable.length;
            $("v2ClaimBtn").textContent = L("v2.claim", { ids: me.claimable.map((i) => "#" + i).join(" ") });
            $("v2ClaimBox").querySelector("p").textContent = me.claimable.length ? L("v2.claimDesc") : L("v2.claimNone");
        }
        renderOdds();
        renderBag();
        renderGallery();
        renderWorkshop();
    }

    function renderOdds() {
        if (!pool) return;
        const total = pool.miss + pool.prizes.reduce((s, p) => s + p.weight, 0);
        $("v2Odds").innerHTML = pool.prizes.map((p) => `<div class="kv"><span>${esc(optName(p.cat, p.idx))} ${tierTag(tierOf(p.cat, p.idx))}</span><b>${((p.weight / total) * 100).toFixed(2)}%</b></div>`).join("") +
            `<div class="kv"><span>${L("v2.gMiss")}</span><b>${((pool.miss / total) * 100).toFixed(2)}%</b></div>`;
    }

    function renderBag() {
        const items = [];
        me?.bag.forEach((row, c) => row.forEach((n, i) => { if (n > 0) items.push({ c, i, n }); }));
        $("v2Bag").innerHTML = items.length
            ? items.map(({ c, i, n }) => `<div class="it">${layerUrl(c, i) ? `<img src="${esc(layerUrl(c, i))}" alt="" loading="lazy">` : ""}<b>× ${n}</b>${esc(optName(c, i))}<br>${tierTag(tierOf(c, i))}</div>`).join("")
            : `<p class="small muted">${L("v2.bagEmpty")}</p>`;
    }

    function renderGallery() {
        const g = $("v2Gallery");
        if (!me?.tokens.length) { g.innerHTML = `<p class="muted">${me ? L("v2.myNone") : L("mine.locked")}</p>`; return; }
        g.innerHTML = me.tokens.map((k) => `<div class="g"><div class="stack" data-id="${k.id}"><img src="${SITE}/v2/images/${k.id}.png?v=${pack(k.t)}" alt="" loading="lazy"></div>
  <div class="meta"><b>#${k.id}</b><button class="alt" data-change="${k.id}">${L("v2.toChange")}</button></div></div>`).join("");
        g.querySelectorAll(".stack img").forEach((img) => (img.onerror = () => { const box = img.parentElement; const k = me.tokens.find((x) => x.id === Number(box.dataset.id)); if (k) drawStack(box, k.t); }));
        g.querySelectorAll("[data-change]").forEach((b) => (b.onclick = () => { setMode("change", Number(b.dataset.change)); $("v2Workshop").scrollIntoView(); }));
    }

    /* ── 工坊 ── */
    function renderWorkshop() {
        if (!T) return;
        const pick = $("v2Pick");
        const ids = me?.tokens.map((k) => k.id) ?? [];
        pick.innerHTML = ids.map((id) => `<option value="${id}">#${id}</option>`).join("");
        if (mode === "change") {
            if (!ids.includes(pickId)) pickId = ids[0] ?? null;
            pick.value = pickId ?? "";
        }
        $("v2PickRow").hidden = mode !== "change";
        $("v2Slots").innerHTML = T.categories.map((cat, c) => `<label class="slot"><span>${esc(cat.trait_type)}</span><select data-cat="${c}">${cat.options.map((o, i) => {
            const t = o.tier;
            const have = me?.bag[c]?.[i] ?? 0;
            return `<option value="${i}">${esc(optName(c, i))}${t !== "normal" ? `　【${L("v2.tier." + t)}・${L("v2.have", { n: have })}】` : ""}</option>`;
        }).join("")}</select></label>`).join("");
        $("v2Slots").querySelectorAll("select").forEach((s) => { s.value = sel[Number(s.dataset.cat)]; s.onchange = () => { sel[Number(s.dataset.cat)] = Number(s.value); update(); }; });
        update();
    }
    function setMode(m, id) {
        mode = m;
        $("v2ModeNew").classList.toggle("on", m === "new");
        $("v2ModeChange").classList.toggle("on", m === "change");
        if (m === "change") {
            pickId = id ?? pickId ?? me?.tokens[0]?.id ?? null;
            const k = me?.tokens.find((x) => x.id === pickId);
            if (k) sel = [...k.t];
        }
        renderWorkshop();
    }
    let checkSeq = 0;
    async function update() {
        drawStack($("v2Preview"), sel);
        const st = $("v2Status");
        const go = $("v2Go");
        const cur = mode === "change" ? me?.tokens.find((x) => x.id === pickId) : null;
        const fee = mode === "new" ? info.fee.custom : info.fee.change;
        go.textContent = `${mode === "new" ? L("v2.mintCustom") : L("v2.change")}・${price(fee)}`;
        const lines = [];
        const need = [], back = [], missing = [];
        for (let c = 0; c < CATS; c++) {
            if (cur && cur.t[c] === sel[c]) continue;
            if (tierOf(c, sel[c]) !== "normal") { need.push(optName(c, sel[c])); if (!((me?.bag[c]?.[sel[c]] ?? 0) > 0)) missing.push(optName(c, sel[c])); }
            if (cur && opts[c].rare[cur.t[c]]) back.push(optName(c, cur.t[c]));
        }
        if (need.length) lines.push(L("v2.needItem", { list: need.join("、") }));
        if (back.length) lines.push(L("v2.returnItem", { list: back.join("、") }));
        missing.forEach((n) => lines.push(`<span class="err">${esc(L("v2.noItem", { n }))}</span>`));
        let ok = !!me && !missing.length;
        if (!me) lines.push(L("mine.locked"));
        else if (!me.vip) { lines.push(`<span class="warn">${L("v2.needVip")}</span>`); ok = false; }
        if (mode === "new" && !info.sale) { lines.push(L("v2.err.SaleClosed")); ok = false; }
        if (mode === "change" && !cur) ok = false;
        const seq = ++checkSeq;
        st.innerHTML = lines.map((x) => `<div>${x}</div>`).join("") + `<div class="muted">…</div>`;
        go.disabled = true;
        let owner;
        try { owner = await nft.comboOwner(sel); } catch (_) { owner = null; }
        if (seq !== checkSeq) return;
        let avail;
        if (cur && pack(cur.t) === pack(sel)) { avail = `<span class="muted">${L("v2.same")}</span>`; ok = false; }
        else if (owner === null) avail = "—";
        else if (owner === E.MaxUint256) avail = `<span class="ok">${L("v2.free2")}</span>`;
        else { avail = `<span class="err">${L("v2.taken", { id: owner })}</span>`; ok = false; }
        st.innerHTML = `<div>${avail}</div>` + lines.map((x) => `<div>${x}</div>`).join("");
        go.disabled = !ok;
    }
    function shuffle() {
        sel = T.categories.map((cat, c) => {
            const pool2 = cat.options.map((o, i) => i).filter((i) => tierOf(c, i) === "normal" || (me?.bag[c]?.[i] ?? 0) > 0);
            return pool2[Math.floor(Math.random() * pool2.length)];
        });
        renderWorkshop();
    }

    /* ───────────── 隨機執行紀錄 ───────────── */
    const TOPICS = ["RandomSeed", "GachaPull", "Minted"].map((n) => iface.getEvent(n).topicHash);
    let logRows = [];
    let shown = 20;
    function rollCombo(seed) {
        return opts.map((o, c) => {
            const total = o.weights.reduce((a, b) => a + b, 0);
            const r = BigInt(E.keccak256(coder.encode(["bytes32", "uint256"], [seed, c]))) % BigInt(total);
            let acc = 0n;
            for (let i = 0; i < o.weights.length; i++) { acc += BigInt(o.weights[i]); if (r < acc) return i; }
            return -1;
        });
    }
    async function loadLog() {
        if (!nft || !C.v2DeployBlock) return;
        const key = `asc-v2log:${C.nftV2.toLowerCase()}`;
        let cache = null;
        try { cache = JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { /* 沒有儲存空間 */ }
        cache = cache ?? { last: C.v2DeployBlock - 1, logs: [] };
        const latest = await A.provider.getBlockNumber();
        let step = 20000;
        for (let start = cache.last + 1; start <= latest;) {
            const end = Math.min(start + step - 1, latest);
            try {
                const got = await A.provider.getLogs({ address: C.nftV2, fromBlock: start, toBlock: end, topics: [TOPICS] });
                for (const l of got) cache.logs.push({ b: l.blockNumber, i: l.index, h: l.transactionHash, topics: l.topics, data: l.data });
                cache.last = end;
                start = end + 1;
            } catch (e) {
                if (step <= 500) break;
                step = Math.floor(step / 2);
            }
        }
        try { localStorage.setItem(key, JSON.stringify(cache)); } catch (_) { /* 空間不足 */ }
        const evs = cache.logs.map((l) => ({ ...l, ev: (() => { try { return iface.parseLog({ topics: l.topics, data: l.data }); } catch (_) { return null; } })() })).filter((x) => x.ev);
        const byTx = new Map();
        evs.forEach((x) => { if (!byTx.has(x.h)) byTx.set(x.h, []); byTx.get(x.h).push(x); });
        logRows = [];
        for (const x of evs) {
            if (x.ev.name !== "RandomSeed") continue;
            const a = x.ev.args;
            const same = byTx.get(x.h);
            const row = { b: x.b, i: x.i, h: x.h, user: a.user, purpose: Number(a.purpose), ref: a.ref, prev: a.prevBlockHash, rnd: a.prevrandao, nonce: a.nonce, seed: a.seed };
            row.seedOk = E.keccak256(coder.encode(["bytes32", "uint256", "address", "uint256"], [a.prevBlockHash, a.prevrandao, a.user, a.nonce])) === a.seed;
            if (row.purpose === 1) {
                const m = same.find((y) => y.ev.name === "Minted" && y.ev.args.tokenId === a.ref);
                row.traits = m ? unpack(m.ev.args.traits) : null;
                let s = a.seed;
                row.k = -1;
                for (let k = 0; k < 20 && row.traits; k++) { if (rollCombo(s).join() === row.traits.join()) { row.k = k; break; } s = E.keccak256(coder.encode(["bytes32"], [s])); }
                row.ok = row.seedOk && row.k >= 0;
            } else {
                const g = same.find((y) => y.ev.name === "GachaPull" && y.ev.args.seed === a.seed);
                if (g) {
                    const ga = g.ev.args;
                    row.hit = ga.hit; row.cat = Number(ga.cat); row.idx = Number(ga.idx);
                    const rollOk = ga.roll === BigInt(a.seed) % ga.totalWeight;
                    let acc = 0n, want = null;
                    for (const p of pool.prizes) { acc += BigInt(p.weight); if (ga.roll < acc) { want = p; break; } }
                    const prizeOk = want ? ga.hit && want.cat === row.cat && want.idx === row.idx : !ga.hit;
                    row.roll = ga.roll; row.total = ga.totalWeight;
                    row.ok = row.seedOk && rollOk && prizeOk;
                }
            }
            logRows.push(row);
        }
        logRows.sort((p, q) => q.b - p.b || q.i - p.i);
        renderLog();
    }
    const times = new Map();
    async function renderLog() {
        const body = $("v2LogBody");
        if (!logRows.length) { body.innerHTML = `<tr><td colspan="6" class="muted">${L("v2.logEmpty")}</td></tr>`; $("v2LogMore").hidden = true; return; }
        const rows = logRows.slice(0, shown);
        await Promise.all([...new Set(rows.map((r) => r.b))].filter((b) => !times.has(b)).map(async (b) => times.set(b, (await A.provider.getBlock(b).catch(() => null))?.timestamp ?? 0)));
        const tname = (t) => t.map((v, c) => optName(c, v)).join(" / ");
        body.innerHTML = rows.map((r) => {
            const ts = times.get(r.b);
            const when = ts ? new Date(ts * 1000).toLocaleString(A.lang === "zh" ? "zh-TW" : "en-GB", { timeZone: "Asia/Taipei", hour12: false }) : "";
            const what = r.purpose === 1 ? L("v2.what.mint", { id: r.ref }) : L("v2.what.gacha", { n: Number(r.ref) + 1 });
            const result = r.purpose === 1 ? (r.traits ? esc(tname(r.traits)) + (r.k > 0 ? L("v2.reroll", { k: r.k }) : "") : "—")
                : r.hit === undefined ? "—" : r.hit ? `${esc(optName(r.cat, r.idx))} ${tierTag(tierOf(r.cat, r.idx))}<div class="faint">roll ${r.roll} / ${r.total}</div>` : `${L("v2.gMiss")}<div class="faint">roll ${r.roll} / ${r.total}</div>`;
            return `<tr><td>${when}<div>${link(`tx/${r.h}`, "#" + r.b)}</div></td><td>${link(`address/${r.user}`, short(r.user))}</td><td>${what}</td>
<td><code>prevHash ${r.prev.slice(0, 10)}…<br>prevrandao ${String(r.rnd).slice(0, 12)}${String(r.rnd).length > 12 ? "…" : ""}<br>nonce ${r.nonce}<br>seed ${r.seed.slice(0, 10)}…</code></td>
<td>${result}</td><td>${r.ok ? `<span class="ok">${L("v2.ok")}</span>` : `<span class="err">${L("v2.bad")}</span>`}</td></tr>`;
        }).join("");
        $("v2LogMore").hidden = logRows.length <= shown;
    }

    /* ───────────── 按鈕 ───────────── */
    document.addEventListener("DOMContentLoaded", () => {
        if (!nft) { $("v2NotSet").hidden = false; return; }
        $("v2RandomBtn").onclick = async () => {
            const rc = await payThen($("v2TopMsg"), L("v2.random"), info.fee.random, (c) => c.randomMint());
            const m = rc && logsOf(rc, "Minted")[0];
            if (m) { $("v2TopMsg").innerHTML += ` → #${m.args.tokenId}`; sel = unpack(m.args.traits); mode = "new"; renderWorkshop(); loadLog(); }
        };
        $("v2VipBtn").onclick = () => payThen($("v2TopMsg"), L("v2.buyVip", { p: U(info.fee.vip) }), info.fee.vip, (c) => c.buyVip());
        $("v2ClaimBtn").onclick = () => payThen($("v2TopMsg"), L("v2.claim", { ids: me.claimable.map((i) => "#" + i).join(" ") }), 0n, (c) => c.claim(me.claimable));
        $("v2ModeNew").onclick = () => setMode("new");
        $("v2ModeChange").onclick = () => setMode("change");
        $("v2Pick").onchange = () => setMode("change", Number($("v2Pick").value));
        $("v2Shuffle").onclick = shuffle;
        $("v2Go").onclick = async () => {
            const t = [...sel];
            if (mode === "new") await payThen($("v2WsMsg"), L("v2.mintCustom"), info.fee.custom, (c) => c.customMint(t));
            else await payThen($("v2WsMsg"), `${L("v2.change")} #${pickId}`, info.fee.change, (c) => c.changeTraits(pickId, t));
        };
        const pull = async (n) => {
            const rc = await payThen($("v2GMsg"), n === 1 ? L("v2.g1") : L("v2.g10"), info.fee.gacha * BigInt(n), (c) => c.gacha(n));
            if (!rc) return;
            const res = logsOf(rc, "GachaPull").map((g) => (g.args.hit ? `<span class="hit">${esc(optName(Number(g.args.cat), Number(g.args.idx)))}</span>` : `<span>${L("v2.gMiss")}</span>`));
            $("v2GResult").innerHTML = `<div class="small muted">${L("v2.gResult")}</div><div class="gres">${res.join("")}</div>`;
            loadLog();
        };
        $("v2G1").onclick = () => pull(1);
        $("v2G10").onclick = () => pull(10);
        $("v2LogMore").onclick = () => { shown += 20; renderLog(); };
        $("v2LogBody").innerHTML = `<tr><td colspan="6" class="muted">${L("v2.logLoading")}</td></tr>`;
    });
    A.onUpdate(() => load().then(() => { if (!logRows.length && opts) loadLog().catch((e) => console.warn("V2 log", e)); }));
    A.onLang(() => { render(); renderLog(); });
})();
