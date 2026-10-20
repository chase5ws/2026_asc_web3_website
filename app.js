/* 江湖鏢局金庫網頁：直接讀 Polygon 鏈上資料，不經過任何伺服器（匯率另外向 Discord 機器人查全服點數，選填） */
const C = window.ASC_CONFIG;
const $ = (id) => document.getElementById(id);
const VAULT_ABI = [
    "function tokens() view returns (address[])",
    "function poolStatus(address) view returns (bool listed, uint256 balance, uint256 free, uint256 outstanding, uint256 round, uint256 roundBase, uint256 roundAllocated, uint256 roundLeft)",
    "function userCapBps() view returns (uint16)",
    "function roundCapBps() view returns (uint16)",
    "function paused() view returns (bool)",
    "function owed(address token, address user) view returns (uint256)",
    "function userRemaining(address token, address user) view returns (uint256)",
    "function claim(address token)",
    "function claimMany(address[] tokens)",
    "function gateNfts() view returns (address[])",
    "function canClaim(address user) view returns (bool)"
];
const NAME_ABI = ["function name() view returns (string)", "function symbol() view returns (string)"];
const ERC20_ABI = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
const NFT_ABI = [
    "function totalSupply() view returns (uint256)",
    "function allowListMintOpen() view returns (bool)",
    "function allowList(address) view returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
    "function allowListMint() payable"
];

const provider = new ethers.JsonRpcProvider(C.rpcUrl, C.chainId, { staticNetwork: true });
const vault = C.vault ? new ethers.Contract(C.vault, VAULT_ABI, provider) : null;
const nft = C.nft ? new ethers.Contract(C.nft, NFT_ABI, provider) : null;
let account = null;
let tokens = []; // [{ address, symbol, decimals, status }]
let totalPoints = null;
let gates = []; // [{ address, name }]

