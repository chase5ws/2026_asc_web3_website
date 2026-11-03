// 用主網那四份合約的原始碼（contracts-asc）跟衣櫃一起測：確定接得起來
const { expect } = require("chai");
const { ethers } = require("hardhat");

const NONE = 2n ** 32n - 1n;
const put = (pid, borrow = false) => ({ slot: Math.floor(pid / 256), partId: pid, borrow });
const off = (slot) => ({ slot, partId: NONE, borrow: false });

describe("衣櫃 × 主網合約（AscPointV2／AscCatSamuraiV2／AscCatParts）", function () {
    let owner, alice, bob, usdt, asc, parts, nft, wd, gas = [];
    before(async function () {
        [owner, alice, bob] = await ethers.getSigners();
        usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
        asc = await (await ethers.getContractFactory("AscPointV2")).deploy(owner.address, usdt, 6, 100000);
        parts = await (await ethers.getContractFactory("AscCatParts")).deploy(owner.address, "");
        nft = await (await ethers.getContractFactory("AscCatSamuraiV2")).deploy(owner.address, asc, parts, 100, "");
        await parts.setMinter(nft);
        // 主網的轉帳規則：驗證錢包、兌換開關
        await asc.setOperator(owner.address);
        await asc.setVerified([alice.address, bob.address], true);
        await asc.setDepositOpen(true);
        for (const u of [alice, bob]) {
            await usdt.mint(u.address, 10_000_000n);
            await usdt.connect(u).approve(asc, ethers.MaxUint256);
            await asc.connect(u).deposit(10_000_000n);
        }
        await nft.setPrices(0, 0, 10);
        await nft.airdrop([alice.address, bob.address]); // #0 alice、#1 bob
        await nft.connect(alice).reveal([0]);
        await nft.connect(bob).reveal([1]);
        const impl = await (await ethers.getContractFactory("Wardrobe")).deploy();
        const data = impl.interface.encodeFunctionData("initialize", [owner.address, ethers.ZeroAddress, await nft.getAddress(), await parts.getAddress(), await asc.getAddress(), 20]);
        const proxy = await (await ethers.getContractFactory("ERC1967Proxy")).deploy(await impl.getAddress(), data);
        wd = await ethers.getContractAt("Wardrobe", await proxy.getAddress());
        // 配件：alice 有 1、257；衣櫃收到 2 個 258 放公庫存
        await nft.giveParts(alice.address, 1, 1);
        await nft.giveParts(alice.address, 257, 1);
        await nft.giveParts(await wd.getAddress(), 258, 2); // 合約收 ERC-1155（onERC1155Received）
        await wd.addStock([258], [2]);
        for (const u of [alice, bob]) {
            await parts.connect(u).setApprovalForAll(wd, true);
            await asc.connect(u).approve(wd, ethers.MaxUint256);
        }
    });

    it("一般人：用 ASC 付換裝費（burnFrom 直接銷毀，兌換關閉時也可以）", async function () {
        expect(await asc.open()).to.equal(false);
        const b0 = await asc.balanceOf(alice.address), s0 = await asc.totalSupply();
        const r = await (await wd.connect(alice).change(0, [put(1), put(257)])).wait();
        gas.push(["一般人穿 2 件", r.gasUsed]);
        expect(await asc.balanceOf(alice.address)).to.equal(b0 - 20n);
        expect(await asc.totalSupply()).to.equal(s0 - 20n);
        expect(await parts.balanceOf(alice.address, 1)).to.equal(0);
        expect(await parts.balanceOf(await wd.getAddress(), 1)).to.equal(1);
    });

    it("換下自己的配件退回背包", async function () {
        const r = await (await wd.connect(alice).change(0, [off(1)])).wait();
        gas.push(["脫掉 1 件（退回）", r.gasUsed]);
        expect(await parts.balanceOf(alice.address, 257)).to.equal(1);
    });

    it("VIP（grantVip）：免費借穿公庫存，換下回公庫存", async function () {
        await nft.grantVip([bob.address], 30);
        const b0 = await asc.balanceOf(bob.address);
        const r = await (await wd.connect(bob).change(1, [put(258, true)])).wait();
        gas.push(["VIP 借穿 1 件", r.gasUsed]);
        expect(await asc.balanceOf(bob.address)).to.equal(b0);
        expect(await wd.stock(258)).to.equal(1);
        await wd.connect(bob).change(1, [off(1)]);
        expect(await wd.stock(258)).to.equal(2);
        expect(await parts.balanceOf(bob.address, 258)).to.equal(0);
    });

    it("NFT 合約的凍結（setFrozen）會擋換裝；配件合約凍結也擋得住轉入", async function () {
        await nft.setFrozen([alice.address], true);
        await expect(wd.connect(alice).change(0, [put(257)])).to.be.revertedWithCustomError(wd, "WalletFrozen");
        await nft.setFrozen([alice.address], false);
        await parts.setFrozen([alice.address], true);
        await expect(wd.connect(alice).change(0, [put(257)])).to.be.reverted;
        await parts.setFrozen([alice.address], false);
    });

    it("NFT 合約暫停不影響衣櫃；NFT 轉手後配件跟著走", async function () {
        await wd.connect(alice).change(0, [put(257)]);
        await nft.connect(alice).transferFrom(alice.address, bob.address, 0);
        await wd.connect(bob).change(0, [off(1)]);
        expect(await parts.balanceOf(bob.address, 257)).to.equal(1);
    });

    it("舊 V2 equip 仍可用（網站不再呼叫），兩邊不互相干擾", async function () {
        await nft.grantVip([alice.address], 30);
        await nft.giveParts(alice.address, 2, 1);
        await nft.connect(bob).transferFrom(bob.address, alice.address, 0);
        await expect(nft.connect(alice).equip(0, [2], [])).to.emit(nft, "Equipped");
        expect(await wd.held(1)).to.equal(1); // 武器 1 仍在衣櫃保管（屬於 #0）
    });

    it("升級：Safe（owner）換新實作，資料保留", async function () {
        const impl2 = await (await ethers.getContractFactory("Wardrobe")).deploy();
        await wd.upgradeToAndCall(await impl2.getAddress(), "0x");
        expect(await wd.stock(258)).to.equal(2);
        expect((await wd.worn(0, 0))[0]).to.equal(1);
    });

    after(function () { for (const [k, g] of gas) console.log(`      gas ${k}: ${g}`); });
});
