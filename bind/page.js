/* 綁定錢包：Discord 機器人給的連結 bind/#bind=金鑰 → 讀取要簽的文字 → MetaMask 簽名 → 送回機器人 */
(function () {
    const A = window.ASC;
    const { $, L, E, C, esc, say, short } = A;
    const token = /(?:^#|&)bind=([0-9a-f]{48})/.exec(location.hash)?.[1];
    let session = null;

    function showSession() {
        if (!session) return;
        $("bindWho").innerHTML = `Discord：<b>${esc(session.username)}</b>`;
        $("bindText").textContent = session.message;
    }

    async function start() {
        const msg = $("bindMsg");
        if (!token) { $("bindWho").textContent = ""; return say(msg, L("bind.invalid"), "err"); }
        $("bindWho").textContent = L("bind.loading");
        const api = String(C.botApi || "").replace(/\/$/, "");
        if (!api) { $("bindWho").textContent = ""; return say(msg, L("bind.noApi"), "err"); }
        try {
            const r = await fetch(`${api}/api/bind/${token}`, { signal: AbortSignal.timeout(10000) });
            session = await r.json();
            if (!session.ok) throw new Error(session.error || L("bind.invalid"));
        } catch (e) {
            session = null;
            $("bindWho").textContent = "";
            return say(msg, e.message === "Failed to fetch" ? L("bind.offline") : e.message, "err");
        }
        showSession();
        $("bindGo").disabled = false;
        $("bindGo").onclick = async () => {
            if (!window.ethereum) {
                say(msg, L("bind.noWallet"), "warn");
                return setTimeout(A.openInMetaMask, 800);
            }
            $("bindGo").disabled = true;
            try {
                say(msg, L("bind.pick"));
                const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
                say(msg, L("bind.sign"));
                const signature = await window.ethereum.request({ method: "personal_sign", params: [E.hexlify(E.toUtf8Bytes(session.message)), addr] });
                say(msg, L("bind.verify"));
                const r = await fetch(`${api}/api/bind/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr, signature }) }).then((x) => x.json());
                if (!r.ok) throw new Error(r.error || L("bind.fail"));
                $("bindGo").hidden = true;
                msg.className = "msg ok";
                msg.textContent = L("bind.ok", { a: short(r.address) });
                history.replaceState?.(null, "", location.pathname);
            } catch (e) {
                say(msg, e?.code === 4001 ? L("bind.cancel") : e.message || String(e), "err");
                $("bindGo").disabled = false;
            }
        };
    }
    document.addEventListener("DOMContentLoaded", start);
    A.onLang(showSession);
})();
