/* 網頁文字（中文／English）與鏢局故事。改文字只要改這個檔案。
 * 用法：data-i18n="鍵"（純文字）、data-i18n-html="鍵"（含 HTML）、data-i18n-ph="鍵"（輸入框提示）；程式裡用 L("鍵", { 變數 })。 */
window.ASC_TEXT = {
    zh: {
        "page.title": "江湖鏢局金庫",
        "brand.title": "江湖鏢局金庫", "brand.sub": "ASC・鏈上鏢局",
        "nav.story": "鏢局故事", "nav.market": "即時幣值", "nav.mine": "我的 ASC", "nav.rules": "金庫規則", "nav.nft": "信物", "nav.how": "怎麼玩",
        "connect": "連接錢包", "refresh": "重新整理", "lang": "EN",
        "hero.title": "持有越久<br>換得<em>越多</em>",
        "hero.text": "江湖鏢局的點數是鏈上代幣 <b>ASC</b>。金庫裡的代幣由鏢局守護，先離開的人留下買路錢，留下來的人分得更多。所有規則都寫在公開的 Polygon 合約上。",
        "stat.supply": "ASC 流通量", "stat.pool": "金庫池子", "stat.open": "兌換狀態", "stat.end": "本期結束",
        "open": "開放中", "closed": "關閉中",
        "story.title": "鏢局故事", "story.banner": "「果然還是被強制推銷了嗎……」", "story.spread": "漫畫第一話（點圖放大）",
        "m.ascTitle": "ASC 點數", "m.ascSub": "玩家手上的點數", "m.circ": "流通", "m.issued": "累計發出", "m.burned": "已兌換銷毀",
        "m.priceLabel": "每 1 ASC 價值（扣手續費前）", "m.poolSub": "金庫池子", "m.avail": "可兌換", "m.reserve": "保底", "m.locked": "鎖到下一期",
        "m.issuedTotal": "累計 {n}", "m.poolBal": "池子 {n}", "m.noToken": "金庫還沒有存入任何代幣。",
        "m.per100": "100 ASC ≈ <b>{v}</b>（扣手續費前）・持有未滿 30 天實拿 70%",
        "m.day": "24 小時", "m.since": "上線以來", "m.loading": "走勢資料累積中…", "m.now": "現在", "m.hilo": "高 {hi}・低 {lo}",
        "tick.connecting": "連線中…", "tick.updated": "更新於 {t}", "tick.fail": "讀取失敗：{e}", "tick.noVault": "config.js 還沒有填金庫地址",
        "mine.locked": "連接錢包後，可以看到你的 ASC、持有天數、能換多少，並直接兌換。",
        "mine.asc": "我的 ASC", "mine.days": "持有天數・兌換比例", "mine.dayUnit": "天", "mine.all": "全部換掉現在可得",
        "mine.none": "還沒有 ASC", "mine.next": "再 {d} 天升到 {p}", "mine.max": "已達最高比例 100%",
        "mine.left": "本期還能換 {v}・{date} 換期", "mine.tier0": "未滿 30 天", "mine.tierN": "{d} 天",
        "mine.gate": "這個錢包沒有持有領取門檻的 NFT，暫時不能兌換（ASC 會一直保留）。",
        "ex.title": "兌換", "ex.desc": "用 ASC 換金庫裡的代幣，用掉的 ASC 會銷毀。金額只算到小數點後 1 位。",
        "ex.token": "代幣", "ex.points": "要用的 ASC", "ex.pointsPh": "例如 20", "ex.min": "最少", "ex.max": "本期最多", "ex.all": "全部",
        "ex.noToken": "金庫還沒有代幣。", "ex.enter": "輸入要用的 ASC（你有 {n}）",
        "ex.share": "完整份額", "ex.keep": "你拿 {p}", "ex.fee": "留給金庫（1/3 保底・1/3 下一期・1/3 持有者）", "ex.note": "實際金額以送出當下的鏈上狀態為準。",
        "ex.go": "用 {p} ASC 兌換 {v}",
        "ex.pClosed": "兌換目前關閉中", "ex.pGate": "沒有持有門檻 NFT", "ex.pPoints": "ASC 不夠（你有 {n}）", "ex.pSmall": "點數太少，換不到 0.1", "ex.pCap": "超過本期上限（還能換 {v}）",
        "ex.fillMin": "你的 ASC 目前換不到 0.1。", "ex.fillMax": "本期額度已用完。",
        "tx.title": "轉 ASC", "tx.desc": "轉給別的錢包（例如換新錢包）。只有兌換開啟時可以轉；<b>收到的 ASC 持有天數從 0 重新計算</b>。",
        "tx.to": "收款錢包", "tx.amount": "數量", "tx.amountPh": "例如 100", "tx.go": "轉出",
        "tx.closed": "兌換關閉時不能轉 ASC", "tx.bad": "地址格式不對", "tx.self": "不能轉給自己", "tx.vault": "不能轉給金庫合約", "tx.int": "數量要是正整數",
        "tx.confirm": "確定把 {n} ASC 轉給 {to}？\n收到的 ASC 持有天數會從 0 重新計算。",
        "r.open": "兌換", "r.period": "本期", "r.cap": "每人每期上限", "r.reserve": "保底", "r.reserveV": "存款 50%＋手續費 1/3（玩家換不到）",
        "r.fee": "手續費分配", "r.feeV": "1/3 保底・1/3 下一期・1/3 給持有者", "r.owner": "金庫 owner", "r.vault": "合約",
        "r.capV": "池子目前餘額的 {p}（每種代幣分開）", "r.safe": "（Safe 多簽）",
        "r.gate": "領取門檻", "r.gateDesc": "清單有 NFT 時，要持有其中任一種才能兌換；清單是空的代表沒有門檻。", "r.noGate": "目前沒有設定門檻，持有 ASC 的錢包都能兌換。",
        "nft.title": "信物 NFT", "nft.pic": "信物圖片", "nft.name": "名稱", "nft.minted": "已鑄造", "nft.wl": "白名單鑄造", "nft.me": "我的狀態",
        "nft.mint": "白名單鑄造（免費）", "nft.contract": "合約 {a}", "nft.hold": "持有 {n} 枚", "nft.allowed": "在白名單內，可以鑄造", "nft.notYet": "尚未持有",
        "nft.confirm": "請在錢包確認鑄造（免費，只需 Gas）…", "nft.done": "鑄造完成！回到 Discord 的破境結界按「破解結界」。",
        "how.1": "在 Discord 破境結界按「綁定錢包」，用 MetaMask 簽名（不花 Gas）",
        "how.2": "總鏢頭把 ASC 發到你綁定的錢包；MetaMask「匯入代幣」貼上金庫地址就看得到",
        "how.3": "回到這裡連接同一個錢包，看即時幣值與自己能換多少",
        "how.4": "持有越久比例越高；需要時輸入點數兌換，代幣直接進錢包（需要一點 POL 當 Gas）",
        "tx.wallet": "請在錢包確認「{label}」…", "tx.sent": "交易已送出，等待上鏈…", "tx.mined": "已上鏈，更新資料中…", "tx.done": "完成！", "tx.view": "查看交易",
        "err.cancel": "你取消了交易。", "err.noWallet": "找不到錢包：電腦請安裝 MetaMask，手機請用 MetaMask App 開啟此頁",
        "err.ExchangeClosed": "兌換目前關閉中（關閉時也不能轉 ASC）。", "err.NotEnoughPoints": "ASC 不夠。", "err.AmountTooSmall": "點數太少，換不到 0.1 個代幣，請多用一些點數。",
        "err.ExceedsAvailable": "超過池子可兌換的金額。", "err.OverPeriodCap": "超過本期上限，本期還能換 {v}，{date} 換期。", "err.OverPeriodCap0": "超過本期上限。",
        "err.NoGateNft": "這個錢包沒有持有指定的 NFT，無法兌換。", "err.UnknownToken": "金庫沒有這種代幣。", "err.SameAddress": "不能轉給自己。", "err.InvalidAddress": "不能轉給金庫合約。",
        "err.ERC20InsufficientBalance": "ASC 不夠。", "err.ERC20InvalidReceiver": "收款地址不正確。", "err.ZeroAmount": "數量不能是 0。", "err.fail": "失敗：{e}",
        "bind.title": "連結錢包", "bind.go": "連接錢包並簽名", "bind.text": "要簽署的文字（不花 Gas、不授權任何資產）", "bind.loading": "讀取中…",
        "bind.noApi": "網站還沒有設定機器人網址（config.js 的 botApi），請聯絡總鏢頭。", "bind.offline": "連不到機器人，請確認機器人在線上後重新整理。", "bind.invalid": "連結無效",
        "bind.noWallet": "找不到錢包。電腦請安裝 MetaMask；手機會跳到 MetaMask App 開啟此頁。", "bind.pick": "請在錢包中選擇要綁定的帳戶…", "bind.sign": "請在錢包中確認簽名（不會花費 Gas）…",
        "bind.verify": "驗證中…", "bind.fail": "綁定失敗", "bind.ok": "綁定成功：{a}\n可以關閉此頁，回到 Discord 按「我的錢包」查看。", "bind.cancel": "你取消了簽名。",
        "safety": "機器人和網站永遠不會向你要私鑰或助記詞。",
        "foot.1": "{chain}｜金庫 {vault}｜信物 {nft}｜所有資料直接讀取自區塊鏈",
        "foot.2": "合約未經專業審計，請只放可承擔風險的金額。"
    },
    en: {
        "page.title": "ASC Escort Vault",
        "brand.title": "ASC Escort Vault", "brand.sub": "ASC · ON-CHAIN ESCORT AGENCY",
        "nav.story": "Story", "nav.market": "Live Price", "nav.mine": "My ASC", "nav.rules": "Rules", "nav.nft": "NFT", "nav.how": "How to Play",
        "connect": "Connect Wallet", "refresh": "Refresh", "lang": "中文",
        "hero.title": "Hold longer,<br>earn <em>more</em>",
        "hero.text": "Points of the Escort Agency are the on-chain token <b>ASC</b>. The agency guards the tokens in the vault: whoever leaves early pays a toll, and those who stay get a bigger share. Every rule is written in a public Polygon contract.",
        "stat.supply": "ASC in circulation", "stat.pool": "Vault pool", "stat.open": "Exchange", "stat.end": "Period ends",
        "open": "Open", "closed": "Closed",
        "story.title": "The Escort Agency", "story.banner": "\"So they're pushing a hard sell again...\"", "story.spread": "Comic, episode 1 (tap to zoom)",
        "m.ascTitle": "ASC Points", "m.ascSub": "Held by players", "m.circ": "Circulating", "m.issued": "Total issued", "m.burned": "Burned by exchange",
        "m.priceLabel": "Value of 1 ASC (before fee)", "m.poolSub": "Vault pool", "m.avail": "Exchangeable", "m.reserve": "Reserve", "m.locked": "Locked to next period",
        "m.issuedTotal": "Issued {n}", "m.poolBal": "Pool {n}", "m.noToken": "No token has been deposited yet.",
        "m.per100": "100 ASC ≈ <b>{v}</b> (before fee) · held under 30 days receives 70%",
        "m.day": "24h", "m.since": "since launch", "m.loading": "Collecting chart data…", "m.now": "Now", "m.hilo": "High {hi} · Low {lo}",
        "tick.connecting": "Connecting…", "tick.updated": "Updated {t}", "tick.fail": "Read failed: {e}", "tick.noVault": "Vault address is missing in config.js",
        "mine.locked": "Connect your wallet to see your ASC, holding days and how much you can get, and exchange directly.",
        "mine.asc": "My ASC", "mine.days": "Days held · Keep rate", "mine.dayUnit": "days", "mine.all": "Exchange all now for",
        "mine.none": "No ASC yet", "mine.next": "{d} more days to reach {p}", "mine.max": "Maximum rate 100% reached",
        "mine.left": "Left this period {v} · resets {date}", "mine.tier0": "< 30 days", "mine.tierN": "{d} days",
        "mine.gate": "This wallet does not hold a required gate NFT, so it cannot exchange for now (your ASC stays safe).",
        "ex.title": "Exchange", "ex.desc": "Swap ASC for tokens in the vault. Used ASC is burned. Amounts are rounded down to 1 decimal place.",
        "ex.token": "Token", "ex.points": "ASC to use", "ex.pointsPh": "e.g. 20", "ex.min": "Min", "ex.max": "Max this period", "ex.all": "All",
        "ex.noToken": "The vault has no token yet.", "ex.enter": "Enter the ASC to use (you have {n})",
        "ex.share": "Full share", "ex.keep": "You get {p}", "ex.fee": "Stays in vault (1/3 reserve · 1/3 next period · 1/3 holders)", "ex.note": "The final amount depends on the on-chain state when sent.",
        "ex.go": "Exchange {p} ASC for {v}",
        "ex.pClosed": "Exchange is closed", "ex.pGate": "No gate NFT", "ex.pPoints": "Not enough ASC (you have {n})", "ex.pSmall": "Too few points to get 0.1", "ex.pCap": "Over this period's limit ({v} left)",
        "ex.fillMin": "Your ASC can't reach 0.1 yet.", "ex.fillMax": "This period's limit is used up.",
        "tx.title": "Send ASC", "tx.desc": "Send to another wallet (e.g. your new wallet). Only while exchange is open; <b>received ASC restarts at 0 holding days</b>.",
        "tx.to": "Recipient", "tx.amount": "Amount", "tx.amountPh": "e.g. 100", "tx.go": "Send",
        "tx.closed": "ASC can't be sent while exchange is closed", "tx.bad": "Invalid address", "tx.self": "Can't send to yourself", "tx.vault": "Can't send to the vault contract", "tx.int": "Amount must be a whole number",
        "tx.confirm": "Send {n} ASC to {to}?\nThe received ASC restarts at 0 holding days.",
        "r.open": "Exchange", "r.period": "Period", "r.cap": "Per-user limit", "r.reserve": "Reserve", "r.reserveV": "50% of deposits + 1/3 of fees (never exchangeable)",
        "r.fee": "Fee split", "r.feeV": "1/3 reserve · 1/3 next period · 1/3 holders", "r.owner": "Vault owner", "r.vault": "Contract",
        "r.capV": "{p} of the pool balance per period (per token)", "r.safe": " (Safe multisig)",
        "r.gate": "Gate NFTs", "r.gateDesc": "If the list is not empty, you must hold one of these NFTs to exchange. Empty list means no gate.", "r.noGate": "No gate: any wallet holding ASC can exchange.",
        "nft.title": "Token NFT", "nft.pic": "NFT image", "nft.name": "Name", "nft.minted": "Minted", "nft.wl": "Allowlist mint", "nft.me": "My status",
        "nft.mint": "Allowlist mint (free)", "nft.contract": "Contract {a}", "nft.hold": "Holding {n}", "nft.allowed": "On the allowlist, ready to mint", "nft.notYet": "Not holding yet",
        "nft.confirm": "Confirm the mint in your wallet (free, gas only)…", "nft.done": "Minted! Go back to Discord and press \"Break the Barrier\".",
        "how.1": "In Discord, press \"Bind Wallet\" and sign with MetaMask (no gas)",
        "how.2": "The chief escort sends ASC to your bound wallet; add the vault address in MetaMask \"Import tokens\" to see it",
        "how.3": "Come back here and connect the same wallet to see the live price and how much you can get",
        "how.4": "The longer you hold, the higher your rate; exchange whenever you like, tokens go straight to your wallet (needs a little POL for gas)",
        "tx.wallet": "Confirm \"{label}\" in your wallet…", "tx.sent": "Transaction sent, waiting for confirmation…", "tx.mined": "Confirmed, refreshing…", "tx.done": "Done!", "tx.view": "View transaction",
        "err.cancel": "You cancelled the transaction.", "err.noWallet": "No wallet found: install MetaMask on desktop, or open this page in the MetaMask app",
        "err.ExchangeClosed": "Exchange is closed (ASC can't be sent while closed).", "err.NotEnoughPoints": "Not enough ASC.", "err.AmountTooSmall": "Too few points to get 0.1 token. Use more points.",
        "err.ExceedsAvailable": "More than the vault can pay out.", "err.OverPeriodCap": "Over this period's limit: {v} left, resets {date}.", "err.OverPeriodCap0": "Over this period's limit.",
        "err.NoGateNft": "This wallet does not hold a required NFT.", "err.UnknownToken": "The vault does not hold this token.", "err.SameAddress": "Can't send to yourself.", "err.InvalidAddress": "Can't send to the vault contract.",
        "err.ERC20InsufficientBalance": "Not enough ASC.", "err.ERC20InvalidReceiver": "Invalid recipient.", "err.ZeroAmount": "Amount can't be 0.", "err.fail": "Failed: {e}",
        "bind.title": "Connect Wallet", "bind.go": "Connect & Sign", "bind.text": "Message to sign (no gas, no asset approval)", "bind.loading": "Loading…",
        "bind.noApi": "The bot address (botApi in config.js) is not set. Please contact the chief escort.", "bind.offline": "Can't reach the bot. Make sure it's online and refresh.", "bind.invalid": "Invalid link",
        "bind.noWallet": "No wallet found. Install MetaMask on desktop; on mobile this page will open in the MetaMask app.", "bind.pick": "Choose the account to bind in your wallet…", "bind.sign": "Confirm the signature in your wallet (no gas)…",
        "bind.verify": "Verifying…", "bind.fail": "Binding failed", "bind.ok": "Bound: {a}\nYou can close this page and press \"My Wallet\" in Discord.", "bind.cancel": "You cancelled the signature.",
        "safety": "The bot and this site will never ask for your private key or seed phrase.",
        "foot.1": "{chain} | Vault {vault} | NFT {nft} | All data is read directly from the blockchain",
        "foot.2": "The contract has not been professionally audited. Only use amounts you can afford to risk."
    }
};

