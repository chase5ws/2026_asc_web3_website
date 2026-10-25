/* 信物 NFT：鑄造數量、白名單狀態、我的信物與鑄造（合約介面可能不同，讀不到的欄位就隱藏） */
(function () {
    const A = window.ASC;
    const { $, L, E, C, esc, say, short, link } = A;
    const NFT_ABI = [
        "function name() view returns (string)", "function totalSupply() view returns (uint256)",
        "function maxSupply() view returns (uint256)", "function MAX_SUPPLY() view returns (uint256)",
        "function allowListMintOpen() view returns (bool)", "function allowList(address) view returns (bool)",
        "function balanceOf(address) view returns (uint256)", "function tokenOfOwnerByIndex(address, uint256) view returns (uint256)",
        "function tokenURI(uint256) view returns (string)", "function allowListMint() payable"
    ];
    const nft = E && C.nft ? new E.Contract(C.nft, NFT_ABI, A.provider) : null;
    const ipfs = (u) => (String(u || "").startsWith("ipfs://") ? (C.ipfsGateway || "https://ipfs.io/ipfs/") + u.slice(7).replace(/^ipfs\//, "") : u);
    let picDone = false;

    async function render() {
        if (!nft) return;
        const opt = (p) => p.catch(() => null);
        const [name, supply, max1, max2, open] = await Promise.all([opt(nft.name()), opt(nft.totalSupply()), opt(nft.maxSupply()), opt(nft.MAX_SUPPLY()), opt(nft.allowListMintOpen())]);
        const max = Number(max1 ?? max2 ?? C.nftMaxSupply ?? 0);
        $("nftName").textContent = name ?? "—";
        $("minted").textContent = supply !== null ? `${supply}${max ? ` / ${max}` : ""}` : "—";
        $("mintBar").style.width = supply !== null && max ? `${Math.min((Number(supply) / max) * 100, 100)}%` : "0";
        $("wlRow").hidden = open === null;
        if (open !== null) $("wlOpen").textContent = open ? L("open") : L("closed");
        $("nftLink").innerHTML = link(`address/${C.nft}`, L("nft.contract", { a: short(C.nft) }));
        if (!A.account) return;
        const [allowed, bal] = await Promise.all([opt(nft.allowList(A.account)), opt(nft.balanceOf(A.account))]);
        $("myNftRow").hidden = false;
        $("myNft").textContent = bal && bal > 0n ? L("nft.hold", { n: bal }) : allowed ? L("nft.allowed") : L("nft.notYet");
        $("mint").hidden = !(allowed && open);
        if (bal && bal > 0n && !picDone) {
            picDone = true;
            try {
                const id = await nft.tokenOfOwnerByIndex(A.account, 0);
                const m = await (await fetch(ipfs(await nft.tokenURI(id)), { signal: AbortSignal.timeout(6000) })).json();
                if (m.image) $("nftPic").innerHTML = `<img src="${esc(ipfs(m.image))}" alt="">`;
            } catch (_) { /* 沒有 metadata 就不顯示圖 */ }
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        $("mint").onclick = () => A.sendTx($("nftMsg"), L("nft.mint"), (c) => c.allowListMint({ value: 0 }), nft);
    });
    A.onUpdate(() => render().catch(() => {}));
})();
