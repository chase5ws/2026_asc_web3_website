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

    /* ── 畫面 ── */
    const LV = { operator: ["operator", "operator"], admin: ["admin", "admin"], owner: ["★ owner", "★ owner"], pending: ["新主人", "pending owner"] };
    const short = (a) => (a ? CH.short(a) : "–");
    const addrLink = (a) => (a ? `<a href="${CH.link("address", a)}" target="_blank" rel="noopener">${short(a)}</a>` : "–");

    function roleTable() {
        const rows = KINDS.map(([k, zh, en]) => {
            const r = st.roles[k], m = me(k), s = safeOf(r.owner);
            const mine = [m.owner && "owner", m.signer && L("Safe 簽署人", "Safe signer"), m.admin && "admin", m.op && "operator", m.pending && L("新主人", "pending")].filter(Boolean).join(L("、", ", ")) || "–";
            return `<tr><td>${esc(L(zh, en))}</td><td>${addrLink(r.owner)}${s && s.th ? ` <span class="ad-tag">Safe ${s.th}/${s.owners.length}</span>` : ""}${r.pending && r.pending !== ZERO ? `<br><small class="muted">${L("等待接受", "pending")}：${addrLink(r.pending)}</small>` : ""}</td><td>${addrLink(r.admin)}</td><td>${k === "market" ? "—" : addrLink(r.operator)}</td><td><b>${esc(mine)}</b></td></tr>`;
        }).join("");
        return `<div class="ad-scroll"><table class="ad-table"><thead><tr><th>${L("合約", "Contract")}</th><th>owner</th><th>admin</th><th>operator</th><th>${L("你的權限", "Your role")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    function stateGrid(k) {
        const v = st.vault, n = st.nft, m = st.market;
        const items = {
            vault: v && [[L("兌換／互轉", "Redeem/transfer"), yes(v.open)], [L("買 ASC", "Buy ASC"), yes(v.depositOpen)], [L("結束模式", "Shutdown"), v.shutdown ? L("是", "Yes") : L("否", "No")], [L("只限驗證", "Verified only"), yes(v.verifiedOnly)],
                [L("互轉稅", "Transfer tax"), pct(v.transferTaxBps)], [L("被標記扣除", "Flag penalty"), pct(v.flagPenaltyBps)], [L("每期存款上限", "Deposit cap"), Number(v.maxDepositPerPeriod) ? usd(v.maxDepositPerPeriod) : L("不限", "None")], [L("每人每期兌換上限", "Redeem cap"), pct(v.capBps)],
                [L("起始價", "Start price"), usd(v.startPrice)], [L("手續費分配", "Fee split"), `${pct(v.feeToReserveBps)} / ${pct(v.feeToNextBps)}`], [L("這一期開始", "Period start"), when(v.periodStart)], [L("池子 USDT", "Pool USDT"), usd(v.usdtBal)], [L("保底（可提領）", "Reserve"), usd(v.reserve)], [L("流通 ASC", "ASC supply"), int(v.supply)]],
            nft: n && [[L("白名單鑄造", "Mint sale"), yes(n.saleOpen)], [L("暫停", "Paused"), n.paused ? L("是", "Yes") : L("否", "No")], [L("已用編號／上限", "Minted / max"), `${int(n.nextId)} / ${int(n.maxSupply)}`], [L("鑄造／換裝／轉蛋", "Mint / equip / gacha"), `${n.randomFee} / ${n.changeFee} / ${n.gachaFee} ASC`],
                ["VIP", Number(n.vipPrice) ? `${n.vipPrice} ASC / ${n.vipDays} ${L("天", "days")}` : L("不販售", "Not for sale")], [L("轉蛋只限 VIP", "Gacha VIP only"), yes(n.gachaVipOnly)], [L("獎池配件數", "Pool prizes"), `${n.pool.ids.length}（miss ${n.pool.miss}）`]],
            parts: st.parts && [["minter", same(st.parts.minter, C.nft) ? L("喵武士 NFT ✓", "Cat Samurai NFT ✓") : short(st.parts.minter)]],
            market: m && [[L("手續費", "Fee"), pct(m.feeBps)], [L("被標記賣家", "Flagged seller"), pct(m.flagFeeBps)], [L("單筆上限", "Max trade"), Number(m.maxTradeValue) ? `${int(m.maxTradeValue)} ASC` : L("不限", "None")], [L("暫停", "Paused"), m.paused ? L("是", "Yes") : L("否", "No")], [L("掛單數", "Listings"), int(m.count)]]
        }[k];
        if (!items) return "";
        return `<div class="ad-state">${items.map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>`;
    }
    function field(x, i, [name, type, zh, en], pre) {
        const id = `ad-${x.c}-${x.fn}-${i}`;
        const val = pre?.[i] ?? "";
        const lab = `<span>${esc(L(zh, en))}</span>`;
        if (type === "bool") return `<label class="ad-f">${lab}<select id="${id}"><option value="true"${String(val) === "true" ? " selected" : ""}>true</option><option value="false"${String(val) === "false" ? " selected" : ""}>false</option></select></label>`;
        if (type === "addrs" || type === "uints") return `<label class="ad-f wide">${lab}<textarea id="${id}" rows="2" placeholder="${esc(HINT()[type])}">${esc(val)}</textarea></label>`;
        return `<label class="ad-f${type === "str" || type.endsWith("8") ? " wide" : ""}">${lab}<input id="${id}" value="${esc(val)}" placeholder="${esc(HINT()[type] || "")}" autocomplete="off" spellcheck="false"></label>`;
    }
    function actionCard(x, idx) {
        let pre = null;
        try { pre = x.pre ? x.pre(st) : null; } catch (_) {}
        const send = canSend(x), bat = canBatch(x);
        if (!send && !bat) return "";
        return `<div class="ad-act${x.danger ? " danger" : ""}" data-i="${idx}">
<div class="ad-h"><b>${esc(L(x.zh, x.en))}</b><code>${esc(x.fn)}</code><span class="ad-lv ${x.lv}">${esc(L(...LV[x.lv]))}</span></div>
${x.d[0] ? `<p class="muted small">${esc(L(x.d[0], x.d[1]))}</p>` : ""}
${x.a.length ? `<div class="ad-fields">${x.a.map((a, i) => field(x, i, a, pre)).join("")}</div>` : ""}
<div class="ad-btns">${send ? `<button type="button" class="ad-send">${L("送出交易", "Send")}</button>` : ""}${bat ? `<button type="button" class="ad-add">${L("加入 Safe 批次", "Add to Safe batch")}</button>` : ""}</div>
<div class="msg ad-msg"></div></div>`;
    }
    function batchBar() {
        if (!batch.length && !KINDS.some(([k]) => safeOf(st.roles[k]?.owner))) return "";
        const list = batch.map((b, i) => `<li><span>${esc(b.label)}</span><code>${esc(short(b.to))}</code><button type="button" class="ad-del" data-i="${i}" aria-label="remove">×</button></li>`).join("");
        return `<div class="ad-batch"><div class="ad-h"><b>${L("Safe 批次", "Safe batch")}（${batch.length}）</b><span class="muted small">${L("owner 是 Safe：把要做的操作加進來，下載 JSON 後到 Safe → Apps → Transaction Builder 拖進去，簽名執行", "Owner is a Safe: add actions, download the JSON, then drop it into Safe → Apps → Transaction Builder")}</span></div>
${batch.length ? `<ol>${list}</ol>` : `<p class="muted small">${L("還沒有加入任何操作", "Nothing added yet")}</p>`}
<div class="ad-btns"><button type="button" id="adDl"${batch.length ? "" : " disabled"}>${L("下載 Safe JSON", "Download Safe JSON")}</button><button type="button" id="adClr" class="alt"${batch.length ? "" : " disabled"}>${L("清空", "Clear")}</button></div></div>`;
    }
    function lookupBox() {
        return `<div class="ad-look"><div class="ad-h"><b>${L("查詢錢包", "Look up a wallet")}</b></div><div class="ad-fields"><label class="ad-f wide"><span>${L("錢包地址", "Wallet")}</span><input id="adLookAddr" placeholder="0x…" autocomplete="off" spellcheck="false"></label></div>
<div class="ad-btns"><button type="button" id="adLookBtn">${L("查詢", "Look up")}</button></div><div class="ad-state" id="adLookOut"></div></div>`;
    }

    let open = { vault: true };
    /* 頁首「管理」按鈕：有權限的錢包連線後出現在錢包按鈕左邊，點了進入獨立的管理頁（#admin） */
    const onAdminPage = () => location.hash.slice(1).split("/")[0] === "admin";
    function jumpBtn(show) {
        let b = $("adminJump");
        if (!b && show) {
            const host = $("connect")?.parentElement;
            if (!host) return;
            b = document.createElement("button");
            b.id = "adminJump"; b.type = "button"; b.className = "connect on ad-jump";
            b.addEventListener("click", () => { location.hash = "admin"; window.scrollTo(0, 0); });
            host.insertBefore(b, $("connect"));
        }
        if (!b) return;
        b.textContent = L("⚙ 管理", "⚙ Admin");
        b.classList.toggle("hidden", !show);
        b.setAttribute("aria-pressed", String(onAdminPage()));
    }
    function render() {
        const box = $("adminPanel");
        if (!box) return;
        const show = st.ok && visible();
        jumpBtn(show);
        if (!show) {
            box.innerHTML = `<span class="eyebrow">ADMIN</span><h2>${L("管理員", "Admin")}</h2><p class="muted">${CH.account && !st.ok ? L("讀取權限中…", "Checking roles…") : L("請用 owner／admin／operator 錢包連線才能看到管理功能。", "Connect an owner / admin / operator wallet to see admin tools.")}</p>`;
            return;
        }
        const sections = KINDS.map(([k, zh, en]) => {
            const cards = A.map((x, i) => (x.c === k ? actionCard(x, i) : "")).join("");
            return `<details class="ad-sec" data-k="${k}"${open[k] ? " open" : ""}><summary><b>${esc(L(zh, en))}</b> <span class="muted small">${addrLink(C[k])}</span></summary>${stateGrid(k)}${cards ? `<div class="ad-acts">${cards}</div>` : `<p class="muted small">${L("你在這份合約沒有可以做的操作", "No actions available for you here")}</p>`}</details>`;
        }).join("");
        box.innerHTML = `<span class="eyebrow">ADMIN</span><h2>${L("管理員面板", "Admin panel")}</h2>
<p class="muted small">${L("只有 owner／admin／operator（或 owner Safe 的簽署人）看得到。★ owner 的操作：owner 是 Safe 時請加入批次，用 Safe 多簽執行。", "Only owners, admins, operators (or signers of the owner Safe) see this. ★ owner actions: when the owner is a Safe, add them to the batch and execute in the Safe.")}</p>
${roleTable()}${batchBar()}${lookupBox()}${sections}`;
        bind(box);
    }
    function collect(x, card) {
        return x.a.map(([name, type, zh, en], i) => {
            const el = card.querySelector(`#ad-${x.c}-${x.fn}-${i}`);
            try { return T[type](el.value); }
            catch (e) { throw new Error(`${L(zh, en)}：${e.shortMessage || e.message}`); }
        });
    }
    const msgs = {}; // 重畫面板時保留每張卡片的結果訊息
    function say(card, text, kind, hash) {
        msgs[card.dataset.i] = [text, kind, hash];
        const m = card.querySelector(".ad-msg");
        m.className = "msg ad-msg" + (kind ? " " + kind : "");
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
    function confirmIt(x, args) {
        if (!x.warn) return true;
        const lines = x.a.map(([, , zh, en], i) => `${L(zh, en)}: ${Array.isArray(args[i]) ? args[i].join(", ") : String(args[i])}`).join("\n");
        return window.confirm(`${L(x.zh, x.en)}（${x.fn}）\n${L("合約", "Contract")}: ${C[x.c]}\n${lines}${x.danger ? "\n\n" + L("⚠️ 這個操作影響很大，確定要繼續？", "⚠️ High impact. Continue?") : ""}`);
    }
    function bind(box) {
        box.querySelectorAll("details.ad-sec").forEach((d) => d.addEventListener("toggle", () => (open[d.dataset.k] = d.open)));
        box.querySelectorAll(".ad-act").forEach((card) => {
            const x = A[Number(card.dataset.i)];
            if (msgs[card.dataset.i]) say(card, ...msgs[card.dataset.i]);
            card.querySelector(".ad-send")?.addEventListener("click", async (ev) => {
                const btn = ev.currentTarget;
                let args;
                try { args = collect(x, card); } catch (e) { say(card, e.message, "bad"); return; }
                if (!confirmIt(x, args)) return;
                btn.disabled = true;
                try {
                    say(card, L("請在錢包確認…", "Confirm in your wallet…"));
                    const c = new E.Contract(C[x.c], [x.frag], await CH.signer());
                    const tx = await c[x.fn](...args);
                    say(card, L("等待上鏈…", "Waiting for confirmation…"), "", tx.hash);
                    const r = await tx.wait();
                    if (!r || r.status !== 1) throw new Error("reverted");
                    say(card, L("完成", "Done"), "ok", tx.hash);
                    await load();
                } catch (e) { console.warn(e); say(card, errText(e), "bad"); }
                finally { btn.disabled = false; }
            });
            card.querySelector(".ad-add")?.addEventListener("click", () => {
                let args;
                try { args = collect(x, card); } catch (e) { say(card, e.message, "bad"); return; }
                if (!confirmIt(x, args)) return;
                const iface = new E.Interface([x.frag]);
                const r = st.roles[x.c];
                batch.push({ to: C[x.c], data: iface.encodeFunctionData(x.fn, args), safe: x.lv === "pending" ? r.pending : r.owner, label: `${L(x.zh, x.en)} · ${(([, zh, en]) => L(zh, en).split(" ")[0])(KINDS.find(([k]) => k === x.c))}` });
                saveBatch();
                render();
            });
        });
        box.querySelectorAll(".ad-del").forEach((b) => b.addEventListener("click", () => { batch.splice(Number(b.dataset.i), 1); saveBatch(); render(); }));
        $("adClr")?.addEventListener("click", () => { batch = []; saveBatch(); render(); });
        $("adDl")?.addEventListener("click", () => {
            const safes = [...new Set(batch.map((b) => (b.safe || "").toLowerCase()))];
            if (safes.length > 1) { window.alert(L("批次裡有不同 Safe 的操作，請分開下載", "The batch mixes different Safes; download them separately")); return; }
            const json = { version: "1.0", chainId: String(C.chainId), createdAt: Date.now(),
                meta: { name: "ASC admin batch", description: batch.map((b) => b.label).join(" / ").slice(0, 900), txBuilderVersion: "1.16.5", createdFromSafeAddress: batch[0].safe },
                transactions: batch.map((b) => ({ to: b.to, value: "0", data: b.data, contractMethod: null, contractInputsValues: null })) };
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
            a.download = `asc-safe-batch-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        });
        $("adLookBtn")?.addEventListener("click", async () => {
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
        });
    }

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
    addEventListener("hashchange", () => jumpBtn(st.ok && visible()));
    new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    if (CH.account) load();
    /* RPC 偶爾失敗（限流）時自動重試，避免面板一直不出現 */
    setInterval(() => { if (CH.account && !st.ok && !loading) load(); }, 8000);
    window.ASCAdmin = { load, state: st, actions: A };
})();
