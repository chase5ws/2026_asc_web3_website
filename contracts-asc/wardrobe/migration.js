// ASC 專用：衣櫃搬遷清單：讀主網 NFT（V2）的 Equipped 事件，找出「目前還穿著、當初是用 V2 換裝穿上（已燒掉）」的配件
// 輸出：要先用 NFT 的 giveParts 發給衣櫃的數量（give），以及 seedWorn 的參數（seed）
//   NFT=0xc70E…52E0 FROM=96182586 node scripts/wardrobe/migration.js > migration.json
// 原始外觀（鑄造時就有的）不在清單裡：換掉就消失（超稀有另由管理面板退還）
const { ethers } = require("ethers");

const RPC = process.env.RPC || "https://polygon-bor-rpc.publicnode.com";
const NFT = process.env.NFT || "0xc70E923942B9404268C4842E6A42CFE5be6152E0";
const FROM = Number(process.env.FROM || 96182586);
const ABI = ["event Equipped(uint256 indexed tokenId, address indexed owner, uint256[] partIds, uint256[] clearSlots)"];

async function main() {
    const ro = new ethers.JsonRpcProvider(RPC, 137, { staticNetwork: true });
    const c = new ethers.Contract(NFT, ABI, ro);
    const head = await ro.getBlockNumber();
    const worn = {}; // tokenId → slot → partId
    for (let a = FROM; a <= head; a += 9000) {
        const b = Math.min(a + 8999, head);
        for (const l of await c.queryFilter(c.filters.Equipped(), a, b)) {
            const id = String(l.args.tokenId), w = (worn[id] ||= {});
            for (const pid of l.args.partIds.map(Number)) w[Math.floor(pid / 256)] = pid;
            for (const s of l.args.clearSlots.map(Number)) delete w[s];
        }
    }
    const seed = { ids: [], slots: [], partIds: [] }, give = {};
    for (const [id, w] of Object.entries(worn)) for (const [slot, pid] of Object.entries(w)) {
        seed.ids.push(id); seed.slots.push(slot); seed.partIds.push(pid);
        give[pid] = (give[pid] || 0) + 1;
    }
    console.log(JSON.stringify({ nft: NFT, toBlock: head, give, seed }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
