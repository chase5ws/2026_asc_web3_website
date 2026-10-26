/* 金庫走勢：讀 v2/price.json（GitHub Action 產生），再用鏈上事件補到最新區塊（算法跟 sync_v2.py 的 sync_price 相同） */
(() => {
    const { C, E, ro, getLogs } = window.ASCChain;
    const A = C.assets.replace(/\/$/, "");
    const SIGS = ["Transfer(address,address,uint256)", "Bought(address,uint256,uint256)", "Exchanged(address,uint256,uint256)", "ExchangeFee(uint256,uint256,uint256)",
        "OwnerDeposited(uint256,uint256)", "ReserveWithdrawn(address,uint256,uint256)", "FeeToReserve(address,uint256,uint256)", "PeriodReset(uint256,uint256)", "Shutdown(uint256)", "StartPriceChanged(uint256)"];
    const TOPIC = Object.fromEntries(SIGS.map((s) => [E.id(s), s.split("(")[0]]));
    const MAX = 1_000_000n;
    let cache = null;

    function value(s) {
        const reserve = s.od / 2n + s.rf - s.ro;
        const res = reserve > 0n ? reserve : 0n;
        let avail = s.bal - res - s.ln;
        if (avail < 0n) avail = 0n;
        if (s.sup === 0n || avail === 0n) return s.sp;
        let v = avail / s.sup;
        if (v < 1n) v = 1n;
        return v > MAX ? MAX : v;
    }
    const w = (data, i) => BigInt("0x" + data.slice(2 + 64 * i, 2 + 64 * (i + 1)));
    function apply(s, name, l) {
        const d = l.data;
        if (name === "Transfer") {
            const v = w(d, 0);
            if (BigInt(l.topics[1]) === 0n) s.sup += v;
            if (BigInt(l.topics[2]) === 0n) s.sup -= v;
        } else if (name === "Bought") s.bal += w(d, 0);
        else if (name === "Exchanged") s.bal -= w(d, 1);
        else if (name === "ExchangeFee") { s.rf += w(d, 0); s.ln += w(d, 1); }
        else if (name === "OwnerDeposited") { s.bal += w(d, 0); s.od = w(d, 1); }
        else if (name === "ReserveWithdrawn") { s.bal -= w(d, 0); s.ro += w(d, 0); }
        else if (name === "FeeToReserve") s.rf += w(d, 1);
        else if (name === "PeriodReset" || name === "Shutdown") s.ln = 0n;
        else if (name === "StartPriceChanged") s.sp = w(d, 0);
    }

    /** 回傳 [{t: 秒, v: 每 1 ASC 的 USDT 最小單位(Number)}] */
    async function history(startPrice) {
        let p = cache;
        if (!p) {
            const j = await fetch(`${A}/v2/price.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
            if (j && j.vault === C.vault.toLowerCase()) {
                p = { last: j.lastBlock, s: Object.fromEntries(Object.entries(j.s).map(([k, v]) => [k, BigInt(v)])), pts: j.points.map(([b, t, v]) => ({ b, t, v: Number(v) })) };
            } else {
                p = { last: C.vaultBlock - 1, s: { bal: 0n, od: 0n, rf: 0n, ro: 0n, ln: 0n, sup: 0n, sp: BigInt(startPrice || 0) }, pts: [] };
            }
        }
        const head = await ro.getBlockNumber();
        if (head > p.last) {
            const logs = await getLogs({ address: C.vault, topics: [Object.keys(TOPIC)] }, p.last + 1, head);
            const byBlock = new Map();
            for (const l of logs) { apply(p.s, TOPIC[l.topics[0]], l); byBlock.set(l.blockNumber, value(p.s)); }
            for (const [b, v] of byBlock) {
                if (p.pts.length && p.pts[p.pts.length - 1].v === Number(v)) continue;
                const blk = await ro.getBlock(b);
                p.pts.push({ b, t: blk.timestamp, v: Number(v) });
            }
            p.last = head;
        }
        cache = p;
        return p.pts;
    }

    window.ASCPrice = { history };
})();