const fmt = (v, d, sym) => `${Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: Math.min(d, 6) })} ${sym}`;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const link = (path, text) => `<a href="${C.explorer}/${path}" target="_blank" rel="noopener">${text}</a>`;
const say = (el, text, cls) => { el.className = cls || "muted"; el.textContent = text; };
const ipfs = (u) => (String(u || "").startsWith("ipfs://") ? C.ipfsGateway + u.slice(7).replace(/^ipfs\//, "") : u);

async function loadBotStats() {
    if (!C.botApi) return;
    try {
        const r = await fetch(C.botApi.replace(/\/$/, "") + "/api/exchange/stats", { signal: AbortSignal.timeout(6000) });
        const j = await r.json();
        if (j.ok) totalPoints = BigInt(j.totalPoints);
    } catch (_) {
        totalPoints = null;
    }
}

async function loadPools() {
    if (!vault) {
        $("pools").innerHTML = '<p class="muted">金庫合約尚未設定（site/config.js 的 vault）。</p>';
        return;
    }
    const [list, userCap, roundCap, paused] = await Promise.all([vault.tokens(), vault.userCapBps(), vault.roundCapBps(), vault.paused()]);
    tokens = await Promise.all(list.map(async (address) => {
        const t = new ethers.Contract(address, ERC20_ABI, provider);
        const [symbol, decimals, status] = await Promise.all([t.symbol().catch(() => "?"), t.decimals().catch(() => 18), vault.poolStatus(address)]);
        return { address, symbol, decimals: Number(decimals), status };
    }));
    const shown = tokens.filter((t) => t.status.listed || t.status.balance > 0n);
    $("pools").innerHTML = shown.length ? shown.map((t) => {
        const s = t.status;
        const used = s.roundBase > 0n ? Number((s.roundAllocated * 10000n) / s.roundBase) / 100 : 0;
        const rate = totalPoints && totalPoints > 0n ? `每 100 點 ≈ ${fmt((100n * s.free) / totalPoints, t.decimals, t.symbol)}` : "";
        return `<div class="pool">
  <div class="row" style="justify-content:space-between"><span class="sym">${t.symbol}</span><span class="chip">${s.listed ? `第 ${s.round} 輪` : "已下架"}</span></div>
  ${rate ? `<div class="rate">${rate}</div>` : ""}
  <div class="kv"><span>未分配</span><span>${fmt(s.free, t.decimals, t.symbol)}</span></div>
  <div class="kv"><span>待玩家領取</span><span>${fmt(s.outstanding, t.decimals, t.symbol)}</span></div>
  <div class="kv"><span>本輪還能分配</span><span>${fmt(s.roundLeft, t.decimals, t.symbol)}</span></div>
  <div class="bar" title="本輪已分配 ${used}%"><i style="width:${Math.min(used / (Number(roundCap) / 100) * 100, 100)}%"></i></div>
  <div class="muted" style="font-size:12px">${link(`token/${t.address}`, short(t.address))}</div>
</div>`;
    }).join("") : '<p class="muted">金庫還沒有上架任何代幣。</p>';
    $("limits").textContent = `每個錢包每輪最多 ${Number(userCap) / 100}%、每輪全體最多 ${Number(roundCap) / 100}%（每次存款是新的一輪）${paused ? "｜目前暫停新的分配，已分配的仍可領取" : ""}${totalPoints ? `｜全服點數 ${totalPoints.toLocaleString()}` : C.botApi ? "｜機器人離線，暫時無法顯示匯率" : ""}`;
}

async function loadGates() {
    if (!vault) return;
    const list = await vault.gateNfts();
    gates = await Promise.all(list.map(async (address) => {
        const c = new ethers.Contract(address, NAME_ABI, provider);
        const name = await c.name().catch(() => c.symbol().catch(() => "NFT"));
        return { address, name };
    }));
    $("gates").innerHTML = gates.length
        ? gates.map((g) => `<div class="kv"><span>${escapeHtml(g.name)}</span><span>${link(`address/${g.address}`, short(g.address))}</span></div>`).join("")
        : "目前沒有設定門檻，任何被分配到的錢包都能領取。";
}

const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

async function loadMine() {
    if (!account || !vault) return;
    $("mine").hidden = false;
    const ok = await vault.canClaim(account);
    $("gateWarn").hidden = ok;
    if (!ok) $("gateWarn").textContent = `這個錢包沒有持有指定的 NFT（${gates.map((g) => g.name).join("、")}），暫時無法領取。金額會保留，持有任一種之後再回來領。`;
    const rows = await Promise.all(tokens.map(async (t) => ({ t, owed: await vault.owed(t.address, account), left: t.status.listed ? await vault.userRemaining(t.address, account) : 0n })));
    const has = rows.filter((r) => r.owed > 0n);
    $("owed").innerHTML = rows.filter((r) => r.owed > 0n || r.t.status.listed).map((r) => `<div class="pool">
  <span class="sym">${r.t.symbol}</span>
  <div class="kv"><span>可領取</span><span><b>${fmt(r.owed, r.t.decimals, r.t.symbol)}</b></span></div>
  <div class="kv"><span>本輪還能換</span><span>${fmt(r.left, r.t.decimals, r.t.symbol)}</span></div>
  ${r.owed > 0n ? `<button class="alt" data-claim="${r.t.address}"${ok ? "" : " disabled"}>領取 ${r.t.symbol}</button>` : ""}
</div>`).join("") || '<p class="muted">目前沒有可領取的金額。在 Discord 申請兌換、總鏢頭確認後就會出現在這裡。</p>';
    $("claimAll").disabled = has.length < 2 || !ok;
    $("claimAll").onclick = () => send((v) => v.claimMany(has.map((r) => r.t.address)), "全部領取");
    document.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = () => send((v) => v.claim(b.dataset.claim), "領取")));
}

