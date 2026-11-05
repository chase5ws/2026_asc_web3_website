// 活動徽章：代碼領取、期限、名額、驗證錢包、不能轉移、背景穿戴（轉手自動失效）、管理員補發／收回、角色、升級
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const hash = (id, code) => ethers.solidityPackedKeccak256(["uint256", "string"], [id, code]);

describe("EventBadges（活動徽章）", function () {
    let owner, admin, alice, bob, carol, op, guard, nft, vault, b, now;

    beforeEach(async function () {
        [owner, admin, alice, bob, carol, op, guard] = await ethers.getSigners();
        nft = await (await ethers.getContractFactory("MockCatNFT")).deploy();
        vault = await (await ethers.getContractFactory("MockVault")).deploy();
        const impl = await (await ethers.getContractFactory("EventBadges")).deploy();
        const data = impl.interface.encodeFunctionData("initialize", [owner.address, guard.address, await nft.getAddress(), await vault.getAddress(), "https://x/badges/"]);
        const proxy = await (await ethers.getContractFactory("ERC1967Proxy")).deploy(await impl.getAddress(), data);
        b = await ethers.getContractAt("EventBadges", await proxy.getAddress());
        await b.setAdmin(admin.address);
        await nft.mint(alice.address, 0, true);
        await nft.mint(bob.address, 1, true);
        await nft.mint(alice.address, 2, false);
        for (const u of [alice, bob]) await vault.setVerified(u.address, true);
        now = await time.latest();
        await b.connect(admin).createEvent(1, hash(1, "中秋2026"), now, now + 3600, 0, true, true);
    });

    it("實作合約鎖住，不能被初始化", async function () {
        const impl = await (await ethers.getContractFactory("EventBadges")).deploy();
        await expect(impl.initialize(owner.address, ethers.ZeroAddress, await nft.getAddress(), await vault.getAddress(), "")).to.be.revertedWithCustomError(impl, "InvalidInitialization");
        expect(await impl.owner()).to.equal(ethers.ZeroAddress);
        expect(await b.owner()).to.equal(owner.address);
    });

    it("輸入正確代碼領取；一個錢包只能領一次", async function () {
        await expect(b.connect(alice).claim(1, "錯的")).to.be.revertedWithCustomError(b, "WrongCode");
        await expect(b.connect(alice).claim(1, "中秋2026")).to.emit(b, "Claimed").withArgs(1, alice.address, false);
        expect(await b.balanceOf(alice.address, 1)).to.equal(1);
        expect((await b.eventOf(1)).claimed).to.equal(1);
        await expect(b.connect(alice).claim(1, "中秋2026")).to.be.revertedWithCustomError(b, "AlreadyClaimed");
        expect(await b.badgesOf(alice.address)).to.deep.equal([1n]);
        expect(await b.uri(1)).to.equal("https://x/badges/1.json");
    });

    it("代碼綁活動編號：同一組代碼不能拿去領別場", async function () {
        await b.connect(admin).createEvent(2, hash(2, "別的"), now, now + 3600, 0, false, false);
        await expect(b.connect(alice).claim(2, "中秋2026")).to.be.revertedWithCustomError(b, "WrongCode");
    });

    it("活動期間外不能領：還沒開始、已經結束", async function () {
        await b.connect(admin).createEvent(3, hash(3, "c"), now + 1000, now + 2000, 0, false, false);
        await expect(b.connect(alice).claim(3, "c")).to.be.revertedWithCustomError(b, "NotOpen");
        await time.increaseTo(now + 1000);
        await b.connect(alice).claim(3, "c");
        await time.increaseTo(now + 2001);
        await expect(b.connect(bob).claim(3, "c")).to.be.revertedWithCustomError(b, "NotOpen");
    });

    it("限定 Discord 綁定的錢包、限定持有喵武士", async function () {
        await expect(b.connect(carol).claim(1, "中秋2026")).to.be.revertedWithCustomError(b, "NotVerified");
        await vault.setVerified(carol.address, true);
        await expect(b.connect(carol).claim(1, "中秋2026")).to.be.revertedWithCustomError(b, "NotHolder");
        await b.connect(admin).createEvent(4, hash(4, "open"), now, now + 3600, 0, false, false);
        await b.connect(carol).claim(4, "open"); // 兩個限制都關掉：誰都能領
    });

    it("名額上限", async function () {
        await b.connect(admin).createEvent(5, hash(5, "k"), now, now + 3600, 1, false, false);
        await b.connect(alice).claim(5, "k");
        await expect(b.connect(bob).claim(5, "k")).to.be.revertedWithCustomError(b, "EventFull");
    });

    it("不能轉移、不能授權", async function () {
        await b.connect(alice).claim(1, "中秋2026");
        await expect(b.connect(alice).safeTransferFrom(alice.address, bob.address, 1, 1, "0x")).to.be.revertedWithCustomError(b, "Soulbound");
        await expect(b.connect(alice).safeBatchTransferFrom(alice.address, bob.address, [1], [1], "0x")).to.be.revertedWithCustomError(b, "Soulbound");
        await expect(b.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWithCustomError(b, "Soulbound");
    });

    it("穿背景：只能穿自己有的徽章、自己的已解盲喵武士", async function () {
        await expect(b.connect(alice).wear(0, 1)).to.be.revertedWithCustomError(b, "NoBadge");
        await b.connect(alice).claim(1, "中秋2026");
        await expect(b.connect(alice).wear(1, 1)).to.be.revertedWithCustomError(b, "NotTokenOwner");
        await expect(b.connect(alice).wear(2, 1)).to.be.revertedWithCustomError(b, "NotRevealed");
        await expect(b.connect(alice).wear(0, 1)).to.emit(b, "BackgroundSet").withArgs(0, alice.address, 1);
        expect(await b.backgroundOf(0)).to.equal(1);
        await nft.setFrozen(alice.address, true);
        await expect(b.connect(alice).wear(0, 0)).to.be.revertedWithCustomError(b, "WalletFrozen");
        await nft.setFrozen(alice.address, false);
        await b.connect(alice).wear(0, 0); // 拿掉
        expect(await b.backgroundOf(0)).to.equal(0);
    });

    it("喵武士轉手：背景自動失效；轉回來又有效；徽章留在原錢包可穿別隻", async function () {
        await b.connect(alice).claim(1, "中秋2026");
        await b.connect(alice).wear(0, 1);
        await nft.transfer(0, bob.address);
        expect(await b.backgroundOf(0)).to.equal(0);
        expect(await b.balanceOf(alice.address, 1)).to.equal(1);
        expect(await b.backgroundsOf([0, 1, 99])).to.deep.equal([0n, 0n, 0n]);
        // 新主人可以換成自己的背景（覆蓋舊紀錄）
        await b.connect(admin).grant(1, [bob.address]);
        await b.connect(bob).wear(0, 1);
        expect(await b.backgroundOf(0)).to.equal(1);
        const [badge, by] = await b.wearOf(0);
        expect([badge, by]).to.deep.equal([1n, bob.address]);
    });

    it("管理員補發（不看期限與代碼）與收回（背景失效、不能再領）", async function () {
        await time.increaseTo(now + 7200); // 活動已結束
        await b.connect(admin).grant(1, [alice.address, carol.address]);
        await expect(b.connect(admin).grant(1, [alice.address])).to.be.revertedWithCustomError(b, "AlreadyClaimed");
        await b.connect(alice).wear(0, 1);
        await b.connect(admin).revoke(1, alice.address);
        expect(await b.balanceOf(alice.address, 1)).to.equal(0);
        expect(await b.backgroundOf(0)).to.equal(0);
        expect((await b.eventOf(1)).claimed).to.equal(1);
        await expect(b.connect(alice).grant(1, [bob.address])).to.be.revertedWithCustomError(b, "NotAdmin");
    });

    it("修改活動：換代碼、提早結束；建立的檢查", async function () {
        await expect(b.connect(admin).createEvent(1, hash(1, "x"), now, now + 1, 0, false, false)).to.be.revertedWithCustomError(b, "EventExists");
        await expect(b.connect(admin).createEvent(0, hash(0, "x"), now, now + 1, 0, false, false)).to.be.revertedWithCustomError(b, "BadEvent");
        await expect(b.connect(admin).createEvent(9, hash(9, "x"), now + 5, now, 0, false, false)).to.be.revertedWithCustomError(b, "BadTime");
        await b.connect(admin).updateEvent(1, hash(1, "新代碼"), now, now + 3600, 0, true, true);
        await expect(b.connect(alice).claim(1, "中秋2026")).to.be.revertedWithCustomError(b, "WrongCode");
        await b.connect(alice).claim(1, "新代碼");
        await b.connect(admin).updateEvent(1, ethers.ZeroHash, now, now, 0, true, true); // 提早結束，代碼不變
        await expect(b.connect(bob).claim(1, "新代碼")).to.be.revertedWithCustomError(b, "NotOpen");
        expect(await b.eventIds()).to.deep.equal([1n]); // 9 號建立失敗，沒有被加進去
        expect(await b.hashCode(1, "新代碼")).to.equal(hash(1, "新代碼"));
    });

    it("暫停：operator 只能暫停，恢復要 admin", async function () {
        await b.connect(admin).setOperator(op.address);
        await b.connect(op).emergencyPause();
        await expect(b.connect(alice).claim(1, "中秋2026")).to.be.revertedWithCustomError(b, "IsPaused");
        await expect(b.connect(op).setPaused(false)).to.be.revertedWithCustomError(b, "NotAdmin");
        await b.connect(admin).setPaused(false);
        await b.connect(alice).claim(1, "中秋2026");
    });

    it("主人兩步轉移（admin 清空）、守護錢包救援、只有 owner 能升級", async function () {
        await b.transferOwnership(carol.address);
        await expect(b.connect(bob).acceptOwnership()).to.be.revertedWithCustomError(b, "NotPendingOwner");
        await b.connect(carol).acceptOwnership();
        expect(await b.owner()).to.equal(carol.address);
        expect(await b.admin()).to.equal(ethers.ZeroAddress);
        await b.connect(guard).guardianTakeover(owner.address);
        expect(await b.owner()).to.equal(owner.address);
        const v2 = await (await ethers.getContractFactory("EventBadges")).deploy();
        await expect(b.connect(alice).upgradeToAndCall(await v2.getAddress(), "0x")).to.be.revertedWithCustomError(b, "NotOwner");
        await b.connect(alice).claim(1, "中秋2026");
        await b.upgradeToAndCall(await v2.getAddress(), "0x");
        expect(await b.balanceOf(alice.address, 1)).to.equal(1); // 升級後資料還在
    });
});
