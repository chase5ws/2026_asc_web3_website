/* 捐獻金庫：直接把 USDT 轉進 AscPoint 金庫（全部進入 ASC 持有者可兌換的池子，不進保底，owner 提不走） */
(function () {
    const A = window.ASC;
    const { C, E, $, L, say } = A;
    if (!E || !C.usdt || !C.vault) return;
    const usdt = new E.Contract(C.usdt, ["function balanceOf(address) view returns (uint256)", "function transfer(address, uint256) returns (bool)"], A.provider);
    const fmt = (v) => Number(E.formatUnits(v, 6)).toLocaleString("en-US", { maximumFractionDigits: 6 });

    async function show() {
        $("donateBal").textContent = A.account ? L("donate.bal", { n: fmt(await usdt.balanceOf(A.account).catch(() => 0n)) }) : "";
    }
    document.addEventListener("DOMContentLoaded", () => {
        $("donateGo").onclick = async () => {
            const msg = $("donateMsg");
            let amount;
            try { amount = E.parseUnits(String($("donateAmt").value || "0").trim(), 6); } catch (_) { amount = 0n; }
            if (amount <= 0n) return say(msg, L("donate.bad"), "err");
            if (!A.account) { await A.connect().catch(() => {}); if (!A.account) return; }
            if (!confirm(L("donate.confirm", { n: fmt(amount) }))) return;
            const tx = await A.sendTx(msg, L("donate.go"), (c) => c.transfer(C.vault, amount), usdt);
            if (tx) { msg.innerHTML += ` ${L("donate.thanks")}`; $("donateAmt").value = ""; show(); }
        };
    });
    A.onUpdate(() => show().catch(() => {}));
})();