/* 鏢局介紹與故事 */
window.ASC_STORY = {
    zh: {
        about: [
            { title: "鏢局的目標", text: "建立健康的社群環境，提供社群實習機會及業務協助，讓大家都能得到學習與成長。" },
            { title: "名稱由來", text: "「鏢局」源自古代的安全押運公司和保安公司。我們的組織形式與律師行和會計師行相似。" },
            { title: "師徒文化", text: "鏢局的文化是師徒制度：學徒學師，出師後就成為鏢師，在鏢行有身股，鏢局也替鏢師捐納候補之銜。" }
        ],
        chapters: [
            {
                tag: "第一章", title: "遷移", img: ["story-sky.jpg"],
                text: [
                    "在遠古時代，區塊鏈技術曾被視為一種革命性發明，它象徵著未來，承諾帶來透明、去中心化的新世界秩序。然而，隨著時間的推移，原本的理想主義逐漸被權力鬥爭和貪婪所侵蝕。到了 2022 年，這一技術不僅深刻改變了全球經濟格局，也意外地破壞了自然和社會的原有秩序，使得許多生物面臨生存危機。",
                    "在這樣一個背景下，喵喵一族，一群與自然和諧共存的生物，發現他們的家園日益腐朽，不再適合居住。這個族群擁有高度的智慧和社會組織，長久以來一直享受著與大自然和諧共處的生活。然而，隨著外界的破壞和腐敗漸漸侵蝕到家園，喵喵一族開始感受到前所未有的生存壓力。",
                    "面對家園的破壞和外界的威脅，喵喵族的族長做出了一個勇敢的決定：帶領族人離開原本的家園，尋找一個可以重新與世界和諧共處的新居住地。這是一個充滿未知和危險的艱難旅程，但族長的決定得到了所有族人的支持，希望和團結的力量使喵喵一族充滿了前行的勇氣。",
                    "旅途中，喵喵一族遭遇了異種軍隊的襲擊——猴子、機器人、人類等不同生物構成的軍隊。正當情況看似絕望之時，一支神秘的隊伍出現，將喵喵一族從危險中救出。這支隊伍隸屬於一個名為「資鏢局」的社群，擁有先進設施和包容心，願意接納喵喵一族，給他們一個新的開始。"
                ]
            },
            {
                tag: "第二章", title: "重整", img: ["story-samurai.jpg"],
                text: [
                    "到達資鏢局後，喵喵一族發現這裡擁有他們夢寐以求的一切：教育設施、訓練場、農地和廚房。他們開始學習新的技能，與其他居民建立關係，逐漸適應新環境。",
                    "然而，一些喵喵開始感到不滿：他們渴望的不只是適應和生存，而是回歸自然、修復原來的家園。這份渴望引發了族內的分歧，也在爭論中浮現出新的希望。在資鏢局的支持與資源下，一群喵喵開始接受特別的訓練，學習區塊鏈技術，以及如何用這項技術改善自然環境、重建社會秩序。他們後來被稱為「喵喵武士」，成為族群中的精英與領袖。",
                    "喵喵武士不只學習戰鬥技巧，更學會了如何與自然和平共處、如何用技術修復被破壞的生態。他們的訓練包括物理訓練、戰術學習與區塊鏈技術的應用，為的是成為能面對未來挑戰的戰士。",
                    "隨著時間推進，喵喵武士不僅幫助族人在資鏢局建立了穩定的社區，也開始計劃用所學改善外部世界。他們成為連接喵喵一族與外界的橋樑，尋找與其他社群合作的機會，共同建立更和諧、可持續的未來。"
                ]
            },
            {
                tag: "第三章", title: "喵太", img: ["story-street.jpg"],
                text: [
                    "在喵喵一族建立穩定社區的過程中，一位名叫「喵太」的喵喵武士逐漸脫穎而出。他在訓練中表現優異，展現出領導才能與深厚的同情心。喵太深知，要真正保護族人、恢復自然的和諧，就必須與外界建立更深層的聯繫和理解。",
                    "一天，喵太接到一項特別任務：探索一座看似和諧的遠方城鎮，尋找能協助喵喵一族用區塊鏈技術修復自然的盟友。這是他第一次單獨執行如此重要的任務。",
                    "抵達後，喵太發現城鎮表面一派繁榮，深入探查卻看見潛藏其下的矛盾與衝突——城鎮的繁榮，是以犧牲自然和弱勢群體為代價換來的，而這正是喵喵一族極力避免的。",
                    "調查途中，他遭遇了異種軍隊的突襲：正是曾經攻擊喵喵一族的猴子、機器人和人類。他們似乎對城鎮的某些秘密深感興趣，不擇手段地想控制城鎮。為了找出解決危機的辦法，喵太來到當地一間熙熙攘攘的知名酒館，融入人群，從零碎的對話中拼湊真相。"
                ]
            },
            {
                tag: "第四章", title: "敵襲！！！", img: ["story-attack.jpg", "story-qi.jpg", "story-slash.jpg", "story-return.jpg"],
                text: [
                    "就在喵太開始得到有用的情報時，他意外地再次遭遇了異種軍隊的成員。對方顯然也注意到了他。一場酒館內的衝突無可避免地爆發，喵太雖身處劣勢，卻憑藉智慧和喵喵武士的訓練，巧妙利用酒館裡的環境機敏地迴避與反擊。",
                    "最終決戰，喵太使出在資鏢局學到的精湛技藝——一刀流與氣斬。這門技巧結合了喵喵武士的戰鬥藝術與內在能量的調和，讓他以優雅而強大的方式應敵。關鍵時刻，一道閃電般的劍氣橫掃而過，異種軍隊的成員紛紛倒下。",
                    "戰鬥結束後，喵太沒有耽擱，立刻跨上預先準備好的快速移動裝置——專為喵喵武士設計、能在短時間內跨越長距離的交通工具。雖然擊退了敵人，但城鎮深藏的秘密、未解的謎團，以及他所目睹的腐敗與矛盾，仍讓他心情沉重。",
                    "「還是先回去鏢局報告吧……」"
                ]
            }
        ]
    },
    en: {
        about: [
            { title: "Our Mission", text: "To build a healthy community, offering internships and business support so that everyone can learn and grow." },
            { title: "The Name", text: "A \"biaoju\" (escort agency) was an ancient company that escorted valuables and provided security on the road. We are organized much like a law firm or an accounting partnership." },
            { title: "Master & Apprentice", text: "Our culture is mentorship: apprentices learn from a master and, once they graduate, become escorts with equity shares in the agency — and the agency sponsors their titles." }
        ],
        chapters: [
            {
                tag: "Chapter 1", title: "Migration", img: ["story-sky.jpg"],
                text: [
                    "Long ago, blockchain was hailed as a revolution — a symbol of the future that promised a transparent, decentralized world order. Over time, that idealism was eaten away by power struggles and greed. By 2022 the technology had reshaped the global economy, and it had also, unexpectedly, broken the old order of nature and society, pushing many creatures to the edge of survival.",
                    "The Meow clan, creatures who had always lived in harmony with nature, found their homeland decaying and no longer livable. Wise and well organized, they had long enjoyed a peaceful life — until the destruction and corruption of the outside world crept into their home and put them under pressure they had never known.",
                    "Facing ruin and outside threats, the clan's chief made a brave decision: lead the clan away to find a new home where they could live in harmony with the world again. The journey was hard and full of unknown dangers, but the whole clan stood behind the chief, and hope and unity gave them the courage to go on.",
                    "On the road they were attacked by an army of strange creatures — monkeys, robots and humans. Just when all seemed lost, a mysterious band appeared and rescued them. The band belonged to a community called the ASC Escort Agency, a place with advanced facilities and an open heart, willing to take the Meow clan in and give them a new start."
                ]
            },
            {
                tag: "Chapter 2", title: "Rebuilding", img: ["story-samurai.jpg"],
                text: [
                    "At the Escort Agency the Meow clan found everything they had dreamed of: schools, training grounds, farmland and kitchens. They learned new skills, made friends with other residents and slowly settled in.",
                    "Yet some of them grew restless. They wanted more than to adapt and survive — they wanted to return to nature and heal their old home. The disagreement split the clan, and out of the debate a new hope emerged. With the agency's support, a group of Meows began special training in blockchain technology and how to use it to restore nature and rebuild social order. They became known as the Meow Samurai, the elite and leaders of their people.",
                    "The Meow Samurai learned more than combat. They learned to live at peace with nature and to use technology to repair damaged ecosystems. Their training combined physical conditioning, tactics and applied blockchain, preparing them to face the challenges ahead.",
                    "In time the Meow Samurai helped build a stable community inside the agency and began planning how to improve the world outside. They became the bridge between the clan and the wider world, seeking partners to build a more harmonious and sustainable future together."
                ]
            },
            {
                tag: "Chapter 3", title: "Meowta", img: ["story-street.jpg"],
                text: [
                    "As the clan settled in, one Meow Samurai named Meowta began to stand out. He excelled in training and showed real leadership and deep compassion. Meowta knew that to truly protect his people and restore nature's balance, they needed deeper ties and understanding with the outside world.",
                    "One day Meowta received a special mission: explore a distant town that seemed peaceful and look for allies who could help the clan heal nature with blockchain. It was his first important mission alone.",
                    "The town looked prosperous on the surface, but as he dug deeper he found the conflict hidden beneath: its wealth was built on the sacrifice of nature and the weak — exactly what the Meow clan sought to avoid.",
                    "During his investigation he was ambushed by the same army of monkeys, robots and humans that had once attacked his clan. They seemed hungry for some secret of the town and would stop at nothing to control it. Searching for a way out of the crisis, Meowta slipped into a famous, crowded tavern and pieced together the truth from scraps of conversation."
                ]
            },
            {
                tag: "Chapter 4", title: "Ambush!!!", img: ["story-attack.jpg", "story-qi.jpg", "story-slash.jpg", "story-return.jpg"],
                text: [
                    "Just as Meowta began to learn something useful, he ran into members of the strange army again — and they had clearly noticed him too. A fight broke out in the tavern. Outnumbered, Meowta relied on his wits and his samurai training, using the tavern itself to dodge and strike back.",
                    "In the final clash he unleashed the art he had mastered at the Escort Agency: the One-Sword Style and the Qi Slash, a fusion of samurai swordsmanship and inner energy. At the decisive moment a lightning-fast blade of qi swept across the room, and the soldiers fell one after another.",
                    "Without a moment's delay Meowta jumped onto his ready-made rapid transport — a device built for the Meow Samurai to cross long distances in a short time. He had driven off the enemy, but the town's hidden secrets, the unsolved mystery and the corruption he had witnessed weighed heavily on him.",
                    "\"I'd better head back to the agency and report…\""
                ]
            }
        ]
    }
};
