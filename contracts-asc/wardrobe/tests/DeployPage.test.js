// 模擬部署網頁（deploy/wardrobe.html）的流程：用網頁內嵌的 bytecode 部署 → 讀 V2 Equipped 產生批次 → owner（當作 Safe）逐筆執行
const { expect } = require("chai");
const { ethers } = require("hardhat");
const ART = require(process.env.HOME + "/mnt/2026_web3_solidity_smart_contract/deploy/wardrobe-artifacts.json");
const NFT_ABI = ["function giveParts(address user,uint256 partId,uint256 amount)", "function setPrices(uint256 random_,uint256 change_,uint256 gacha_)", "function randomFee() view returns (uint256)", "function gachaFee() view returns (uint256)", "event Equipped(uint256 indexed tokenId, address indexed owner, uint256[] partIds, uint256[] clearSlots)"];

it("部署網頁流程：部署、搬遷登記、公庫存、停用舊換裝", async function () {
    const [safe, deployer, alice] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
    const asc = await (await ethers.getContractFactory("AscPointV2")).deploy(safe.address, usdt, 6, 100000);
    const parts = await (await ethers.getContractFactory("AscCatParts")).deploy(safe.address, "");
    const nft = await (await ethers.getContractFactory("AscCatSamuraiV2")).deploy(safe.address, asc, parts, 100, "");
    await parts.setMinter(nft);
    await nft.setPrices(5, 0, 10);
    await nft.airdrop([alice.address, alice.address]);
    await nft.connect(alice).reveal([0, 1]);
    await nft.grantVip([alice.address], 30);
    // V2 時期：#0 穿上 1 再換 2（1 燒掉消失）、臉穿 257 後脫掉；#1 穿上 513
    await nft.giveParts(alice.address, 1, 1); await nft.giveParts(alice.address, 2, 1); await nft.giveParts(alice.address, 257, 1); await nft.giveParts(alice.address, 513, 1);
    await nft.connect(alice).equip(0, [1, 257], []);
    await nft.connect(alice).equip(0, [2], [1]);
    await nft.connect(alice).equip(1, [513], []);

    // 1. 部署（網頁的做法）
    const impl = await new ethers.ContractFactory(ART.Wardrobe.abi, ART.Wardrobe.bytecode, deployer).deploy();
    await impl.waitForDeployment();
    const data = new ethers.Interface(ART.Wardrobe.abi).encodeFunctionData("initialize", [safe.address, ethers.ZeroAddress, await nft.getAddress(), await parts.getAddress(), await asc.getAddress(), 10]);
    const px = await new ethers.ContractFactory(ART.ERC1967Proxy.abi, ART.ERC1967Proxy.bytecode, deployer).deploy(await impl.getAddress(), data);
    await px.waitForDeployment();
    const wd = new ethers.Contract(await px.getAddress(), ART.Wardrobe.abi, safe);
    expect(await wd.owner()).to.equal(safe.address);

    // 2. 產生批次（網頁的做法）
    const c = new ethers.Contract(await nft.getAddress(), NFT_ABI, ethers.provider);
    const worn = {};
    for (const l of await c.queryFilter(c.filters.Equipped(), 0, await ethers.provider.getBlockNumber())) {
        const id = String(l.args.tokenId), w = (worn[id] ||= {});
        for (const pid of l.args.partIds.map(Number)) w[Math.floor(pid / 256)] = pid;
        for (const s of l.args.clearSlots.map(Number)) delete w[s];
    }
    const seed = { ids: [], slots: [], pids: [] }, give = {};
    for (const [id, w] of Object.entries(worn)) for (const [slot, pid] of Object.entries(w)) { seed.ids.push(id); seed.slots.push(slot); seed.pids.push(pid); give[pid] = (give[pid] || 0n) + 1n; }
    expect(seed.pids.map(Number).sort()).to.deep.equal([2, 513]); // 1 已被換掉、257 已脫掉
    const stock = { 3: 50n, 4: 50n };
    const W = new ethers.Interface(ART.Wardrobe.abi), N = new ethers.Interface(NFT_ABI);
    const txs = [];
    const wa = await wd.getAddress(), na = await nft.getAddress();
    for (const pid of [...new Set([...Object.keys(give), ...Object.keys(stock)])]) txs.push({ to: na, data: N.encodeFunctionData("giveParts", [wa, pid, (give[pid] || 0n) + (stock[pid] || 0n)]) });
    txs.push({ to: wa, data: W.encodeFunctionData("setFixedSlots", [[0, 1, 2, 3], true]) });
    txs.push({ to: wa, data: W.encodeFunctionData("seedWorn", [seed.ids, seed.slots, seed.pids]) });
    txs.push({ to: wa, data: W.encodeFunctionData("addStock", [Object.keys(stock), Object.values(stock)]) });
    txs.push({ to: wa, data: W.encodeFunctionData("closeSeed", []) });
    const [r, g] = await Promise.all([c.randomFee(), c.gachaFee()]);
    txs.push({ to: na, data: N.encodeFunctionData("setPrices", [r, 1000000000n, g]) });
    for (const t of txs) await safe.sendTransaction(t); // Safe 逐筆執行

    expect(await wd.held(2)).to.equal(1);
    expect(await wd.held(513)).to.equal(1);
    expect(await wd.stock(3)).to.equal(50);
    expect(await wd.seedClosed()).to.equal(true);
    expect(await nft.changeFee()).to.equal(1000000000n);
    expect(await nft.randomFee()).to.equal(5);
    // 玩家用衣櫃換掉 V2 穿上的 #0 武器 2 → 退回；VIP 借穿 3
    await parts.connect(alice).setApprovalForAll(wa, true);
    await wd.connect(alice).change(0, [{ slot: 0, partId: 3, borrow: true }]);
    expect(await parts.balanceOf(alice.address, 2)).to.equal(1);
    expect(await wd.stock(3)).to.equal(49);
    // 舊 V2 換裝實際上不能用了（付不出 10 億 ASC）
    await expect(nft.connect(alice).equip(1, [], [4])).to.be.reverted;
});
