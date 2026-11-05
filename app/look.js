/* 外觀：traits.json、配件清單、每顆喵武士現在穿什麼（跟 2026_asc_web3_ipfs/scripts/sync_v2.py 同一套算法） */
(() => {
    const { C, E, read, ro, getLogs } = window.ASCChain;
    const A = C.assets.replace(/\/$/, "");
    const L = { traits: null, cats: [], parts: [], byPid: {}, state: { tokens: {}, lastBlock: 0 }, overrides: {}, tokens: {}, scanned: 0 };

    const getJson = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const weight = (o) => Number(o.weight ?? L.traits.weights?.[o.tier || "normal"] ?? 0);
    const empty = (cat) => cat.options.find((o) => !o.file) || null;
    const REWIND = 30; // 約 1 分鐘的區塊
    const layerUrl = (f) => `${A}/${f.split("/").map(encodeURIComponent).join("/")}`;

    async function loadTraits() {
        L.traits = await getJson(`${A}/traits.json`);
        if (!L.traits) throw new Error("讀不到 traits.json");
        // 活動背景（"badges": true 的部位，放在 categories 最後面）：不是 ERC-1155 配件，由活動徽章合約決定，另外存在 L.bgCat
        L.cats = L.traits.categories.filter((c) => !c.badges);
        L.bgCat = L.traits.categories.find((c) => c.badges) || null;
        L.bgOpts = {};
        for (const o of L.bgCat?.options || []) if (o.badge != null && o.file) L.bgOpts[Number(o.badge)] = { ...o, layer: layerUrl(o.file) };
        L.parts = [];
        L.cats.forEach((cat, c) => cat.options.forEach((o, i) => {
            if (!o.file) return;
            const p = { pid: c * 256 + i, slot: c, cat: cat.trait_type, name: o.name, zh: o.zh || null, tier: o.tier || "normal", layer: layerUrl(o.file), thumb: `${A}/v2/thumbs/${c * 256 + i}.png` };
            L.parts.push(p);
            L.byPid[p.pid] = p;
        }));
    }

    function rollTraits(seed) {
        const out = {};
        L.cats.forEach((cat, c) => {
            const opts = cat.options.filter((o) => weight(o) > 0);
            const total = opts.reduce((s, o) => s + weight(o), 0);
            if (!total) { const e = empty(cat); if (e) out[cat.trait_type] = e.name; return; }
            const h = BigInt(E.keccak256(E.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [seed, c])));
            const r = Number(h % BigInt(total));
            let acc = 0;
            for (const o of cat.options) { acc += weight(o); if (weight(o) && r < acc) { out[cat.trait_type] = o.name; break; } }
        });
        return out;
    }

    const v1Cache = {};
    async function v1Traits(ref) {
        if (!v1Cache[ref]) {
            const m = await getJson(`${A}/metadata/${ref}.json`);
            const out = {};
            for (const a of m?.attributes || []) if (L.cats.some((c) => c.trait_type === a.trait_type)) out[a.trait_type] = L.traits.aliases?.[a.trait_type]?.[a.value] ?? a.value;
            v1Cache[ref] = out;
        }
        return { ...v1Cache[ref] };
    }

    function applyEquip(tok, partIds, clearSlots) {
        tok.traits = tok.traits || {};
        for (const pid of partIds) {
            const c = Math.floor(pid / 256), i = pid % 256;
            if (L.cats[c]?.options[i]) tok.traits[L.cats[c].trait_type] = L.cats[c].options[i].name;
        }
        for (const c of clearSlots) { const e = L.cats[c] && empty(L.cats[c]); if (e) tok.traits[L.cats[c].trait_type] = e.name; }
    }

    /** 讀 v2/state.json，再補上它之後的鏈上事件（Action 不是每 10 分鐘都準時跑） */
    async function sync() {
        if (!L.traits) await loadTraits();
        if (!L.scanned) {
            const st = await getJson(`${A}/v2/state.json`);
            L.overrides = (await getJson(`${A}/v2/overrides.json`)) || {};
            const ok = st && st.contract === C.nft.toLowerCase();
            L.tokens = ok ? JSON.parse(JSON.stringify(st.tokens)) : {};
            L.scanned = ok ? st.lastBlock : C.nftBlock - 1;
        }
        const head = await ro.getBlockNumber();
        if (head <= L.scanned) return;
        const nft = read.nft;
        const topics = ["Minted", "PresetMinted", "Revealed", "Equipped", "RandomSeed"].map((n) => nft.interface.getEvent(n).topicHash);
        const logs = await getLogs({ address: [C.nft, C.wardrobe].filter(Boolean), topics: [topics] }, L.scanned + 1, head);
        logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
        for (const l of logs) {
            const ev = nft.interface.parseLog(l);
            if (!ev) continue;
            if (ev.name === "RandomSeed") {
                if (Number(ev.args.purpose) !== 1) continue;
                const t = (L.tokens[String(ev.args.ref)] ||= {});
                t.seed ||= ev.args.seed;
                continue;
            }
            const id = String(ev.args.tokenId);
            const t = (L.tokens[id] ||= {});
            if (ev.name === "Minted") { t.kind = Number(ev.args.kind); t.revealed ??= false; t.block = l.blockNumber; }
            else if (ev.name === "PresetMinted") t.ref = Number(ev.args.ref);
            else if (ev.name === "Revealed") t.revealed = true;
            else if (ev.name === "Equipped" && t.traits) applyEquip(t, ev.args.partIds.map(Number), ev.args.clearSlots.map(Number));
            if (!t.traits) {
                if (t.ref != null) t.traits = await v1Traits(t.ref);
                else if (t.seed && (t.kind === 1 || t.kind === 2)) t.traits = rollTraits(t.seed);
            }
        }
        for (const t of Object.values(L.tokens)) if (!t.traits && t.seed && (t.kind === 1 || t.kind === 2)) t.traits = rollTraits(t.seed);
        // 公開 RPC 是多台節點輪流回應，剛上鏈的事件有時還查不到：下次再多掃最後 REWIND 個區塊（事件重複套用結果相同）
        L.scanned = Math.max(C.nftBlock - 1, head - REWIND);
    }

    /** 強制重讀：丟掉快取，下次 sync 從 v2/state.json 重新讀起再補鏈上事件（換裝頁的「刷新」） */
    function reset() {
        L.scanned = 0;
    }

    /** 每個部位最後的選項：[{cat, slot, opt, part}]（沒穿＝不穿選項；沒有不穿選項的部位就沒有） */
    function picks(traits) {
        const out = [];
        L.cats.forEach((cat, slot) => {
            const name = traits?.[cat.trait_type];
            let opt = name ? cat.options.find((o) => o.name === name) : null;
            if (!opt) opt = empty(cat);
            if (opt) out.push({ cat: cat.trait_type, slot, opt, part: opt.file ? L.byPid[slot * 256 + cat.options.indexOf(opt)] : null });
        });
        return out;
    }
    function lookOf(id) {
        const t = L.tokens[String(id)];
        if (!t) return null;
        return { ...t, picks: picks({ ...(t.traits || {}), ...(L.overrides[String(id)] || {}) }) };
    }
    function drawOrder(list) {
        const order = L.traits.order || L.cats.map((c) => c.trait_type);
        const rank = (c) => (order.includes(c.cat) ? order.indexOf(c.cat) : order.length + c.slot);
        return [...list].sort((a, b) => rank(a) - rank(b));
    }
    /** 疊圖預覽：在 box 裡放每層 <img>；bg＝活動背景的徽章編號（畫在最底層） */
    function compose(box, list, bg) {
        box.innerHTML = "";
        box.classList.add("stack");
        const b = bg && L.bgOpts[Number(bg)];
        if (b) { const im = document.createElement("img"); im.alt = ""; im.loading = "lazy"; im.src = b.layer; box.appendChild(im); }
        for (const p of drawOrder(list)) {
            if (!p.opt?.file) continue;
            const im = document.createElement("img");
            im.alt = "";
            im.loading = "lazy";
            im.src = layerUrl(p.opt.file);
            box.appendChild(im);
        }
    }
    const tierOf = (list) => (list.some((p) => p.opt.tier === "super") ? "super" : list.some((p) => p.opt.tier === "rare") ? "rare" : "normal");
    const imageOf = (id) => `${A}/v2/images/${id}.png`;
    /** 這隻現在有效的活動背景（徽章編號，0＝沒有）：ui.js 每次讀鏈時用 backgroundsOf 更新 L.bg */
    L.bg = {};
    // 順序跟出圖同步（sync_v2.py）一樣：鏈上有穿 → v2/overrides.json 的 Background（測試／手動）→ 沒有（透明）
    const bgOf = (id) => {
        const k = String(id), chain = Number(L.bg[k] ?? L.tokens[k]?.bg ?? 0);
        if (chain) return chain;
        const name = L.overrides[k]?.Background;
        const hit = name && Object.entries(L.bgOpts || {}).find(([, o]) => o.name === name);
        return hit ? Number(hit[0]) : 0;
    };

    window.ASCLook = { L, loadTraits, sync, reset, applyEquip, v1Traits, lookOf, picks, compose, drawOrder, tierOf, imageOf, bgOf, empty, rollTraits, A };
})();