async function loadNft() {
    if (!nft) return;
    const [supply, open] = await Promise.all([nft.totalSupply(), nft.allowListMintOpen()]);
    $("minted").textContent = `${supply} / ${C.nftMaxSupply}`;
    $("mintBar").style.width = `${Math.min(Number(supply) / C.nftMaxSupply * 100, 100)}%`;
    $("wlOpen").textContent = open ? "開放中" : "未開放";
    if (!account) return;
    const [allowed, bal] = await Promise.all([nft.allowList(account), nft.balanceOf(account)]);
    $("myNftRow").hidden = false;
    $("myNft").textContent = bal > 0n ? `持有 ${bal} 枚` : allowed ? "在白名單內，可以鑄造" : "不在白名單內";
    $("mint").hidden = !(allowed && open);
    $("mint").onclick = () => sendNft();
    if (bal > 0n) {
        try {
            const id = await nft.tokenOfOwnerByIndex(account, 0);
            const meta = await (await fetch(ipfs(await nft.tokenURI(id)), { signal: AbortSignal.timeout(6000) })).json();
            if (meta.image) {
                $("nftImg").src = ipfs(meta.image);
                $("nftImg").hidden = false;
            }
        } catch (_) { /* 沒有 metadata 就不顯示圖 */ }
    }
}

async function walletSigner() {
    if (!window.ethereum) {
        location.href = "https://metamask.app.link/dapp/" + location.host + location.pathname;
        throw new Error("請安裝 MetaMask，或用 MetaMask App 開啟此頁");
    }
    const hex = "0x" + C.chainId.toString(16);
    try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
        if (e && e.code === 4902) await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: C.chainName, nativeCurrency: { name: C.currency, symbol: C.currency, decimals: 18 }, rpcUrls: [C.rpcUrl], blockExplorerUrls: [C.explorer] }] });
        else throw e;
    }
    return new ethers.BrowserProvider(window.ethereum).getSigner();
}

async function send(fn, label) {
    const msg = $("msg");
    try {
        const signer = await walletSigner();
        say(msg, `請在錢包確認「${label}」交易…`);
        const tx = await fn(vault.connect(signer));
        say(msg, `交易已送出，等待上鏈…`);
        await tx.wait();
        say(msg, "已上鏈，更新資料中…");
        await refresh();
        msg.innerHTML = `<span class="ok">完成！</span> ${link(`tx/${tx.hash}`, "查看交易")}`;
    } catch (e) {
        say(msg, e?.code === "ACTION_REJECTED" || e?.code === 4001 ? "你取消了交易。" : `失敗：${e?.shortMessage || e?.message || e}`, "err");
    }
}

async function sendNft() {
    const msg = $("nftMsg");
    try {
        const signer = await walletSigner();
        say(msg, "請在錢包確認鑄造交易（免費，只需 Gas）…");
        const tx = await nft.connect(signer).allowListMint({ value: 0 });
        say(msg, "交易已送出，等待上鏈…");
        await tx.wait();
        say(msg, "已上鏈，更新資料中…");
        await refresh();
        msg.innerHTML = `<span class="ok">鑄造完成！回到 Discord 的信物驗證頻道按「驗證信物」。</span> ${link(`tx/${tx.hash}`, "查看交易")}`;
    } catch (e) {
        say(msg, e?.code === "ACTION_REJECTED" || e?.code === 4001 ? "你取消了交易。" : `失敗：${e?.shortMessage || e?.message || e}`, "err");
    }
}

async function connect() {
    try {
        const signer = await walletSigner();
        account = await signer.getAddress();
        $("who").textContent = short(account);
        $("connect").textContent = "重新整理";
        await refresh();
    } catch (e) {
        say($("msg"), e?.message || String(e), "err");
    }
}

async function refresh() {
    await loadBotStats();
    await Promise.all([loadPools().catch((e) => ($("pools").innerHTML = `<p class="err">讀取金庫失敗：${e.shortMessage || e.message}</p>`)), loadNft().catch(() => {}), loadGates().catch(() => {})]);
    await loadMine().catch(() => {});
}

$("connect").onclick = () => (account ? refresh() : connect());
$("foot").innerHTML = `${C.chainName}｜金庫 ${C.vault ? link(`address/${C.vault}`, short(C.vault)) : "未設定"}｜NFT ${C.nft ? link(`address/${C.nft}`, short(C.nft)) : "未設定"}｜所有資料直接讀取自區塊鏈`;
if (window.ethereum) window.ethereum.on?.("accountsChanged", () => location.reload());
refresh();
