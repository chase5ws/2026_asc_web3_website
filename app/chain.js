/* 鏈：讀合約、連錢包、送交易（ethers v6，window.ethers） */
(() => {
    const C = window.ASC_CONFIG;
    const E = window.ethers;
    const ERRORS = [
        "error ZeroAddress()", "error ZeroAmount()", "error ExchangeClosed()", "error NotEnoughPoints(uint256 balance)", "error AmountTooSmall()",
        "error ExceedsAvailable(uint256 available)", "error OverPeriodCap(uint256 remaining, uint256 resetAt)", "error NoGateNft()", "error NotVerified(address account)",
        "error Flagged(address account)", "error OverDepositCap(uint256 remaining)", "error DepositClosed()", "error IsShutdown()", "error InvalidReceiver(address to)",
        "error SaleClosed()", "error SoldOut()", "error NoAllowance()", "error NotVip()", "error VipNotForSale()", "error NotTokenOwner(uint256 tokenId)",
        "error NotRevealed(uint256 tokenId)", "error AlreadyRevealed(uint256 tokenId)", "error NoChange()", "error BadAmount()", "error EmptyPool()", "error WalletFrozen(address account)",
        "error OnlyWallet()", "error NotSeller()", "error NotActive()", "error TooMuch(uint256 remaining)", "error PriceChanged()", "error SelfTrade()", "error OverTradeCap(uint256 cap)",
        "error EnforcedPause()", "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)", "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
        "error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)", "error ERC1155MissingApprovalForAll(address operator, address owner)"
    ];
    const ABI = {
        vault: [
            ...ERRORS,
            "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function allowance(address,address) view returns (uint256)",
            "function approve(address,uint256) returns (bool)", "function transfer(address,uint256) returns (bool)",
            "function info(address) view returns (uint256[11] pool, uint256[7] me)", "function userStatus(address) view returns (bool verified, bool flagged, uint256 depositedThisPeriod, uint256 depositCap)",
            "function buyPrice() view returns (uint256)", "function previewDeposit(uint256) view returns (uint256)",
            "function previewExchange(address,uint256) view returns (uint256 share, uint256 get, uint256 toReserve, uint256 toNext)",
            "function deposit(uint256) returns (uint256)", "function exchange(uint256) returns (uint256)",
            "function transferTaxBps() view returns (uint256)", "function flagPenaltyBps() view returns (uint256)", "function verifiedOnly() view returns (bool)",
            "function depositOpen() view returns (bool)", "function shutdown() view returns (bool)", "function isExempt(address) view returns (bool)",
            "function keepDays(uint256) view returns (uint16)", "function keepRates(uint256) view returns (uint16)", "function feeToReserveBps() view returns (uint16)", "function feeToNextBps() view returns (uint16)",
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ],
        nft: [
            ...ERRORS,
            "function info(address) view returns (uint256[8] s, uint256[4] me)", "function vipPrice() view returns (uint256)", "function vipDays() view returns (uint256)",
            "function isVip(address) view returns (bool)", "function frozen(address) view returns (bool)", "function paused() view returns (bool)",
            "function gachaPool() view returns (tuple(uint32 partId, uint16 weight)[] prizes, uint32 miss)",
            "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)", "function isRevealed(uint256) view returns (bool)", "function ownerOf(uint256) view returns (address)",
            "function randomMint() returns (uint256)", "function reveal(uint256[])", "function equip(uint256,uint256[],uint256[])",
            "function buyVip(uint256)", "function buyPulls(uint256)", "function gacha(uint256)",
            "event Minted(uint256 indexed tokenId, address indexed to, uint8 kind)", "event PresetMinted(uint256 indexed tokenId, uint256 ref)",
            "event Revealed(uint256 indexed tokenId, address indexed owner)", "event Equipped(uint256 indexed tokenId, address indexed owner, uint256[] partIds, uint256[] clearSlots)",
            "event RandomSeed(address indexed user, uint8 indexed purpose, uint256 indexed ref, bytes32 prevBlockHash, uint256 prevrandao, uint256 nonce, bytes32 seed)",
            "event GachaPull(address indexed user, bytes32 seed, uint256 roll, uint256 totalWeight, bool hit, uint256 partId)"
        ],
        parts: [
            ...ERRORS,
            "function balancesOf(address,uint256[]) view returns (uint256[])", "function isApprovedForAll(address,address) view returns (bool)", "function setApprovalForAll(address,bool)"
        ],
        market: [
            ...ERRORS,
            "function feeBps() view returns (uint256)", "function flagFeeBps() view returns (uint256)", "function maxTradeValue() view returns (uint256)", "function paused() view returns (bool)",
            "function listingCount() view returns (uint256)", "function listings(uint256,uint256) view returns (tuple(address seller, uint256 id, uint256 remaining, uint256 unitPrice, bool active)[])",
            "function listPart(uint256,uint256,uint256) returns (uint256)", "function buy(uint256,uint256,uint256)", "function cancel(uint256)"
        ],
        usdt: ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]
    };
    const ERR_IFACE = new E.Interface(ERRORS);

    const ro = new E.JsonRpcProvider(C.rpcUrl, C.chainId, { staticNetwork: true, batchMaxCount: 20 });
    const read = {};
    for (const k of Object.keys(ABI)) read[k] = new E.Contract(C[k], ABI[k], ro);

    let account = null;
    let browser = null;
    const listeners = new Set();
    const emit = () => listeners.forEach((f) => { try { f(account); } catch (e) { console.error(e); } });

    async function ensureChain() {
        const hex = "0x" + C.chainId.toString(16);
        const now = await window.ethereum.request({ method: "eth_chainId" });
        if (now === hex) return;
        try {
            await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
        } catch (e) {
            if (e.code !== 4902) throw e;
            await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: C.chainName, nativeCurrency: { name: C.currency, symbol: C.currency, decimals: 18 }, rpcUrls: [C.rpcUrl], blockExplorerUrls: [C.explorer] }] });
        }
    }

    async function connect() {
        if (!window.ethereum) throw new Error("NO_WALLET");
        const accs = await window.ethereum.request({ method: "eth_requestAccounts" });
        await ensureChain();
        account = accs[0] ? E.getAddress(accs[0]) : null;
        emit();
        return account;
    }

    async function silent() {
        if (!window.ethereum) return;
        try {
            const accs = await window.ethereum.request({ method: "eth_accounts" });
            if (accs[0]) { account = E.getAddress(accs[0]); emit(); }
        } catch (_) {}
        window.ethereum.on?.("accountsChanged", (a) => { account = a[0] ? E.getAddress(a[0]) : null; emit(); });
        window.ethereum.on?.("chainChanged", () => emit());
    }

    async function signer() {
        if (!account) await connect();
        await ensureChain();
        browser = browser || new E.BrowserProvider(window.ethereum, "any");
        return browser.getSigner(account);
    }
    const write = async (k) => new E.Contract(C[k], ABI[k], await signer());

    /** 錯誤 → { name, args }（合約自訂錯誤）或 { code }（使用者取消、餘額不足） */
    function explain(e) {
        if (e?.code === "ACTION_REJECTED" || e?.code === 4001 || e?.info?.error?.code === 4001) return { code: "REJECTED" };
        if (e?.message === "NO_WALLET") return { code: "NO_WALLET" };
        if (e?.revert?.name) return { name: e.revert.name, args: e.revert.args };
        const datas = [e?.data, e?.info?.error?.data, e?.info?.error?.data?.data, e?.error?.data, e?.error?.data?.data].filter((d) => typeof d === "string" && d.startsWith("0x"));
        for (const d of datas) {
            try { const p = ERR_IFACE.parseError(d); if (p) return { name: p.name, args: p.args }; } catch (_) {}
        }
        if (/insufficient funds/i.test(e?.message || "")) return { code: "GAS" };
        return { code: "OTHER", msg: e?.shortMessage || e?.reason || e?.message || String(e) };
    }

    /** ERC-20 授權：不夠才送 approve（ASC 0 位小數；USDT 6 位小數） */
    async function approve(token, spender, amount, onStep) {
        if (amount <= 0n) return;
        const have = await read[token].allowance(account, spender);
        if (have >= amount) return;
        onStep?.("approve");
        const c = await write(token);
        const tx = await c.approve(spender, amount);
        onStep?.("pending", tx.hash);
        await tx.wait();
    }

    async function getLogs(filter, from, to, step = 9000) {
        const out = [];
        for (let a = from; a <= to; a += step) {
            const b = Math.min(a + step - 1, to);
            let tries = 0;
            for (;;) {
                try { out.push(...(await ro.getLogs({ ...filter, fromBlock: a, toBlock: b }))); break; }
                catch (e) { if (++tries > 2) throw e; await new Promise((r) => setTimeout(r, 800 * tries)); }
            }
        }
        return out;
    }

    window.ASCChain = {
        C, E, ABI, ro, read, write, connect, silent, signer, explain, approve, getLogs, ensureChain,
        get account() { return account; },
        onAccount: (f) => listeners.add(f),
        short: (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : ""),
        link: (kind, v) => `${C.explorer}/${kind}/${v}`
    };
})();
