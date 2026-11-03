/* 管理員面板：只有連結的錢包是某份合約的 owner／admin／operator（或 owner Safe 的簽署人）才會出現。
 *   一般錢包有權限 → 直接送交易；owner 是 Safe → 加入批次、下載 Safe Transaction Builder JSON。
 *   函式清單與權限見 2022_web3_solidity_asc_smart_contract/AGENTS.md 第 6 節。 */
(() => {
    const CH = window.ASCChain;
    if (!CH) return;
    const { C, E } = CH;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const lang = () => (/^zh/i.test(document.documentElement.lang || "zh") ? "zh" : "en");
    const L = (zh, en) => (lang() === "zh" ? zh : en);
    const ZERO = "0x0000000000000000000000000000000000000000";

    const KINDS = [["vault", "金庫 AscPointV2", "Vault AscPointV2"], ["nft", "喵武士 AscCatSamuraiV2", "Cat Samurai AscCatSamuraiV2"], ["parts", "配件 AscCatParts", "Parts AscCatParts"], ["market", "市場 AscMarket", "Market AscMarket"]];
    const ROLE_ABI = ["function owner() view returns (address)", "function pendingOwner() view returns (address)", "function admin() view returns (address)", "function operator() view returns (address)"];
    const SAFE_ABI = ["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)"];
    const ERRS = new E.Interface(["error NotAdmin()", "error NotOperator()", "error NotGuardian()", "error BadRoleTarget()", "error RenounceDisabled()", "error OwnableUnauthorizedAccount(address account)",
        "error BadSchedule()", "error InvalidCap()", "error NoPrice()", "error BelowMinted(uint256 minted)", "error BadFee()", "error NotFrozen(address account)", "error NotAContract(address a)",
        "error TooManyGates()", "error ZeroAddress()", "error BadAmount()", "error IsShutdown()", "error EnforcedPause()", "error ExpectedPause()"]);

    /* ── 參數型別：顯示值 → 合約值 ── */
    const split = (s) => String(s || "").split(/[\s,，、]+/).filter(Boolean);
    const T = {
        addr: (v) => E.getAddress(String(v).trim()),
        addrs: (v) => { const a = split(v).map((x) => E.getAddress(x)); if (!a.length) throw new Error(L("至少要一個地址", "Need at least one address")); return a; },
        uint: (v) => { if (!/^\d+$/.test(String(v).trim())) throw new Error(L("要填整數", "Must be a whole number")); return BigInt(String(v).trim()); },
        uints: (v) => split(v).map((x) => T.uint(x)),
        bool: (v) => v === true || v === "true",
        usdt: (v) => E.parseUnits(String(v).trim() || "0", 6),
        pct: (v) => { const n = Number(v); if (!(n >= 0 && n <= 100)) throw new Error(L("百分比 0～100", "Percent 0–100")); return BigInt(Math.round(n * 100)); },
        pct8: (v) => { const a = split(v).map((x) => Number(T.pct(x))); if (a.length !== 8) throw new Error(L("要剛好 8 個", "Need exactly 8 values")); return a; },
        int8: (v) => { const a = split(v).map((x) => Number(T.uint(x))); if (a.length !== 8) throw new Error(L("要剛好 8 個", "Need exactly 8 values")); return a; },
        str: (v) => String(v).trim()
    };
    const HINT = () => ({ addr: "0x…", addrs: L("0x…，多個用逗號或換行分隔", "0x…, separate with commas or new lines"), uint: "0", uints: "1, 2, 3", usdt: "USDT", pct: "%", pct8: "70, 75, 80, 85, 90, 94, 97, 100", int8: "0, 30, 60, 90, 120, 180, 240, 360", str: "https://…/" });
    const pct = (bps) => `${Number(bps) / 100}%`;
    const usd = (v) => `${Number(E.formatUnits(v ?? 0n, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} USDT`;
    const int = (v) => Number(v ?? 0).toLocaleString("en-US");
    const yes = (b) => (b ? L("開", "On") : L("關", "Off"));
    const when = (s) => (Number(s) ? new Date(Number(s) * 1000).toLocaleString(lang() === "zh" ? "zh-TW" : "en-US") : "–");

    /* ── 函式清單 ──  lv：operator／admin／owner（★）／pending（新主人接受）
     *   a：[參數名, 型別, 中文, English]；pre(st) 回傳預填值；warn＝送出前再確認一次 */
    const A = [
        // 金庫
        { c: "vault", lv: "operator", sig: "setVerified(address[] users,bool v)", zh: "驗證錢包", en: "Verify wallets", d: ["只限驗證開啟時，只有驗證過的錢包能存款、兌換、互轉", "When verified-only is on, only verified wallets can deposit, redeem and transfer"], a: [["users", "addrs", "錢包", "Wallets"], ["v", "bool", "驗證", "Verified"]], pre: () => ["", "true"] },
        { c: "vault", lv: "operator", sig: "setFlagged(address[] users,bool v)", zh: "標記可疑錢包", en: "Flag wallets", d: ["不能存款、不能轉出；兌換只拿回 1－被標記扣除比例", "Can't deposit or send; redeem returns only 1 − flag penalty"], a: [["users", "addrs", "錢包", "Wallets"], ["v", "bool", "標記", "Flagged"]], pre: () => ["", "true"] },
        { c: "vault", lv: "admin", sig: "setOpen(bool v)", zh: "兌換與互轉開關", en: "Redeem & transfer switch", d: ["市場也需要開啟", "The market needs this on"], a: [["v", "bool", "開啟", "Open"]], pre: (s) => [String(s.vault.open)] },
        { c: "vault", lv: "admin", sig: "setDepositOpen(bool v)", zh: "買 ASC 開關", en: "Buy ASC switch", d: ["暫停玩家用 USDT 買 ASC（兌換照常）", "Pause buying ASC with USDT (redeem still works)"], a: [["v", "bool", "開啟", "Open"]], pre: (s) => [String(s.vault.depositOpen)] },
        { c: "vault", lv: "admin", sig: "setPolicy(bool verifiedOnly_,uint256 transferTaxBps_,uint256 flagPenaltyBps_,uint256 maxDepositPerPeriod_)", zh: "防洗錢設定", en: "Anti-abuse policy", d: ["互轉稅最多 50%、被標記扣除最多 99%、每期存款上限 0＝不限", "Transfer tax ≤ 50%, flag penalty ≤ 99%, deposit cap 0 = unlimited"],
            a: [["verifiedOnly_", "bool", "只限驗證錢包", "Verified only"], ["transferTaxBps_", "pct", "互轉稅 %", "Transfer tax %"], ["flagPenaltyBps_", "pct", "被標記扣除 %", "Flag penalty %"], ["maxDepositPerPeriod_", "usdt", "每期存款上限（USDT）", "Deposit cap per period (USDT)"]],
            pre: (s) => [String(s.vault.verifiedOnly), Number(s.vault.transferTaxBps) / 100, Number(s.vault.flagPenaltyBps) / 100, E.formatUnits(s.vault.maxDepositPerPeriod, 6)] },
        { c: "vault", lv: "admin", sig: "setCap(uint256 bps)", zh: "每人每期兌換上限", en: "Redeem cap per period", d: ["池子的 %，0.01～9%", "Percent of the pool, 0.01–9%"], a: [["bps", "pct", "上限 %", "Cap %"]], pre: (s) => [Number(s.vault.capBps) / 100] },
        { c: "vault", lv: "admin", sig: "setKeepSchedule(uint16[8] days_,uint16[8] rates)", zh: "持有天數拿回比例", en: "Holding schedule", d: ["8 格：第一格 0 天、天數遞增；比例不能遞減、最多 100%", "8 steps: first is 0 days, days increasing; rates non-decreasing, max 100%"],
            a: [["days_", "int8", "天數（8 個）", "Days (8)"], ["rates", "pct8", "拿回 %（8 個）", "Get back % (8)"]], pre: (s) => [s.vault.keepDays.join(", "), s.vault.keepRates.map((r) => r / 100).join(", ")] },
        { c: "vault", lv: "admin", sig: "setFeeSplit(uint16 toReserve,uint16 toNext)", zh: "兌換手續費分配", en: "Redeem fee split", d: ["進保底 ＋ 鎖到下一期 ≤ 100%，剩下留在池子給持有者", "To reserve + to next period ≤ 100%; the rest stays for holders"], a: [["toReserve", "pct", "進保底 %", "To reserve %"], ["toNext", "pct", "鎖到下一期 %", "To next period %"]], pre: (s) => [Number(s.vault.feeToReserveBps) / 100, Number(s.vault.feeToNextBps) / 100] },
        { c: "vault", lv: "admin", sig: "reset()", zh: "立刻開新的一期", en: "Start a new period now", d: ["大家的兌換額度重算，鎖住的手續費開放", "Resets everyone's cap and unlocks locked fees"], a: [], warn: true },
        { c: "vault", lv: "admin", sig: "setStartPrice(uint256 price)", zh: "起始價", en: "Start price", d: ["還沒有匯率時 1 ASC 的價格，最高 1 USDT", "Price of 1 ASC before there is a rate, max 1 USDT"], a: [["price", "usdt", "價格（USDT）", "Price (USDT)"]], pre: (s) => [E.formatUnits(s.vault.startPrice, 6)] },
        { c: "vault", lv: "admin", sig: "setGate(address nft,bool enabled)", zh: "兌換門檻 NFT", en: "Redeem gate NFT", d: ["清單空的＝沒有門檻", "Empty list = no gate"], a: [["nft", "addr", "NFT 合約", "NFT contract"], ["enabled", "bool", "加入", "Add"]], pre: () => ["", "true"] },
        { c: "vault", lv: "admin", sig: "setOperator(address op)", zh: "設定 operator", en: "Set operator", d: ["機器人用的一般錢包（不能是 Safe）", "Bot wallet (must be a normal wallet, not a Safe)"], a: [["op", "addr", "operator", "Operator"]], pre: (s) => [s.roles.vault.operator || ""] },
        { c: "vault", lv: "owner", sig: "ownerDeposit(uint256 amount)", zh: "存入獎金池", en: "Owner deposit", d: ["owner 先 approve USDT 給金庫；50% 永久列入保底", "Approve USDT to the vault first; 50% becomes reserve"], a: [["amount", "usdt", "數量（USDT）", "Amount (USDT)"]], warn: true },
        { c: "vault", lv: "owner", sig: "withdrawReserve(uint256 amount)", zh: "提領保底", en: "Withdraw reserve", d: ["只能提領保底，玩家可兌換的部分動不到", "Only the reserve; players' redeemable pool is untouched"], a: [["amount", "usdt", "數量（USDT）", "Amount (USDT)"]], pre: (s) => [E.formatUnits(s.vault.reserve, 6)], warn: true },
        { c: "vault", lv: "owner", sig: "allocate(address[] users,uint256[] points)", zh: "發 ASC", en: "Allocate ASC", d: ["直接發點數（會稀釋每點價值），地址和數量一一對應", "Mint ASC (dilutes value); addresses and amounts pair up"], a: [["users", "addrs", "錢包", "Wallets"], ["points", "uints", "ASC 數量", "ASC amounts"]], warn: true },
        { c: "vault", lv: "owner", sig: "move(address from,address to,uint256 points)", zh: "搬點數（被盜救援）", en: "Move points (rescue)", d: ["先標記被盜錢包；數量 0＝全部", "Flag the stolen wallet first; 0 = all"], a: [["from", "addr", "被盜錢包", "From"], ["to", "addr", "新錢包", "To"], ["points", "uint", "數量（0＝全部）", "Amount (0 = all)"]], pre: () => ["", "", "0"], warn: true },
        { c: "vault", lv: "owner", sig: "setExempt(address account,bool v)", zh: "免互轉稅地址", en: "Tax-exempt address", d: ["市場地址必須是 true", "The market must be exempt"], a: [["account", "addr", "地址", "Address"], ["v", "bool", "豁免", "Exempt"]], pre: () => [C.market, "true"] },
        { c: "vault", lv: "owner", sig: "rescueToken(address token,address to,uint256 amount)", zh: "救回誤轉代幣", en: "Rescue token", d: ["不能動 USDT；數量是最小單位", "Can't touch USDT; amount in smallest units"], a: [["token", "addr", "代幣", "Token"], ["to", "addr", "收款", "To"], ["amount", "uint", "數量（最小單位）", "Amount (raw)"]], warn: true },
        { c: "vault", lv: "owner", sig: "shutdownVault()", zh: "⚠️ 結束金庫（不可逆）", en: "⚠️ Shut down vault (irreversible)", d: ["停止買入與發點，所有人 100% 換回 USDT；無法復原", "Stops buying and minting; everyone redeems 100%. Cannot be undone"], a: [], warn: true, danger: true },
        // NFT
        { c: "nft", lv: "operator", sig: "setMintAllowance(address[] users,uint256[] amounts)", zh: "白名單鑄造次數", en: "Mint allowance", d: ["覆寫（不是累加），0＝取消", "Overwrites (not added); 0 = remove"], a: [["users", "addrs", "錢包", "Wallets"], ["amounts", "uints", "次數（一一對應）", "Counts (paired)"]] },
        { c: "nft", lv: "operator", sig: "setFrozen(address[] users,bool v)", zh: "凍結 NFT", en: "Freeze NFT wallets", d: ["被盜第一步：不能轉出、不能換裝", "Rescue step 1: can't transfer or equip"], a: [["users", "addrs", "錢包", "Wallets"], ["v", "bool", "凍結", "Frozen"]], pre: () => ["", "true"] },
        { c: "nft", lv: "admin", sig: "setSale(bool open_)", zh: "白名單鑄造開關", en: "Mint sale switch", d: ["", ""], a: [["open_", "bool", "開放", "Open"]], pre: (s) => [String(s.nft.saleOpen)] },
        { c: "nft", lv: "admin", sig: "setPrices(uint256 random_,uint256 change_,uint256 gacha_)", zh: "價格（ASC，付款銷毀）", en: "Prices (ASC, burned)", d: ["", ""], a: [["random_", "uint", "鑄造", "Mint"], ["change_", "uint", "換裝", "Equip"], ["gacha_", "uint", "每抽轉蛋", "Gacha per pull"]], pre: (s) => [s.nft.randomFee, s.nft.changeFee, s.nft.gachaFee].map(String) },
        { c: "nft", lv: "admin", sig: "setVipPrice(uint256 price,uint256 days_)", zh: "VIP 價格", en: "VIP price", d: ["每期 ASC 與天數；價格 0＝不販售", "ASC per period and days; 0 = not for sale"], a: [["price", "uint", "每期 ASC", "ASC per period"], ["days_", "uint", "每期天數", "Days per period"]], pre: (s) => [String(s.nft.vipPrice), String(s.nft.vipDays)] },
        { c: "nft", lv: "admin", sig: "grantVip(address[] users,uint256 days_)", zh: "直接發 VIP", en: "Grant VIP", d: ["延長天數；0＝取消", "Extend by days; 0 = cancel"], a: [["users", "addrs", "錢包", "Wallets"], ["days_", "uint", "天數", "Days"]], pre: () => ["", "30"] },
        { c: "nft", lv: "admin", sig: "setGachaVipOnly(bool v)", zh: "轉蛋只限 VIP", en: "Gacha VIP only", d: ["", ""], a: [["v", "bool", "只限 VIP", "VIP only"]], pre: (s) => [String(s.nft.gachaVipOnly)] },
        { c: "nft", lv: "admin", sig: "setGachaPool(uint32[] partIds,uint16[] weights,uint32 miss)", zh: "轉蛋獎池", en: "Gacha pool", d: ["配件編號＝部位×256＋選項；權重一一對應；miss＝沒中的權重", "partId = slot×256 + option; weights pair up; miss = weight of no prize"],
            a: [["partIds", "uints", "配件編號", "Part IDs"], ["weights", "uints", "權重", "Weights"], ["miss", "uint", "沒中權重", "Miss weight"]], pre: (s) => [s.nft.pool.ids.join(", "), s.nft.pool.weights.join(", "), String(s.nft.pool.miss)], warn: true },
        { c: "nft", lv: "admin", sig: "givePulls(address user,uint256 n)", zh: "送轉蛋次數", en: "Give pulls", d: ["", ""], a: [["user", "addr", "錢包", "Wallet"], ["n", "uint", "次數", "Pulls"]] },
        { c: "nft", lv: "admin", sig: "giveParts(address user,uint256 partId,uint256 amount)", zh: "送配件", en: "Give parts", d: ["", ""], a: [["user", "addr", "錢包", "Wallet"], ["partId", "uint", "配件編號", "Part ID"], ["amount", "uint", "數量", "Amount"]] },
        { c: "nft", lv: "admin", sig: "airdrop(address[] to)", zh: "空投隨機盲盒", en: "Airdrop random boxes", d: ["一次最多 100 個", "Up to 100 per call"], a: [["to", "addrs", "錢包", "Wallets"]], warn: true },
        { c: "nft", lv: "admin", sig: "airdropPreset(address[] to,uint256[] refs)", zh: "空投 V1 原外觀", en: "Airdrop V1 looks", d: ["refs＝V1 編號，一一對應", "refs = V1 token IDs, paired"], a: [["to", "addrs", "錢包", "Wallets"], ["refs", "uints", "V1 編號", "V1 IDs"]], warn: true },
        { c: "nft", lv: "admin", sig: "adminReveal(uint256[] ids)", zh: "幫玩家解盲", en: "Reveal for players", d: ["", ""], a: [["ids", "uints", "編號", "Token IDs"]] },
        { c: "nft", lv: "admin", sig: "refreshMetadata(uint256 from,uint256 to)", zh: "通知 OpenSea 更新", en: "Refresh metadata", d: ["", ""], a: [["from", "uint", "從", "From"], ["to", "uint", "到", "To"]], pre: (s) => ["0", String(Math.max(0, Number(s.nft.nextId) - 1))] },
        { c: "nft", lv: "admin", sig: "setMaxSupply(uint256 m)", zh: "總量上限", en: "Max supply", d: ["不能低於已用掉的編號數", "Can't go below minted count"], a: [["m", "uint", "上限", "Max"]], pre: (s) => [String(s.nft.maxSupply)] },
        { c: "nft", lv: "admin", sig: "setBaseURI(string b)", zh: "metadata 網址", en: "Metadata base URI", d: ["結尾要有 /", "Must end with /"], a: [["b", "str", "網址", "URI"]] },
        { c: "nft", lv: "admin", sig: "pause()", zh: "暫停（鑄造、解盲、換裝、轉蛋）", en: "Pause", d: ["", ""], a: [], warn: true },
        { c: "nft", lv: "admin", sig: "unpause()", zh: "解除暫停", en: "Unpause", d: ["", ""], a: [] },
        { c: "nft", lv: "admin", sig: "setOperator(address op)", zh: "設定 operator", en: "Set operator", d: ["", ""], a: [["op", "addr", "operator", "Operator"]], pre: (s) => [s.roles.nft.operator || ""] },
        { c: "nft", lv: "owner", sig: "recoverNfts(address from,address to,uint256[] ids)", zh: "搬 NFT（被盜救援）", en: "Recover NFTs", d: ["只能從已凍結的錢包搬", "Only from a frozen wallet"], a: [["from", "addr", "被盜錢包", "From"], ["to", "addr", "新錢包", "To"], ["ids", "uints", "編號", "Token IDs"]], warn: true },
        { c: "nft", lv: "owner", sig: "moveAccountPerks(address from,address to)", zh: "搬鑄造額度、VIP、轉蛋次數", en: "Move perks", d: ["", ""], a: [["from", "addr", "被盜錢包", "From"], ["to", "addr", "新錢包", "To"]], warn: true },
        { c: "nft", lv: "owner", sig: "rescueERC20(address token,address to,uint256 amount)", zh: "救回誤轉代幣", en: "Rescue ERC-20", d: ["數量是最小單位", "Amount in smallest units"], a: [["token", "addr", "代幣", "Token"], ["to", "addr", "收款", "To"], ["amount", "uint", "數量", "Amount"]], warn: true },
        // 配件
        { c: "parts", lv: "operator", sig: "setFrozen(address[] users,bool v)", zh: "凍結配件", en: "Freeze part wallets", d: ["被盜第一步：道具不能轉出、不能上架", "Rescue step 1: parts can't move or be listed"], a: [["users", "addrs", "錢包", "Wallets"], ["v", "bool", "凍結", "Frozen"]], pre: () => ["", "true"] },
        { c: "parts", lv: "admin", sig: "setBaseURI(string b)", zh: "metadata 網址", en: "Metadata base URI", d: ["{網址}{id}.json", "{uri}{id}.json"], a: [["b", "str", "網址", "URI"]] },
        { c: "parts", lv: "admin", sig: "setOperator(address op)", zh: "設定 operator", en: "Set operator", d: ["", ""], a: [["op", "addr", "operator", "Operator"]], pre: (s) => [s.roles.parts.operator || ""] },
        { c: "parts", lv: "owner", sig: "recoverParts(address from,address to,uint256[] ids,uint256[] amounts)", zh: "搬配件（被盜救援）", en: "Recover parts", d: ["只能從已凍結的錢包搬", "Only from a frozen wallet"], a: [["from", "addr", "被盜錢包", "From"], ["to", "addr", "新錢包", "To"], ["ids", "uints", "配件編號", "Part IDs"], ["amounts", "uints", "數量", "Amounts"]], warn: true },
        { c: "parts", lv: "owner", sig: "setMinter(address m)", zh: "指定鑄造者（NFT 合約）", en: "Set minter", d: ["只有 NFT 合約汰換時才改", "Only when replacing the NFT contract"], a: [["m", "addr", "NFT 合約", "NFT contract"]], pre: () => [C.nft], warn: true, danger: true },
        // 市場
        { c: "market", lv: "admin", sig: "setPolicy(uint256 feeBps_,uint256 flagFeeBps_,uint256 maxTradeValue_)", zh: "手續費與上限", en: "Fees & limit", d: ["手續費最多 99%；單筆上限 ASC，0＝不限", "Fees ≤ 99%; max trade in ASC, 0 = unlimited"],
            a: [["feeBps_", "pct", "手續費 %", "Fee %"], ["flagFeeBps_", "pct", "被標記賣家 %", "Flagged seller %"], ["maxTradeValue_", "uint", "單筆上限（ASC）", "Max trade (ASC)"]], pre: (s) => [Number(s.market.feeBps) / 100, Number(s.market.flagFeeBps) / 100, String(s.market.maxTradeValue)] },
        { c: "market", lv: "admin", sig: "adminCancel(uint256[] listingIds)", zh: "幫賣家下架", en: "Cancel listings", d: ["道具只退回原賣家", "Parts go back to the seller"], a: [["listingIds", "uints", "掛單編號", "Listing IDs"]], warn: true },
        { c: "market", lv: "admin", sig: "pause()", zh: "暫停市場", en: "Pause market", d: ["賣家仍可下架", "Sellers can still cancel"], a: [], warn: true },
        { c: "market", lv: "admin", sig: "unpause()", zh: "解除暫停", en: "Unpause", d: ["", ""], a: [] },
        { c: "market", lv: "owner", sig: "rescueParts(uint256 id,uint256 amount,address to)", zh: "救回直接轉進來的配件", en: "Rescue parts", d: ["只能動超出掛單保管量的部分", "Only beyond escrowed amounts"], a: [["id", "uint", "配件編號", "Part ID"], ["amount", "uint", "數量", "Amount"], ["to", "addr", "收款", "To"]], warn: true },
        { c: "market", lv: "owner", sig: "rescueERC20(address token,address to,uint256 amount)", zh: "救回誤轉代幣", en: "Rescue ERC-20", d: ["數量是最小單位", "Amount in smallest units"], a: [["token", "addr", "代幣", "Token"], ["to", "addr", "收款", "To"], ["amount", "uint", "數量", "Amount"]], warn: true }
    ];
    // 4 份合約共用：權限
    for (const [k] of KINDS) A.push(
        { c: k, lv: "owner", sig: "setAdmin(address a)", zh: "指定 admin（0＝取消）", en: "Set admin (0 = none)", d: ["只有一個；不能是 owner", "Only one; can't be the owner"], a: [["a", "addr", "admin", "Admin"]], pre: (s) => [s.roles[k].admin || ZERO], warn: true },
        { c: k, lv: "owner", sig: "transferOwnership(address newOwner)", zh: "轉移主人（第一步）", en: "Transfer ownership (step 1)", d: ["新地址要自己 acceptOwnership 才生效；admin 會被清空", "New owner must acceptOwnership; admin gets cleared"], a: [["newOwner", "addr", "新主人", "New owner"]], warn: true, danger: true },
        { c: k, lv: "pending", sig: "acceptOwnership()", zh: "接受主人（第二步）", en: "Accept ownership (step 2)", d: ["只有等待中的新主人能按", "Only the pending owner"], a: [] }
    );
    for (const x of A) { x.fn = x.sig.slice(0, x.sig.indexOf("(")); x.frag = E.FunctionFragment.from("function " + x.sig); }

    /* ── 狀態 ── */
    const st = { roles: {}, safes: {}, vault: null, nft: null, market: null, ok: false };
    let batch = [];
    try { batch = JSON.parse(localStorage.getItem("asc-admin-batch") || "[]"); } catch (_) {}
    const saveBatch = () => { try { localStorage.setItem("asc-admin-batch", JSON.stringify(batch)); } catch (_) {} };
    const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

    async function readRoles() {
        const ro = CH.ro;
        await Promise.all(KINDS.map(async ([k]) => {
            const c = new E.Contract(C[k], ROLE_ABI, ro);
            const [owner, pending, admin, operator] = await Promise.all([c.owner(), c.pendingOwner().catch(() => ZERO), c.admin().catch(() => ZERO), k === "market" ? ZERO : c.operator().catch(() => ZERO)]);
            st.roles[k] = { owner, pending, admin: admin === ZERO ? "" : admin, operator: operator === ZERO ? "" : operator };
        }));
        const safes = new Set(KINDS.flatMap(([k]) => [st.roles[k].owner, st.roles[k].pending]).filter((a) => a && a !== ZERO).map((a) => a.toLowerCase()));
        await Promise.all([...safes].map(async (a) => {
            if (st.safes[a] !== undefined) return;
            const code = await ro.getCode(a);
            if (code === "0x") { st.safes[a] = null; return; }
            try { const s = new E.Contract(a, SAFE_ABI, ro); const [owners, th] = await Promise.all([s.getOwners(), s.getThreshold()]); st.safes[a] = { owners, th: Number(th) }; }
            catch (_) { st.safes[a] = { owners: [], th: 0 }; }
        }));
    }
    async function readState() {
        const r = CH.read;
        const v = r.vault, n = r.nft, m = r.market;
        const V = new E.Contract(C.vault, ["function capBps() view returns (uint256)", "function startPrice() view returns (uint256)", "function maxDepositPerPeriod() view returns (uint256)", "function periodStart() view returns (uint256)",
            "function reserve() view returns (uint256)", "function open() view returns (bool)"], CH.ro);
        const N = new E.Contract(C.nft, ["function saleOpen() view returns (bool)", "function maxSupply() view returns (uint256)", "function nextId() view returns (uint256)", "function randomFee() view returns (uint256)", "function changeFee() view returns (uint256)",
            "function gachaFee() view returns (uint256)", "function gachaVipOnly() view returns (bool)"], CH.ro);
        const [open, depositOpen, shutdown, verifiedOnly, tax, flag, cap, startPrice, maxDep, periodStart, reserve, toRes, toNext, usdtBal, supply] = await Promise.all([
            V.open(), v.depositOpen(), v.shutdown(), v.verifiedOnly(), v.transferTaxBps(), v.flagPenaltyBps(), V.capBps(), V.startPrice(), V.maxDepositPerPeriod(), V.periodStart(), V.reserve(),
            v.feeToReserveBps(), v.feeToNextBps(), r.usdt.balanceOf(C.vault), v.totalSupply()]);
        const keepDays = await Promise.all([...Array(8)].map((_, i) => v.keepDays(i).then(Number)));
        const keepRates = await Promise.all([...Array(8)].map((_, i) => v.keepRates(i).then(Number)));
        st.vault = { open, depositOpen, shutdown, verifiedOnly, transferTaxBps: tax, flagPenaltyBps: flag, capBps: cap, startPrice, maxDepositPerPeriod: maxDep, periodStart, reserve, feeToReserveBps: toRes, feeToNextBps: toNext, usdtBal, supply, keepDays, keepRates };
        const [saleOpen, paused, maxSupply, nextId, randomFee, changeFee, gachaFee, vipPrice, vipDays, gachaVipOnly, pool] = await Promise.all([
            N.saleOpen(), n.paused(), N.maxSupply(), N.nextId(), N.randomFee(), N.changeFee(), N.gachaFee(), n.vipPrice(), n.vipDays(), N.gachaVipOnly(), n.gachaPool()]);
        st.nft = { saleOpen, paused, maxSupply, nextId, randomFee, changeFee, gachaFee, vipPrice, vipDays, gachaVipOnly, pool: { ids: pool.prizes.map((p) => Number(p.partId)), weights: pool.prizes.map((p) => Number(p.weight)), miss: Number(pool.miss) } };
        const [feeBps, flagFeeBps, maxTradeValue, mPaused, count] = await Promise.all([m.feeBps(), m.flagFeeBps(), m.maxTradeValue(), m.paused(), m.listingCount()]);
        st.market = { feeBps, flagFeeBps, maxTradeValue, paused: mPaused, count };
        st.parts = { minter: await new E.Contract(C.parts, ["function minter() view returns (address)"], CH.ro).minter() };
    }

    /* ── 權限判斷 ── */
    const safeOf = (addr) => st.safes[(addr || "").toLowerCase()] || null;
    function me(k) {
        const a = CH.account, r = st.roles[k];
        if (!a || !r) return {};
        const s = safeOf(r.owner);
        return { owner: same(a, r.owner), signer: !!s && s.owners.some((o) => same(o, a)), admin: same(a, r.admin), op: same(a, r.operator), pending: same(a, r.pending) };
    }
    function canSend(x) {
        const m = me(x.c);
        if (x.lv === "pending") return m.pending;
        if (x.lv === "owner") return m.owner;
        if (x.lv === "admin") return m.owner || m.admin;
        return m.owner || m.admin || m.op;
    }
    function canBatch(x) {
        const r = st.roles[x.c];
        if (!r) return false;
        if (x.lv === "pending") return !!safeOf(r.pending);
        return !!safeOf(r.owner);
    }
    const visible = () => !!CH.account && KINDS.some(([k]) => { const m = me(k); return m.owner || m.signer || m.admin || m.op || m.pending; });

    /* ── 畫面 ──
     *   兩種模式（右上切換）：⚡ 直接送出（用連線錢包送交易）／🛡 Safe 模式（所有按鈕只加入批次＝購物車，最後下載 Transaction Builder JSON）。
     *   owner 不是 Safe 時沒有 Safe 模式；只是 Safe 簽署人（沒有直接權限）時固定 Safe 模式。
     *   版面：權限摘要 → 快速開關 → 分頁（金庫／喵武士／配件／市場／工具）＋搜尋 → 右下角批次按鈕＋側邊抽屜。 */
    const short = (a) => (a ? CH.short(a) : "–");
    const addrLink = (a) => (a ? `<a href="${CH.link("address", a)}" target="_blank" rel="noopener">${short(a)}</a>` : "–");
    const KN = (k) => { const r = KINDS.find(([x]) => x === k); return r ? L(r[1], r[2]).split(" ")[0] : k || ""; };
    const ls = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };
    const GROUPS = [["operator", "日常操作（operator）", "Daily (operator)"], ["admin", "參數設定（admin）", "Settings (admin)"], ["owner", "★ owner（Safe 多簽）", "★ Owner (Safe multisig)"], ["pending", "接受主人", "Accept ownership"]];

    let mode = ls.get("asc-admin-mode", "direct"); // direct | safe
    let tab = ls.get("asc-admin-tab", "vault");
    let query = "", cartOpen = false;
    let lvf = ls.get("asc-admin-lv", "all"); // 權限篩選：all／operator／admin／owner／pending
    const LVS = [["operator", "operator", "operator"], ["admin", "admin", "admin"], ["owner", "★ owner", "★ owner"], ["pending", "新主人", "pending owner"]];
    /* 某個權限在各合約由哪個錢包擔任（全部一樣就顯示一個，不同就顯示「各合約不同」） */
    function holder(lv, k) {
        const r = st.roles[k];
        if (!r) return "";
        return lv === "owner" ? r.owner : lv === "pending" ? (r.pending && r.pending !== ZERO ? r.pending : "") : lv === "admin" ? r.admin : r.operator;
    }
    function holderText(lv) {
        const ks = KINDS.map(([k]) => k).filter((k) => A.some((x) => x.c === k && x.lv === lv && (canSend(x) || canBatch(x))));
        const hs = [...new Set(ks.map((k) => (holder(lv, k) || "").toLowerCase()).filter(Boolean))];
        if (!hs.length) return "";
        if (hs.length > 1) return L("各合約不同", "varies");
        const a = hs[0], you = same(a, CH.account) ? L("（你）", " (you)") : "", s = safeOf(a);
        return `${short(a)}${you}${s ? " · Safe" : ""}`;
    }
    const openRows = new Set();
    const anySafe = () => KINDS.some(([k]) => safeOf(st.roles[k]?.owner));
    const anyDirect = () => A.some((x) => canSend(x));
    const effMode = () => (!anySafe() ? "direct" : !anyDirect() ? "safe" : mode);
    /* 這個操作要走批次還是直接送：Safe 模式能批次就批次；直接模式能送就送，不能送才批次 */
    const viaSafe = (x) => (effMode() === "safe" ? canBatch(x) : !canSend(x));

    /* 合約值 → 顯示文字（確認框、批次清單共用） */
    function fmtArg(type, v) {
        const arr = (a) => Array.from(a || []);
        switch (type) {
            case "addr": return String(v);
            case "addrs": { const a = arr(v); return a.length > 3 ? `${a.slice(0, 3).map(short).join(", ")} …（${a.length}）` : a.join(", "); }
            case "uints": case "int8": return arr(v).map(String).join(", ");
            case "pct8": return arr(v).map((b) => `${Number(b) / 100}%`).join(", ");
            case "usdt": return usd(v);
            case "pct": return pct(v);
            case "bool": return yes(v);
            default: return String(v);
        }
    }
    const showArgs = (x, args) => x.a.map(([, type, zh, en], i) => [L(zh, en), fmtArg(type, args[i])]);

    /* ── 小工具：確認框、提示 ── */
    function ask({ title, sub = "", rows = [], danger = false, ok, cancel }) {
        return new Promise((res) => {
            const d = document.createElement("div");
            d.className = "adm-modal";
            d.innerHTML = `<div class="adm-dlg${danger ? " danger" : ""}" role="dialog" aria-modal="true"><h3>${esc(title)}</h3>${sub ? `<p class="muted small">${sub}</p>` : ""}
${rows.length ? `<dl class="adm-dl2">${rows.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("")}</dl>` : ""}
${danger ? `<p class="adm-warn">⚠️ ${L("這個操作影響很大，請再確認一次。", "High impact — please double-check.")}</p>` : ""}
<div class="adm-btns"><button type="button" class="alt" data-a="0">${esc(cancel || L("取消", "Cancel"))}</button><button type="button" data-a="1">${esc(ok || L("確定", "OK"))}</button></div></div>`;
            const key = (e) => { if (e.key === "Escape") done(false); };
            const done = (v) => { d.remove(); document.removeEventListener("keydown", key); res(v); };
            d.addEventListener("click", (e) => { if (e.target === d) return done(false); const a = e.target.closest("[data-a]"); if (a) done(a.dataset.a === "1"); });
            document.addEventListener("keydown", key);
            document.body.appendChild(d);
            d.querySelector('[data-a="1"]').focus();
        });
    }
    function toast(text, kind = "", hash) {
        let t = $("admToasts");
        if (!t) { t = document.createElement("div"); t.id = "admToasts"; t.className = "adm-toasts"; document.body.appendChild(t); }
        const e = document.createElement("div");
        e.className = "adm-toast " + kind;
        e.textContent = text;
        if (hash) { const a = document.createElement("a"); a.href = CH.link("tx", hash); a.target = "_blank"; a.rel = "noopener"; a.textContent = L("看交易", "View tx"); e.appendChild(a); }
        t.appendChild(e);
        while (t.children.length > 3) t.firstChild.remove();
        setTimeout(() => e.classList.add("out"), hash ? 5000 : 2600);
        setTimeout(() => e.remove(), hash ? 5400 : 3000);
    }
    function confirmIt(x, args, force) {
        if (!x.warn && !force) return Promise.resolve(true);
        return ask({ title: L(x.zh, x.en), sub: `${esc(KN(x.c))} · <code>${esc(x.fn)}</code> · ${esc(short(C[x.c]))}`, rows: showArgs(x, args), danger: x.danger, ok: L("送出交易", "Send transaction") });
    }

    /* ── 送交易／加入批次 ── */
    async function sendTx(x, args, say) {
        say(L("請在錢包確認…", "Confirm in your wallet…"));
        const c = new E.Contract(C[x.c], [x.frag], await CH.signer());
        const tx = await c[x.fn](...args);
        say(L("等待上鏈…", "Waiting for confirmation…"), "", tx.hash);
        const r = await tx.wait();
        if (!r || r.status !== 1) throw new Error("reverted");
        say(L("完成", "Done"), "ok", tx.hash);
        return tx.hash;
    }
    function addBatch(x, args, extra = {}) {
        const r = st.roles[x.c];
        batch.push({ to: C[x.c], data: new E.Interface([x.frag]).encodeFunctionData(x.fn, args), safe: x.lv === "pending" ? r.pending : r.owner, c: x.c, sig: x.sig, ...extra });
        saveBatch();
        afterCart(true);
        toast(`🛒 ${L("已加入 Safe 批次", "Added to Safe batch")}：${extra.tag ? L(...extra.tag) : L(x.zh, x.en)}（${batch.length}）`, "ok");
    }
    function itemView(b) {
        const x = b.sig && A.find((y) => y.c === b.c && y.sig === b.sig);
        if (!x) return { title: b.label || short(b.to), fn: "", args: [] };
        let args = [];
        try { args = showArgs(x, new E.Interface([x.frag]).decodeFunctionData(x.fn, b.data)); } catch (_) {}
        return { title: b.tag ? L(...b.tag) : L(x.zh, x.en), fn: x.fn, args, danger: x.danger };
    }

    /* ── 權限摘要 ── */
    function roleTable() {
        const rows = KINDS.map(([k, zh, en]) => {
            const r = st.roles[k], s = safeOf(r.owner);
            return `<tr><td>${esc(L(zh, en))}</td><td>${addrLink(r.owner)}${s && s.th ? ` <span class="adm-tag">Safe ${s.th}/${s.owners.length}</span>` : ""}${r.pending && r.pending !== ZERO ? `<br><small class="muted">${L("等待接受", "pending")}：${addrLink(r.pending)}</small>` : ""}</td><td>${addrLink(r.admin)}</td><td>${k === "market" ? "—" : addrLink(r.operator)}</td></tr>`;
        }).join("");
        return `<div class="adm-scroll"><table class="adm-table"><thead><tr><th>${L("合約", "Contract")}</th><th>owner</th><th>admin</th><th>operator</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function myRoles(k) {
        const m = me(k);
        return [m.owner && "owner", m.signer && L("Safe 簽署人", "Safe signer"), m.admin && "admin", m.op && "operator", m.pending && L("新主人", "pending")].filter(Boolean).join(" · ");
    }
    function rolesHtml() {
        const chips = KINDS.map(([k]) => { const r = myRoles(k); return `<span class="adm-chip${r ? "" : " none"}"><i>${esc(KN(k))}</i>${esc(r || "–")}</span>`; }).join("");
        return `<details class="adm-roles"><summary><span class="muted small">${L("你的權限", "Your roles")}</span>${chips}<span class="adm-more">${L("地址詳情", "Details")}</span></summary>${roleTable()}</details>`;
    }

    /* ── 合約狀態 ── */
    function stateGrid(k) {
        const v = st.vault, n = st.nft, m = st.market;
        const B = (on) => ({ t: yes(on), on });
        const items = {
            vault: v && [[L("兌換／互轉", "Redeem/transfer"), B(v.open)], [L("買 ASC", "Buy ASC"), B(v.depositOpen)], [L("結束模式", "Shutdown"), v.shutdown ? L("是", "Yes") : L("否", "No")], [L("只限驗證", "Verified only"), B(v.verifiedOnly)],
                [L("互轉稅", "Transfer tax"), pct(v.transferTaxBps)], [L("被標記扣除", "Flag penalty"), pct(v.flagPenaltyBps)], [L("每期存款上限", "Deposit cap"), Number(v.maxDepositPerPeriod) ? usd(v.maxDepositPerPeriod) : L("不限", "None")], [L("每人每期兌換上限", "Redeem cap"), pct(v.capBps)],
                [L("起始價", "Start price"), usd(v.startPrice)], [L("手續費分配", "Fee split"), `${pct(v.feeToReserveBps)} / ${pct(v.feeToNextBps)}`], [L("這一期開始", "Period start"), when(v.periodStart)], [L("池子 USDT", "Pool USDT"), usd(v.usdtBal)], [L("保底（可提領）", "Reserve"), usd(v.reserve)], [L("流通 ASC", "ASC supply"), int(v.supply)]],
            nft: n && [[L("白名單鑄造", "Mint sale"), B(n.saleOpen)], [L("運作", "Running"), B(!n.paused)], [L("已用編號／上限", "Minted / max"), `${int(n.nextId)} / ${int(n.maxSupply)}`], [L("鑄造／換裝／轉蛋", "Mint / equip / gacha"), `${n.randomFee} / ${n.changeFee} / ${n.gachaFee} ASC`],
                ["VIP", Number(n.vipPrice) ? `${n.vipPrice} ASC / ${n.vipDays} ${L("天", "days")}` : L("不販售", "Not for sale")], [L("轉蛋只限 VIP", "Gacha VIP only"), B(n.gachaVipOnly)], [L("獎池配件數", "Pool prizes"), `${n.pool.ids.length}（miss ${n.pool.miss}）`]],
            parts: st.parts && [["minter", same(st.parts.minter, C.nft) ? L("喵武士 NFT ✓", "Cat Samurai NFT ✓") : short(st.parts.minter)]],
            market: m && [[L("手續費", "Fee"), pct(m.feeBps)], [L("被標記賣家", "Flagged seller"), pct(m.flagFeeBps)], [L("單筆上限", "Max trade"), Number(m.maxTradeValue) ? `${int(m.maxTradeValue)} ASC` : L("不限", "None")], [L("運作", "Running"), B(!m.paused)], [L("掛單數", "Listings"), int(m.count)]]
        }[k];
        if (!items) return "";
        return `<div class="adm-state">${items.map(([a, b]) => `<div><span>${esc(a)}</span><b${typeof b === "object" ? ` class="${b.on ? "on" : "off"}"` : ""}>${esc(typeof b === "object" ? b.t : b)}</b></div>`).join("")}</div>`;
    }

    /* ── 快速開關：一鍵切換。直接模式＝確認後送交易；Safe 模式＝加入批次（再按一次取消） ── */
    const Q = [
        { k: "v-open", c: "vault", fn: "setOpen", zh: "兌換與互轉", en: "Redeem & transfer", get: (s) => s.vault.open, args: (on) => [on] },
        { k: "v-dep", c: "vault", fn: "setDepositOpen", zh: "買 ASC", en: "Buy ASC", get: (s) => s.vault.depositOpen, args: (on) => [on] },
        { k: "v-ver", c: "vault", fn: "setPolicy", zh: "只限驗證錢包", en: "Verified wallets only", get: (s) => s.vault.verifiedOnly, args: (on, s) => [on, s.vault.transferTaxBps, s.vault.flagPenaltyBps, s.vault.maxDepositPerPeriod] },
        { k: "n-sale", c: "nft", fn: "setSale", zh: "白名單鑄造", en: "Whitelist mint", get: (s) => s.nft.saleOpen, args: (on) => [on] },
        { k: "n-run", c: "nft", fn: (on) => (on ? "unpause" : "pause"), zh: "NFT 運作", en: "NFT running", sub: ["關＝暫停鑄造、解盲、換裝、轉蛋", "Off = pause mint, reveal, equip, gacha"], get: (s) => !s.nft.paused, args: () => [] },
        { k: "n-vip", c: "nft", fn: "setGachaVipOnly", zh: "轉蛋只限 VIP", en: "Gacha VIP only", get: (s) => s.nft.gachaVipOnly, args: (on) => [on] },
        { k: "m-run", c: "market", fn: (on) => (on ? "unpause" : "pause"), zh: "市場交易", en: "Market trading", sub: ["關＝暫停市場（賣家仍可下架）", "Off = pause (sellers can still cancel)"], get: (s) => !s.market.paused, args: () => [] }
    ];
    const qAct = (q, on) => A.find((x) => x.c === q.c && x.fn === (typeof q.fn === "function" ? q.fn(on) : q.fn));
    function quickHtml() {
        const items = Q.map((q) => {
            let cur;
            try { cur = !!q.get(st); } catch (_) { return ""; }
            const x = qAct(q, !cur);
            if (!x || !(canSend(x) || canBatch(x))) return "";
            const pend = batch.some((b) => b.q === q.k);
            const shown = pend ? !cur : cur;
            const tip = pend ? `<span class="adm-pend">🛒 ${L("批次中", "In batch")}：${yes(cur)} → ${yes(!cur)}</span>` : `<span class="adm-now ${cur ? "on" : "off"}">● ${L("目前", "Now")} ${yes(cur)}</span>`;
            return `<div class="adm-q${pend ? " pend" : ""}" data-q="${q.k}" data-lv="${x.lv}"><div><b>${esc(L(q.zh, q.en))}</b><small>${esc(KN(q.c))} · <code>${esc(x.fn)}</code>${q.sub ? ` · ${esc(L(...q.sub))}` : ""}</small>${tip}<span class="adm-qmsg"></span></div><label class="adm-sw" title="${esc(L(q.zh, q.en))}"><input type="checkbox" aria-label="${esc(L(q.zh, q.en))}"${shown ? " checked" : ""}><i></i></label></div>`;
        }).join("");
        return items ? `<h3 class="adm-sect-h">${L("快速開關", "QUICK SWITCHES")}</h3><div class="adm-quick">${items}</div>` : "";
    }
    function bindQuick(root) {
        root.querySelectorAll(".adm-q").forEach((row) => {
            const q = Q.find((y) => y.k === row.dataset.q), inp = row.querySelector("input"), msg = row.querySelector(".adm-qmsg");
            inp.addEventListener("change", async () => {
                const cur = !!q.get(st), pi = batch.findIndex((b) => b.q === q.k);
                if (pi >= 0) { batch.splice(pi, 1); saveBatch(); afterCart(); toast(L("已從批次移除", "Removed from batch")); return; }
                const want = !cur, x = qAct(q, want), args = q.args(want, st);
                if (viaSafe(x)) { addBatch(x, args, { q: q.k, tag: [`${q.zh} → ${want ? "開" : "關"}`, `${q.en} → ${want ? "On" : "Off"}`] }); return; }
                inp.checked = cur; // 交易完成前維持原狀
                if (!(await confirmIt(x, args, true))) return;
                inp.disabled = true;
                try {
                    const h = await sendTx(x, args, (t, kind) => { msg.textContent = t; msg.className = "adm-qmsg " + (kind || ""); });
                    toast(`${L("完成", "Done")}：${L(q.zh, q.en)} → ${yes(want)}`, "ok", h);
                    await load();
                } catch (e) { console.warn(e); msg.textContent = errText(e); msg.className = "adm-qmsg bad"; inp.disabled = false; }
            });
        });
    }

    /* ── 每個管理函式：可展開的一列 ── */
    function field(x, i, [name, type, zh, en], pre) {
        const id = `adf-${x.c}-${x.fn}-${i}`;
        const val = pre?.[i] ?? "";
        const lab = `<span>${esc(L(zh, en))}</span>`;
        if (type === "bool") return `<label class="adm-f">${lab}<span class="adm-swrow"><span class="adm-sw"><input type="checkbox" id="${id}"${String(val) !== "false" ? " checked" : ""}><i></i></span><em data-on="${esc(L("是 true", "true"))}" data-off="${esc(L("否 false", "false"))}"></em></span></label>`;
        if (type === "addrs" || type === "uints") return `<label class="adm-f wide">${lab}<textarea id="${id}" rows="2" placeholder="${esc(HINT()[type])}">${esc(val)}</textarea></label>`;
        return `<label class="adm-f${type === "str" || type.endsWith("8") ? " wide" : ""}">${lab}<input id="${id}" value="${esc(val)}" placeholder="${esc(HINT()[type] || "")}" autocomplete="off" spellcheck="false"></label>`;
    }
    function actionRow(x, idx) {
        let pre = null;
        try { pre = x.pre ? x.pre(st) : null; } catch (_) {}
        const send = canSend(x), bat = canBatch(x);
        if (!send && !bat) return "";
        const key = `${x.c}:${x.sig}`;
        return `<details class="adm-act${x.danger ? " danger" : ""}${send && bat ? " both" : ""}" data-i="${idx}" data-lv="${x.lv}" data-key="${esc(key)}" data-s="${esc(`${x.zh} ${x.en} ${x.fn}`.toLowerCase())}"${openRows.has(key) ? " open" : ""}>
<summary><b>${esc(L(x.zh, x.en))}</b><code>${esc(x.fn)}</code>${!send ? `<span class="adm-only">🛡 ${L("只能走 Safe", "Safe only")}</span>` : ""}</summary>
<div class="adm-in">${x.d[0] ? `<p class="muted small">${esc(L(x.d[0], x.d[1]))}</p>` : ""}
${x.a.length ? `<div class="adm-fields">${x.a.map((a, i) => field(x, i, a, pre)).join("")}</div>` : `<p class="muted small">${L("不需要參數", "No parameters")}</p>`}
<div class="adm-btns">${send ? `<button type="button" class="adm-send">⚡ ${L("送出交易", "Send")}</button>` : ""}${bat ? `<button type="button" class="adm-add">🛒 ${L("加入批次", "Add to batch")}</button>` : ""}</div>
<div class="msg adm-msg"></div></div></details>`;
    }
    function paneHtml(k, zh, en) {
        const groups = GROUPS.map(([lv, gz, ge]) => {
            const rows = A.map((x, i) => (x.c === k && x.lv === lv ? actionRow(x, i) : "")).join("");
            return rows ? `<div class="adm-grp" data-lv="${lv}"><h4>${esc(L(gz, ge))}${holder(lv, k) ? ` <span class="adm-who">${addrLink(holder(lv, k))}${same(holder(lv, k), CH.account) ? L("（你）", " (you)") : ""}</span>` : ""}</h4><div class="adm-list">${rows}</div></div>` : "";
        }).join("");
        return `<div class="adm-pane" data-pane="${k}"><h3 class="adm-pane-h">${esc(L(zh, en))}</h3><div class="adm-addr muted small">${L("合約", "Contract")} ${addrLink(C[k])}</div>${stateGrid(k)}${groups || `<p class="muted small">${L("你在這份合約沒有可以做的操作", "No actions available for you here")}</p>`}<p class="muted small adm-lvnone hidden">${L("這份合約沒有這個權限的功能，換個權限或分頁看看", "No actions for this role here — try another role or tab")}</p></div>`;
    }
    const count = (k) => A.filter((x) => x.c === k && (canSend(x) || canBatch(x))).length;

    /* ── 超稀有退還 ── */
    const rf = { busy: false, rows: null, err: "", at: 0 };
    const ZPAD = (a) => E.zeroPadValue(a, 32);
    async function scanRefunds() {
        const LK = window.ASCLook;
        if (!LK) throw new Error("ASCLook");
        if (!LK.L.traits) await LK.loadTraits();
        const cats = LK.L.cats, sup = new Set(LK.L.parts.filter((p) => p.tier === "super").map((p) => p.pid));
        const head = await CH.ro.getBlockNumber();
        const I = CH.read.nft.interface;
        const names = ["Minted", "PresetMinted", "RandomSeed", "Equipped", "GachaPull"];
        const logs = await CH.getLogs({ address: C.nft, topics: [names.map((n) => I.getEvent(n).topicHash)] }, C.nftBlock, head);
        const toks = {}, owed = {}, gachaTx = new Set();
        const add = (m, who, pid, n) => { const k = who.toLowerCase() + ":" + pid; m[k] = (m[k] || 0) + n; };
        const pidOf = (slot, name) => { const i = cats[slot].options.findIndex((o) => o.name === name && o.file); return i < 0 ? null : slot * 256 + i; };
        for (const l of logs) {
            const ev = I.parseLog(l);
            if (!ev) continue;
            if (ev.name === "GachaPull") { gachaTx.add(l.transactionHash); continue; }
            if (ev.name === "RandomSeed") { if (Number(ev.args.purpose) === 1) (toks[String(ev.args.ref)] ||= {}).seed ||= ev.args.seed; continue; }
            const t = (toks[String(ev.args.tokenId)] ||= {});
            if (ev.name === "Minted") { t.kind = Number(ev.args.kind); continue; }
            if (ev.name === "PresetMinted") { t.ref = Number(ev.args.ref); continue; }
            if (!t.traits) t.traits = t.ref != null ? await LK.v1Traits(t.ref) : t.seed ? LK.rollTraits(t.seed) : {};
            const who = ev.args.owner;
            const off = (slot) => { const pid = pidOf(slot, t.traits[cats[slot]?.trait_type]); if (pid != null && sup.has(pid)) add(owed, who, pid, 1); };
            for (const pid of ev.args.partIds.map(Number)) {
                const slot = Math.floor(pid / 256), o = cats[slot]?.options[pid % 256];
                if (!o) continue;
                off(slot);
                t.traits[cats[slot].trait_type] = o.name;
            }
            for (const slot of ev.args.clearSlots.map(Number)) {
                if (!cats[slot]) continue;
                off(slot);
                const e = LK.empty(cats[slot]);
                t.traits[cats[slot].trait_type] = e ? e.name : undefined;
            }
        }
        const PI = new E.Interface(["event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"]);
        const plogs = await CH.getLogs({ address: C.parts, topics: [PI.getEvent("TransferSingle").topicHash, ZPAD(C.nft), ZPAD(ZERO)] }, C.nftBlock, head);
        const paid = {};
        for (const l of plogs) {
            if (gachaTx.has(l.transactionHash)) continue;
            const ev = PI.parseLog(l);
            const pid = Number(ev.args.id);
            if (sup.has(pid)) add(paid, ev.args.to, pid, Number(ev.args.value));
        }
        return Object.entries(owed).map(([k, n]) => {
            const [who, pid] = k.split(":");
            return { who: E.getAddress(who), pid: Number(pid), owed: n, paid: paid[k] || 0, name: LK.L.byPid[pid]?.zh || LK.L.byPid[pid]?.name || pid };
        }).sort((a, b) => (b.owed - b.paid) - (a.owed - a.paid));
    }
    const GIVE = () => A.find((x) => x.c === "nft" && x.fn === "giveParts");
    function refundHtml() {
        const g = GIVE();
        if (!g || !(canSend(g) || canBatch(g))) return "";
        const due = (rf.rows || []).filter((r) => r.owed > r.paid);
        const safe = viaSafe(g);
        const body = rf.busy ? `<p class="muted small">${L("掃描鏈上換裝紀錄中…（第一次會比較久）", "Scanning equip history…")}</p>`
            : rf.err ? `<p class="msg bad">${esc(rf.err)}</p>`
            : !rf.rows ? `<p class="muted small">${L("按「掃描」找出被換掉或脫掉、還沒退還的超稀有配件。", "Press Scan to find super-rare parts that were replaced and not yet returned.")}</p>`
            : !due.length ? `<p class="muted small">${L("目前沒有需要退還的超稀有配件 ✓", "Nothing to return ✓")}</p>`
            : `<div class="adm-scroll"><table class="adm-table"><thead><tr><th>${L("錢包", "Wallet")}</th><th>${L("配件", "Part")}</th><th>${L("應退／已退", "Owed / paid")}</th><th></th></tr></thead><tbody>${due.map((r, i) => `<tr><td>${addrLink(r.who)}</td><td>${esc(r.name)} <small class="muted">#${r.pid}</small></td><td>${r.owed} / ${r.paid}</td><td><button type="button" class="adm-rf${safe ? " cart" : ""}" data-r="${i}">${safe ? `🛒 ${L("加入批次", "Add to batch")}` : `⚡ ${L(`退還 ${r.owed - r.paid} 個`, `Return ${r.owed - r.paid}`)}`}</button></td></tr>`).join("")}</tbody></table></div>`;
        return `<div class="adm-look"><div class="adm-h"><b>${L("超稀有退還", "Super-rare returns")}</b><span class="muted small">${L("VIP 換裝時被換掉或脫掉的超稀有配件，用 giveParts 退回原持有者", "Super-rare parts replaced during VIP equip are returned with giveParts")}</span></div>${body}<div class="adm-btns"><button type="button" class="alt" id="adRfScan"${rf.busy ? " disabled" : ""}>${rf.rows ? L("重新掃描", "Rescan") : L("掃描", "Scan")}</button></div><div class="msg adm-msg ${rf.cls || ""}" id="adRfMsg">${esc(rf.msg || "")}</div></div>`;
    }
    function renderRefund() {
        const el = $("admRefundBox");
        if (!el) return;
        el.innerHTML = refundHtml();
        bindRefund(el);
    }
    async function runScan() {
        rf.busy = true; rf.err = ""; rf.msg = ""; renderRefund();
        try { rf.rows = await scanRefunds(); rf.at = Date.now(); }
        catch (e) { console.warn(e); rf.err = errText(e); }
        rf.busy = false; renderRefund();
    }
    function bindRefund(el) {
        $("adRfScan")?.addEventListener("click", runScan);
        const due = (rf.rows || []).filter((r) => r.owed > r.paid);
        el.querySelectorAll(".adm-rf").forEach((b) => b.addEventListener("click", async () => {
            const r = due[Number(b.dataset.r)], g = GIVE(), m = $("adRfMsg");
            if (!r || !g) return;
            const n = BigInt(r.owed - r.paid), args = [r.who, BigInt(r.pid), n];
            if (viaSafe(g)) { addBatch(g, args, { tag: [`退還超稀有 ${r.name} ×${n}`, `Return super-rare ${r.name} ×${n}`] }); return; }
            b.disabled = true;
            try {
                await sendTx(g, args, (t, kind) => { m.className = "msg adm-msg " + (kind || ""); m.textContent = t; });
                r.paid += Number(n);
                rf.msg = L(`已退還 ${r.name} ×${n} 給 ${short(r.who)}`, `Returned ${r.name} ×${n} to ${short(r.who)}`); rf.cls = "ok";
                renderRefund();
            } catch (e) { console.warn(e); m.className = "msg adm-msg bad"; m.textContent = errText(e); b.disabled = false; }
        }));
    }
    function lookupHtml() {
        return `<div class="adm-look"><div class="adm-h"><b>${L("查詢錢包", "Look up a wallet")}</b><span class="muted small">${L("驗證、標記、凍結、VIP、鑄造額度、轉蛋次數", "Verified, flagged, frozen, VIP, mint allowance, pulls")}</span></div><div class="adm-lookrow"><input id="adLookAddr" placeholder="0x…" autocomplete="off" spellcheck="false" aria-label="${L("錢包地址", "Wallet")}"><button type="button" id="adLookBtn">${L("查詢", "Look up")}</button></div><div class="adm-state" id="adLookOut"></div></div>`;
    }

    /* ── 批次（購物車）：右下角按鈕＋側邊抽屜 ── */
    function cartHtml() {
        const groups = {};
        batch.forEach((b, i) => (groups[(b.safe || "").toLowerCase()] ||= []).push(i));
        const keys = Object.keys(groups);
        const body = !batch.length
            ? `<div class="adm-empty"><div>🛒</div><p>${L("批次是空的", "The batch is empty")}</p><p class="muted small">${L("切到 🛡 Safe 模式後，按「加入批次」或撥動快速開關，操作會先放在這裡。", "Switch to 🛡 Safe mode, then press “Add to batch” or flip a quick switch — actions collect here.")}</p></div>`
            : keys.map((sk) => {
                const s = safeOf(sk), idx = groups[sk];
                let full = sk; try { full = E.getAddress(sk); } catch (_) {}
                return `<div class="adm-cg"><div class="adm-cgh"><span>Safe ${addrLink(full)}</span>${s && s.th ? `<span class="adm-tag">${s.th}/${s.owners.length} ${L("簽", "sigs")}</span>` : ""}<span class="muted small">${idx.length} ${L("筆", "tx")}</span></div>
<ol class="adm-items">${idx.map((i, n) => {
                    const b = batch[i], v = itemView(b);
                    return `<li class="${v.danger ? "danger" : ""}"><span class="no">${n + 1}</span><div class="bd"><b>${esc(v.title)}</b><small>${esc(KN(b.c))}${v.fn ? ` · <code>${esc(v.fn)}</code>` : ""}</small>${v.args.length ? `<dl class="adm-dl2">${v.args.map(([a, c]) => `<div><dt>${esc(a)}</dt><dd>${esc(c)}</dd></div>`).join("")}</dl>` : ""}</div><div class="ops"><button type="button" data-mv="${i}:-1"${n === 0 ? " disabled" : ""} aria-label="up">↑</button><button type="button" data-mv="${i}:1"${n === idx.length - 1 ? " disabled" : ""} aria-label="down">↓</button><button type="button" class="rm" data-rm="${i}" aria-label="remove">✕</button></div></li>`;
                }).join("")}</ol>
<button type="button" class="adm-dlbtn" data-dl="${esc(sk)}">⬇ ${L("下載 Safe JSON", "Download Safe JSON")}${keys.length > 1 ? `（${short(full)}）` : ""}</button></div>`;
            }).join("");
        const fab = effMode() === "safe" || batch.length;
        return `${fab ? `<button type="button" class="adm-fab" id="admFab" aria-label="Safe batch">🛒 <span>${L("Safe 批次", "Safe batch")}</span><b>${batch.length}</b></button>` : ""}
<div class="adm-cart-bg" id="admCartBg"></div>
<aside class="adm-cart" aria-label="Safe batch" aria-hidden="${!cartOpen}"><header><b>🛒 ${L("Safe 批次", "Safe batch")}</b><span class="adm-tag">${batch.length}</span><button type="button" class="x" id="admCartX" aria-label="close">✕</button></header>
<ol class="adm-steps"><li>${L("在面板加入要做的操作（可調順序、刪除）", "Add actions from the panel (reorder or remove here)")}</li><li>${L("按「下載 Safe JSON」", "Press “Download Safe JSON”")}</li><li>${L("Safe → Apps → Transaction Builder，把 JSON 拖進去 → Create batch → 簽名執行", "Safe → Apps → Transaction Builder, drop the JSON in → Create batch → sign")}</li></ol>
<div class="adm-cart-body">${body}</div>
<footer><button type="button" class="alt" id="admClr"${batch.length ? "" : " disabled"}>${L("清空批次", "Clear batch")}</button><button type="button" class="alt" id="admCartX2">${L("繼續加入", "Keep adding")}</button></footer></aside>`;
    }
    function renderCart(bump) {
        const root = $("admCartRoot"), box = $("adminPanel");
        if (!root) return;
        const scroll = root.querySelector(".adm-cart-body")?.scrollTop || 0;
        root.innerHTML = cartHtml();
        root.classList.toggle("open", cartOpen);
        box?.classList.toggle("hasfab", !!$("admFab"));
        const body = root.querySelector(".adm-cart-body");
        if (body) body.scrollTop = scroll;
        if (bump) { const f = $("admFab"); f?.classList.add("bump"); setTimeout(() => f?.classList.remove("bump"), 500); }
        const setOpen = (v) => { cartOpen = v; root.classList.toggle("open", v); root.querySelector(".adm-cart")?.setAttribute("aria-hidden", String(!v)); };
        $("admFab")?.addEventListener("click", () => setOpen(true));
        ["admCartBg", "admCartX", "admCartX2"].forEach((id) => $(id)?.addEventListener("click", () => setOpen(false)));
        root.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { batch.splice(Number(b.dataset.rm), 1); saveBatch(); afterCart(); }));
        root.querySelectorAll("[data-mv]").forEach((b) => b.addEventListener("click", () => {
            const [i, d] = b.dataset.mv.split(":").map(Number), sk = (batch[i].safe || "").toLowerCase();
            const idx = batch.map((x, j) => ((x.safe || "").toLowerCase() === sk ? j : -1)).filter((j) => j >= 0);
            const p = idx.indexOf(i), j = idx[p + d];
            if (j == null) return;
            [batch[i], batch[j]] = [batch[j], batch[i]];
            saveBatch(); afterCart();
        }));
        $("admClr")?.addEventListener("click", async () => {
            if (!(await ask({ title: L("清空批次？", "Clear the batch?"), sub: L(`會移除全部 ${batch.length} 筆操作`, `Removes all ${batch.length} actions`), ok: L("清空", "Clear") }))) return;
            batch = []; saveBatch(); afterCart();
        });
        root.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => download(b.dataset.dl)));
    }
    function download(sk) {
        const items = batch.filter((b) => (b.safe || "").toLowerCase() === sk);
        if (!items.length) return;
        const json = { version: "1.0", chainId: String(C.chainId), createdAt: Date.now(),
            meta: { name: "ASC admin batch", description: items.map((b) => itemView(b).title).join(" / ").slice(0, 900), txBuilderVersion: "1.16.5", createdFromSafeAddress: items[0].safe },
            transactions: items.map((b) => ({ to: b.to, value: "0", data: b.data, contractMethod: null, contractInputsValues: null })) };
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
        a.download = `asc-safe-batch-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast(L(`已下載 ${items.length} 筆，拖進 Safe Transaction Builder`, `Downloaded ${items.length} tx — drop it into Safe Transaction Builder`), "ok");
    }
    function afterCart(bump) {
        renderCart(bump);
        const qb = $("admQuickBox");
        if (qb) { qb.innerHTML = quickHtml(); bindQuick(qb); applyView(); }
    }

    /* ── 模式、分頁、搜尋 ── */
    function hintHtml() {
        if (!anySafe()) return "";
        if (effMode() === "safe") return `🛡 <b>${L("Safe 模式", "Safe mode")}</b>：${L("所有按鈕只會「加入批次」（像購物車），不會送出交易；最後到右下角下載 JSON，用 Safe 多簽執行。", "every button only adds to the batch (like a cart) — nothing is sent. Download the JSON from the bottom-right and execute it in the Safe.")}${!anyDirect() ? ` <span class="muted">${L("（你只是 Safe 簽署人，所以固定這個模式）", "(you're a Safe signer only, so this mode is fixed)")}</span>` : ""}`;
        return `⚡ <b>${L("直接送出", "Direct")}</b>：${L("有權限的操作用你連線的錢包直接送交易；標「🛡 只能走 Safe」的 ★ owner 操作會加入批次。", "actions you're allowed to do are sent from your connected wallet; “🛡 Safe only” ★ owner actions go to the batch.")}`;
    }
    function setMode(m) {
        mode = m; ls.set("asc-admin-mode", m);
        const box = $("adminPanel");
        box.classList.toggle("safe", effMode() === "safe");
        box.querySelectorAll(".adm-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === effMode())));
        const h = $("admHint"); if (h) h.innerHTML = hintHtml();
        afterCart();
        renderRefund();
    }
    function lvBar() {
        const avail = LVS.filter(([lv]) => A.some((x) => x.lv === lv && (canSend(x) || canBatch(x))));
        if (avail.length < 2) return "";
        if (lvf !== "all" && !avail.some(([lv]) => lv === lvf)) lvf = "all";
        const n = (lv) => A.filter((x) => (lv === "all" || x.lv === lv) && (canSend(x) || canBatch(x))).length;
        const btn = (lv, label, sub) => `<button type="button" data-lv="${lv}" aria-pressed="${lvf === lv}"><b>${esc(label)}<small>${n(lv)}</small></b>${sub ? `<span>${esc(sub)}</span>` : ""}</button>`;
        return `<div class="adm-lvf" role="group" aria-label="role filter"><span class="adm-lvl">${L("權限篩選", "Filter by role")}</span>${btn("all", L("全部", "All"), L("所有錢包", "all wallets"))}${avail.map(([lv, zh, en]) => btn(lv, L(zh, en), holderText(lv))).join("")}</div>`;
    }
    function applyView() {
        const box = $("adminPanel"), q = query.trim().toLowerCase();
        box.classList.toggle("searching", !!q);
        const lvOk = (el) => lvf === "all" || el.dataset.lv === lvf;
        box.querySelectorAll(".adm-act").forEach((r) => r.classList.toggle("hidden", !lvOk(r) || (!!q && !r.dataset.s.includes(q) && !r.textContent.toLowerCase().includes(q))));
        box.querySelectorAll(".adm-q").forEach((r) => r.classList.toggle("hidden", !lvOk(r)));
        const qb = $("admQuickBox"); if (qb) qb.classList.toggle("hidden", !qb.querySelector(".adm-q:not(.hidden)"));
        box.querySelectorAll(".adm-lvf button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lv === lvf)));
        box.querySelectorAll(".adm-tabs button").forEach((b) => { const sm = b.querySelector("small"), p = box.querySelector(`.adm-pane[data-pane="${b.dataset.tab}"]`); if (!sm || !p) return; const c = [...p.querySelectorAll(".adm-act")].filter(lvOk).length; sm.textContent = c; b.classList.toggle("dim", !c); });
        box.querySelectorAll(".adm-grp").forEach((g) => g.classList.toggle("hidden", !g.querySelector(".adm-act:not(.hidden)")));
        let hits = 0;
        box.querySelectorAll(".adm-pane").forEach((p) => {
            const n = p.querySelectorAll(".adm-act:not(.hidden)").length;
            hits += n;
            p.classList.toggle("hidden", q ? !n : p.dataset.pane !== tab);
            p.querySelector(".adm-lvnone")?.classList.toggle("hidden", !!q || lvf === "all" || n > 0 || !p.querySelector(".adm-act"));
        });
        box.querySelectorAll(".adm-tabs button").forEach((b) => b.setAttribute("aria-selected", String(!q && b.dataset.tab === tab)));
        const none = $("admNone"); if (none) none.classList.toggle("hidden", !q || hits > 0);
    }

    function jumpBtn(show) {
        const b = $("adminJump");
        if (!b) return;
        b.textContent = L("⚙ 管理", "⚙ Admin");
        b.classList.toggle("hidden", !show);
    }
    function render() {
        const box = $("adminPanel");
        if (!box) return;
        const show = st.ok && visible();
        jumpBtn(show);
        if (!show) {
            box.classList.remove("safe", "hasfab", "searching");
            box.innerHTML = `<span class="eyebrow">ADMIN</span><h2>${L("管理員", "Admin")}</h2><p class="muted">${CH.account && !st.ok ? L("讀取權限中…", "Checking roles…") : L("請用 owner／admin／operator 錢包連線才能看到管理功能。", "Connect an owner / admin / operator wallet to see admin tools.")}</p>`;
            return;
        }
        const m = effMode(), lock = anySafe() && !anyDirect();
        if (![...KINDS.map(([k]) => k), "tools"].includes(tab)) tab = "vault";
        const tabs = [...KINDS.map(([k, zh, en]) => [k, L(zh, en).split(" ")[0], count(k)]), ["tools", L("🔧 工具", "🔧 Tools"), 0]];
        box.classList.toggle("safe", m === "safe");
        box.innerHTML = `<div class="adm-head"><div><span class="eyebrow">ADMIN</span><h2>${L("管理員面板", "Admin panel")}</h2></div>
${anySafe() ? `<div class="adm-mode${lock ? " lock" : ""}" role="group" aria-label="mode"><button type="button" data-m="direct" aria-pressed="${m === "direct"}"${lock ? " disabled" : ""}>⚡ ${L("直接送出", "Direct")}</button><button type="button" data-m="safe" aria-pressed="${m === "safe"}">🛡 ${L("Safe 模式", "Safe mode")}</button></div>` : ""}
<button type="button" class="adm-ref" id="admRefresh" title="${L("重新讀取鏈上狀態", "Reload on-chain state")}" aria-label="refresh">↻</button></div>
${anySafe() ? `<p class="adm-hint" id="admHint">${hintHtml()}</p>` : ""}
${rolesHtml()}
<div id="admQuickBox">${quickHtml()}</div>
<div class="adm-bar"><div class="adm-tabs" role="tablist">${tabs.map(([k, label, n]) => `<button type="button" role="tab" data-tab="${k}">${esc(label)}${n ? `<small>${n}</small>` : ""}</button>`).join("")}</div><input type="search" class="adm-search" id="admSearch" placeholder="🔍 ${L("搜尋功能，例如 VIP、凍結、airdrop", "Search, e.g. VIP, freeze, airdrop")}" value="${esc(query)}" autocomplete="off"></div>
${lvBar()}
${KINDS.map(([k, zh, en]) => paneHtml(k, zh, en)).join("")}
<div class="adm-pane" data-pane="tools"><div id="admRefundBox">${refundHtml()}</div>${lookupHtml()}</div>
<p class="muted small hidden" id="admNone">${L("找不到符合的功能", "No matching actions")}</p>
<div id="admCartRoot"></div>`;
        bind(box);
        applyView();
        renderCart();
    }
    function collect(x, card) {
        return x.a.map(([name, type, zh, en], i) => {
            const el = card.querySelector(`#adf-${x.c}-${x.fn}-${i}`);
            try { return type === "bool" ? el.checked : T[type](el.value); }
            catch (e) { throw new Error(`${L(zh, en)}：${e.shortMessage || e.message}`); }
        });
    }
    const msgs = {}; // 重畫面板時保留每張卡片的結果訊息
    function say(card, text, kind, hash) {
        msgs[card.dataset.i] = [text, kind, hash];
        const m = card.querySelector(".adm-msg");
        m.className = "msg adm-msg" + (kind ? " " + kind : "");
        m.textContent = text;
        if (hash) { const a = document.createElement("a"); a.href = CH.link("tx", hash); a.target = "_blank"; a.rel = "noopener"; a.textContent = L("看交易", "View tx"); m.appendChild(a); }
    }
    function errText(e) {
        const datas = [e?.data, e?.info?.error?.data, e?.info?.error?.data?.data, e?.error?.data].filter((d) => typeof d === "string" && d.startsWith("0x"));
        for (const d of datas) { try { const p = ERRS.parseError(d); if (p) return p.name; } catch (_) {} }
        const x = CH.explain(e);
        if (x.code === "REJECTED") return L("你在錢包取消了", "Cancelled in wallet");
        if (x.code === "GAS") return L("POL 不夠付手續費", "Not enough POL for gas");
        return x.name || x.msg || String(e?.message || e);
    }
    function bind(box) {
        box.querySelectorAll(".adm-mode button").forEach((b) => b.addEventListener("click", () => { if (!b.disabled) setMode(b.dataset.m); }));
        $("admRefresh")?.addEventListener("click", (ev) => { ev.currentTarget.classList.add("spin"); load(); });
        box.querySelectorAll(".adm-tabs button").forEach((b) => b.addEventListener("click", () => {
            tab = b.dataset.tab; ls.set("asc-admin-tab", tab);
            query = ""; const s = $("admSearch"); if (s) s.value = "";
            applyView();
        }));
        $("admSearch")?.addEventListener("input", (e) => { query = e.target.value; applyView(); });
        box.querySelectorAll(".adm-lvf button").forEach((b) => b.addEventListener("click", () => { lvf = b.dataset.lv; ls.set("asc-admin-lv", lvf); applyView(); }));
        const qb = $("admQuickBox"); if (qb) bindQuick(qb);
        box.querySelectorAll("details.adm-act").forEach((d) => d.addEventListener("toggle", () => (d.open ? openRows.add(d.dataset.key) : openRows.delete(d.dataset.key))));
        box.querySelectorAll(".adm-act").forEach((card) => {
            const x = A[Number(card.dataset.i)];
            if (msgs[card.dataset.i]) say(card, ...msgs[card.dataset.i]);
            card.querySelector(".adm-send")?.addEventListener("click", async (ev) => {
                const btn = ev.currentTarget;
                let args;
                try { args = collect(x, card); } catch (e) { say(card, e.message, "bad"); return; }
                if (!(await confirmIt(x, args))) return;
                btn.disabled = true;
                try {
                    const h = await sendTx(x, args, (t, kind, hash) => say(card, t, kind, hash));
                    toast(`${L("完成", "Done")}：${L(x.zh, x.en)}`, "ok", h);
                    await load();
                } catch (e) { console.warn(e); say(card, errText(e), "bad"); }
                finally { btn.disabled = false; }
            });
            card.querySelector(".adm-add")?.addEventListener("click", () => {
                let args;
                try { args = collect(x, card); } catch (e) { say(card, e.message, "bad"); return; }
                addBatch(x, args);
                say(card, `🛒 ${L("已加入批次", "Added to batch")}（${L("共", "total")} ${batch.length}）`, "ok");
            });
        });
        bindRefund(box);
        const look = async () => {
            const out = $("adLookOut");
            let a;
            try { a = E.getAddress($("adLookAddr").value.trim()); } catch (_) { out.innerHTML = `<div><span>${L("地址格式不對", "Invalid address")}</span></div>`; return; }
            out.innerHTML = `<div><span>${L("讀取中…", "Loading…")}</span></div>`;
            try {
                const r = CH.read;
                const P = new E.Contract(C.parts, ["function frozen(address) view returns (bool)"], CH.ro);
                const [us, bal, nf, ni, pf] = await Promise.all([r.vault.userStatus(a), r.vault.balanceOf(a), r.nft.frozen(a), r.nft.info(a), P.frozen(a)]);
                const rows = [[L("已驗證", "Verified"), yes(us.verified)], [L("被標記", "Flagged"), yes(us.flagged)], ["ASC", int(bal)], [L("本期已存款", "Deposited this period"), usd(us.depositedThisPeriod)],
                    [L("NFT 凍結", "NFT frozen"), yes(nf)], [L("配件凍結", "Parts frozen"), yes(pf)], [L("鑄造額度", "Mint allowance"), int(ni.me[0])], [L("VIP 到期", "VIP until"), Number(ni.me[1]) * 1000 > Date.now() ? when(ni.me[1]) : L("沒有", "None")], [L("轉蛋次數", "Pulls"), int(ni.me[2])], [L("持有 NFT", "NFTs held"), int(ni.me[3])]];
                out.innerHTML = rows.map(([x, y]) => `<div><span>${esc(x)}</span><b>${esc(y)}</b></div>`).join("");
            } catch (e) { out.innerHTML = `<div><span>${esc(errText(e))}</span></div>`; }
        };
        $("adLookBtn")?.addEventListener("click", look);
        $("adLookAddr")?.addEventListener("keydown", (e) => { if (e.key === "Enter") look(); });
    }
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || !cartOpen || document.querySelector(".adm-modal")) return;
        cartOpen = false; $("admCartRoot")?.classList.remove("open");
    });

    let loading = null;
    async function load() {
        if (loading) return loading;
        loading = (async () => {
            try {
                await readRoles();
                if (visible()) await readState();
                st.ok = true;
            } catch (e) { console.warn("admin", e); }
            render();
        })().finally(() => (loading = null));
        return loading;
    }
    CH.onAccount(() => load());
    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    if (CH.account) load();
    /* RPC 偶爾失敗（限流）時自動重試，避免面板一直不出現 */
    setInterval(() => { if (CH.account && !st.ok && !loading) load(); }, 8000);
    window.ASCAdmin = { load, render, state: st, actions: A, get batch() { return batch; } };
})();
