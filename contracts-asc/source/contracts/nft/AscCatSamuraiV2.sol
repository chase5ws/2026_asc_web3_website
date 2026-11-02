// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AscRoles} from "../common/AscRoles.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IAsc {
    function burnFrom(address account, uint256 value) external;
}

interface IParts {
    function mint(address to, uint256 id, uint256 amount) external;
    function burn(address from, uint256 id, uint256 amount) external;
}

/// @title AscCatSamuraiV2 - 喵武士（ERC-721）：白名單盲盒、解盲、換裝（配件是 AscCatParts 道具）、轉蛋、VIP 訂閱
/// @notice 這份合約只管「誰擁有幾號」和會動到資產的事；每顆穿什麼記錄在鏈下的 metadata JSON（2026_asc_web3_ipfs 的 v2/state.json），
///   由同步程式（scripts/sync_v2.py）讀本合約的事件產生。部位（武器、寵物、背景…）數量不受合約限制，新增部位只要改 traits.json。
///   配件編號 partId = 部位 × 256 + 選項（對照 traits.json；只能在後面新增，不能刪除或調換順序）
///   randomMint()                   白名單：用掉 1 次鑄造額度，拿到盲盒；外觀由 RandomSeed 的 seed 決定（鏈下依 traits.json 機率算一次就寫死）
///   reveal(ids)                    持有者：解盲
///   equip(id, partIds, clearSlots) VIP：穿上背包裡的配件（交給合約銷毀）、或把某些部位脫掉；原本穿著的配件直接消失
///   buyPulls(n) / gacha(n)         用 ASC 買轉蛋次數／抽配件道具（獎池在鏈上，抽中的是 ERC-1155 道具，可以交易）
///   buyVip(periods)                用 ASC 買 VIP：每期 vipDays 天、vipPrice ASC（admin 設定；價格 0＝不開放購買，只能由管理方發）
///   所有費用（鑄造、換裝、轉蛋、VIP）都用 ASC 支付並直接銷毀：金庫池子不變、點數變少＝每點價值提高（獎勵給所有持有者）
///   付款前要先在 AscPointV2 按 approve(喵武士合約, 數量)
///   隨機數：每次都發 RandomSeed 事件，seed = keccak256(abi.encode(上一個區塊 hash, block.prevrandao, 呼叫者, nonce))
///     鑄造外觀（鏈下）：第 c 類 roll = uint256(keccak256(abi.encode(seed, c))) % 該類權重總和
///     轉蛋（鏈上）：roll = uint256(seed) % (獎池權重總和 + missWeight)
contract AscCatSamuraiV2 is ERC721Enumerable, AscRoles, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint256 public constant MAX_BATCH = 100;
    uint256 public constant MAX_GACHA_PER_TX = 10;
    uint256 public constant MAX_EQUIP = 32;
    uint256 public constant MAX_VIP_PERIODS = 12;
    uint8 public constant PURPOSE_MINT = 1;
    uint8 public constant PURPOSE_GACHA = 2;
    uint8 public constant KIND_RANDOM = 1;
    uint8 public constant KIND_AIRDROP = 2;
    uint8 public constant KIND_PRESET = 3;

    IAsc public immutable asc;
    IParts public immutable parts;
    string private _base;

    uint256 public maxSupply;
    uint256 public nextId;
    bool public saleOpen;
    bool public gachaVipOnly;
    uint256 public randomFee; // ASC 點數
    uint256 public changeFee; // ASC 點數
    uint256 public gachaFee; // ASC 點數（每抽）
    uint256 public vipPrice; // ASC 點數（每期；0＝不開放購買）
    uint256 public vipDays = 30; // 每期天數
    uint256 public nonce;

    struct Prize {
        uint32 partId;
        uint16 weight;
    }
    Prize[] private _pool;
    uint32 public missWeight;

    mapping(uint256 => bool) private _hidden;
    mapping(address => uint256) public mintAllowance;
    mapping(address => uint256) public vipUntil;
    mapping(address => uint256) public pulls;
    address public operator; // 例如 Discord 機器人的專用錢包：只能發白名單、凍結被盜錢包
    mapping(address => bool) public frozen; // 被盜錢包：NFT 不能轉出、不能換裝
    bool private _recovering;

    event Minted(uint256 indexed tokenId, address indexed to, uint8 kind);
    /// 空投指定外觀：ref＝要複製外觀的舊系列 V1 編號（鏈下讀 v1-traits）
    event PresetMinted(uint256 indexed tokenId, uint256 ref);
    event Revealed(uint256 indexed tokenId, address indexed owner);
    /// 換裝：partIds 是穿上（已銷毀）的配件，clearSlots 是脫掉的部位
    event Equipped(uint256 indexed tokenId, address indexed owner, uint256[] partIds, uint256[] clearSlots);
    event RandomSeed(address indexed user, uint8 indexed purpose, uint256 indexed ref, bytes32 prevBlockHash, uint256 prevrandao, uint256 nonce, bytes32 seed);
    event GachaPull(address indexed user, bytes32 seed, uint256 roll, uint256 totalWeight, bool hit, uint256 partId);
    event MintAllowanceSet(address indexed user, uint256 amount);
    event VipGranted(address indexed user, uint256 until);
    event VipPriceChanged(uint256 price, uint256 days_);
    event PullsChanged(address indexed user, uint256 balance);
    event Paid(address indexed user, string what, uint256 amount);
    event SettingsChanged();
    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event FrozenChanged(address indexed account, bool frozen);
    event NftsRecovered(address indexed from, address indexed to, uint256[] ids);
    event PerksMoved(address indexed from, address indexed to, uint256 allowance, uint256 vipUntil, uint256 pulls);

    error ZeroAddress();
    error SaleClosed();
    error SoldOut();
    error NoAllowance();
    error NotVip();
    error VipNotForSale();
    error NotTokenOwner(uint256 tokenId);
    error NotRevealed(uint256 tokenId);
    error AlreadyRevealed(uint256 tokenId);
    error NoChange();
    error BadAmount();
    error LengthMismatch();
    error EmptyPool();
    error BelowMinted(uint256 minted);
    error NotOperator();
    error WalletFrozen(address account);
    error NotFrozen(address account);
    error OnlyWallet();

    constructor(address initialOwner, address asc_, address parts_, uint256 maxSupply_, string memory baseURI_)
        ERC721("Asc Cat Samurai", "ACS")
        Ownable(initialOwner)
    {
        if (asc_ == address(0) || parts_ == address(0)) revert ZeroAddress();
        asc = IAsc(asc_);
        parts = IParts(parts_);
        maxSupply = maxSupply_;
        _base = baseURI_;
    }

    /// 隨機功能只給一般錢包直接呼叫：擋掉「用合約抽，結果不好就 revert 重來」的作弊（含 EIP-7702 委派的錢包）
    modifier onlyWallet() {
        if (msg.sender != tx.origin || msg.sender.code.length != 0) revert OnlyWallet();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && !_isAdmin(msg.sender)) revert NotOperator();
        _;
    }

    /* ═════════════ 玩家 ═════════════ */

    /// @notice 白名單鑄造一顆盲盒（用掉 1 次額度）
    function randomMint() external whenNotPaused nonReentrant onlyWallet returns (uint256 id) {
        if (!saleOpen) revert SaleClosed();
        uint256 a = mintAllowance[msg.sender];
        if (a == 0) revert NoAllowance();
        mintAllowance[msg.sender] = a - 1;
        _pay(randomFee, "mint");
        id = _mintBox(msg.sender, KIND_RANDOM, true);
    }

    /// @notice 解盲（可以一次解很多顆）
    function reveal(uint256[] calldata ids) external whenNotPaused {
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            if (ownerOf(id) != msg.sender) revert NotTokenOwner(id);
            if (!_hidden[id]) revert AlreadyRevealed(id);
            _hidden[id] = false;
            emit Revealed(id, msg.sender);
            emit MetadataUpdate(id);
        }
    }

    /// @notice VIP 換裝：partIds 是要穿上的配件（從背包扣、直接銷毀）；clearSlots 是要脫掉的部位（只限可以空著的部位，鏈下檢查）
    ///   同一個部位穿上新的，原本那件就消失。部位、選項是否存在由鏈下 traits.json 決定，配件不存在時背包本來就扣不到
    function equip(uint256 id, uint256[] calldata partIds, uint256[] calldata clearSlots) external whenNotPaused nonReentrant {
        if (ownerOf(id) != msg.sender) revert NotTokenOwner(id);
        if (frozen[msg.sender]) revert WalletFrozen(msg.sender);
        if (_hidden[id]) revert NotRevealed(id);
        if (!isVip(msg.sender)) revert NotVip();
        uint256 n = partIds.length + clearSlots.length;
        if (n == 0) revert NoChange();
        if (n > MAX_EQUIP) revert BadAmount();
        _pay(changeFee, "equip");
        for (uint256 i; i < partIds.length; ++i) parts.burn(msg.sender, partIds[i], 1); // 背包沒有會 revert
        emit Equipped(id, msg.sender, partIds, clearSlots);
        emit MetadataUpdate(id);
    }

    /// @notice 用 ASC 買 VIP：periods 期（每期 vipDays 天），從現在或目前到期日起算（取較晚的）；費用直接銷毀
    function buyVip(uint256 periods) external whenNotPaused nonReentrant {
        if (vipPrice == 0) revert VipNotForSale();
        if (periods == 0 || periods > MAX_VIP_PERIODS) revert BadAmount();
        _pay(vipPrice * periods, "vip");
        uint256 base = vipUntil[msg.sender] > block.timestamp ? vipUntil[msg.sender] : block.timestamp;
        vipUntil[msg.sender] = base + periods * vipDays * 1 days;
        emit VipGranted(msg.sender, vipUntil[msg.sender]);
    }

    /// @notice 先用 ASC 買轉蛋次數
    function buyPulls(uint256 n) external whenNotPaused nonReentrant {
        if (n == 0 || n > 1000) revert BadAmount();
        if (gachaVipOnly && !isVip(msg.sender)) revert NotVip();
        _pay(gachaFee * n, "pulls");
        pulls[msg.sender] += n;
        emit PullsChanged(msg.sender, pulls[msg.sender]);
    }

    /// @notice 轉蛋 1~10 次：先用存好的次數，不夠的當場付款；抽中的配件道具直接進背包
    function gacha(uint256 times) external whenNotPaused nonReentrant onlyWallet {
        if (gachaVipOnly && !isVip(msg.sender)) revert NotVip();
        if (times == 0 || times > MAX_GACHA_PER_TX) revert BadAmount();
        if (_pool.length == 0) revert EmptyPool();
        uint256 have = pulls[msg.sender];
        uint256 use = have < times ? have : times;
        if (use > 0) {
            pulls[msg.sender] = have - use;
            emit PullsChanged(msg.sender, have - use);
        }
        _pay(gachaFee * (times - use), "gacha");
        uint256 total = missWeight;
        for (uint256 i; i < _pool.length; ++i) total += _pool[i].weight;
        for (uint256 k; k < times; ++k) {
            bytes32 seed = _seed(PURPOSE_GACHA, k);
            uint256 roll = uint256(seed) % total;
            uint256 acc;
            bool hit;
            uint256 pid;
            for (uint256 i; i < _pool.length; ++i) {
                acc += _pool[i].weight;
                if (roll < acc) {
                    (hit, pid) = (true, _pool[i].partId);
                    break;
                }
            }
            if (hit) parts.mint(msg.sender, pid, 1);
            emit GachaPull(msg.sender, seed, roll, total, hit, pid);
        }
    }

    /* ═════════════ 查詢 ═════════════ */

    function isVip(address user) public view returns (bool) {
        return vipUntil[user] > block.timestamp;
    }

    function isRevealed(uint256 id) external view returns (bool) {
        _requireOwned(id);
        return !_hidden[id];
    }

    function gachaPool() external view returns (Prize[] memory prizes, uint32 miss) {
        return (_pool, missWeight);
    }

    /// @notice 網站一次讀完：[已鑄造, 上限, 下一個編號, 販售(1/0), 隨機費, 換裝費, 轉蛋費, 轉蛋限VIP(1/0)] 與某人 [鑄造額度, VIP 到期, 轉蛋次數, 持有數]
    function info(address user) external view returns (uint256[8] memory s, uint256[4] memory me) {
        s = [totalSupply(), maxSupply, nextId, saleOpen ? 1 : 0, randomFee, changeFee, gachaFee, gachaVipOnly ? 1 : 0];
        me = [mintAllowance[user], vipUntil[user], pulls[user], balanceOf(user)];
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return bytes(_base).length > 0 ? string.concat(_base, id.toString(), ".json") : "";
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    /* ═════════════ 作業員（或 owner／admin） ═════════════ */

    /// @notice 白名單：設定每個人還能鑄造幾顆（設成 0 = 移除）
    function setMintAllowance(address[] calldata users, uint256[] calldata amounts) external onlyOperator {
        if (users.length != amounts.length) revert LengthMismatch();
        if (users.length > 300) revert BadAmount();
        for (uint256 i; i < users.length; ++i) {
            mintAllowance[users[i]] = amounts[i];
            emit MintAllowanceSet(users[i], amounts[i]);
        }
    }

    /// @notice 凍結被盜錢包（NFT 不能轉出、不能在 OpenSea 賣、不能換裝），玩家回報後馬上按
    function setFrozen(address[] calldata users, bool v) external onlyOperator {
        if (users.length > 300) revert BadAmount();
        for (uint256 i; i < users.length; ++i) {
            frozen[users[i]] = v;
            emit FrozenChanged(users[i], v);
        }
    }

    /* ═════════════ admin（owner 或助手） ═════════════ */

    /// @notice VIP 訂閱：延長 days_ 天（從現在或目前到期日起算，取較晚的）；days_ = 0 代表取消
    function grantVip(address[] calldata users, uint256 days_) external onlyAdmin {
        if (users.length > 300) revert BadAmount();
        for (uint256 i; i < users.length; ++i) {
            address u = users[i];
            uint256 base = vipUntil[u] > block.timestamp ? vipUntil[u] : block.timestamp;
            vipUntil[u] = days_ == 0 ? 0 : base + days_ * 1 days;
            emit VipGranted(u, vipUntil[u]);
        }
    }

    /// @notice 總量上限（不能低於已經用掉的編號數）
    function setMaxSupply(uint256 m) external onlyAdmin {
        if (m < nextId) revert BelowMinted(nextId);
        maxSupply = m;
        emit SettingsChanged();
    }

    /// @notice 免費發隨機盲盒
    function airdrop(address[] calldata to) external onlyAdmin nonReentrant {
        if (to.length == 0 || to.length > MAX_BATCH) revert BadAmount();
        for (uint256 i; i < to.length; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            _mintBox(to[i], KIND_AIRDROP, false);
        }
    }

    /// @notice 免費發盲盒，解盲後是指定外觀：refs[i]＝要複製外觀的 V1 編號（例如舊系列持有者拿回原本的樣子）
    function airdropPreset(address[] calldata to, uint256[] calldata refs) external onlyAdmin nonReentrant {
        if (to.length != refs.length) revert LengthMismatch();
        if (to.length == 0 || to.length > MAX_BATCH) revert BadAmount();
        for (uint256 i; i < to.length; ++i) {
            if (to[i] == address(0)) revert ZeroAddress();
            uint256 id = _takeId();
            _hidden[id] = true;
            _mint(to[i], id);
            emit Minted(id, to[i], KIND_PRESET);
            emit PresetMinted(id, refs[i]);
        }
    }

    /// @notice 轉蛋獎池：每個獎項是一個配件編號（部位 × 256 + 選項）與權重；miss＝沒抽中的權重
    function setGachaPool(uint32[] calldata partIds, uint16[] calldata weights, uint32 miss) external onlyAdmin {
        if (partIds.length != weights.length) revert LengthMismatch();
        if (partIds.length > 512) revert BadAmount();
        delete _pool;
        for (uint256 i; i < partIds.length; ++i) _pool.push(Prize(partIds[i], weights[i]));
        missWeight = miss;
        emit SettingsChanged();
    }

    function setPrices(uint256 random_, uint256 change_, uint256 gacha_) external onlyAdmin {
        (randomFee, changeFee, gachaFee) = (random_, change_, gacha_);
        emit SettingsChanged();
    }

    /// @notice VIP 價格：每期 price ASC、每期 days_ 天（1~365）；price＝0 停止販售（已買的 VIP 不受影響）
    function setVipPrice(uint256 price, uint256 days_) external onlyAdmin {
        if (days_ == 0 || days_ > 365) revert BadAmount();
        (vipPrice, vipDays) = (price, days_);
        emit VipPriceChanged(price, days_);
    }

    function setSale(bool open_) external onlyAdmin {
        saleOpen = open_;
        emit SettingsChanged();
    }

    /// @notice 作業員（只能發白名單、凍結被盜錢包）；設成 0 地址＝取消
    function setOperator(address op) external onlyAdmin {
        operator = op;
        emit SettingsChanged();
    }

    function setGachaVipOnly(bool v) external onlyAdmin {
        gachaVipOnly = v;
        emit SettingsChanged();
    }

    /// @notice 救援：幫玩家解盲（網站掛掉、玩家不會操作時）
    function adminReveal(uint256[] calldata ids) external onlyAdmin {
        for (uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            address o = _requireOwned(id);
            if (!_hidden[id]) continue;
            _hidden[id] = false;
            emit Revealed(id, o);
            emit MetadataUpdate(id);
        }
    }

    /// @notice 鏈下 JSON 改過（例如幫某幾顆加寵物、背景）後，通知 OpenSea 等平台重新讀取
    function refreshMetadata(uint256 from, uint256 to) external onlyAdmin {
        emit BatchMetadataUpdate(from, to);
    }

    /// @notice 救援：圖片／metadata 主機失效（例如 IPFS、GitHub Pages）時，改成新的網址，例如 https://新網域/nft/v2/metadata/
    function setBaseURI(string calldata b) external onlyAdmin {
        _base = b;
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /// @notice 活動用：送轉蛋次數、送配件道具（partId＝部位 × 256 + 選項）
    function givePulls(address user, uint256 n) external onlyAdmin {
        pulls[user] += n;
        emit PullsChanged(user, pulls[user]);
    }

    function giveParts(address user, uint256 partId, uint256 amount) external onlyAdmin {
        parts.mint(user, partId, amount);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    /* ═════════════ owner（動到別人的資產） ═════════════ */

    /// @notice 把「已凍結」錢包的 NFT 搬到玩家的新錢包（只能從凍結的錢包搬）
    function recoverNfts(address from, address to, uint256[] calldata ids) external onlyOwner nonReentrant {
        if (!frozen[from]) revert NotFrozen(from);
        if (to == address(0) || frozen[to]) revert ZeroAddress();
        _recovering = true;
        for (uint256 i; i < ids.length; ++i) _transfer(from, to, ids[i]); // 不經過 approve；ownerOf 不是 from 會 revert
        _recovering = false;
        emit NftsRecovered(from, to, ids);
    }

    /// @notice 連同鑄造額度、VIP、轉蛋次數一起搬到新錢包
    function moveAccountPerks(address from, address to) external onlyOwner {
        if (!frozen[from]) revert NotFrozen(from);
        if (to == address(0) || frozen[to]) revert ZeroAddress();
        uint256 a = mintAllowance[from];
        uint256 v = vipUntil[from];
        uint256 p = pulls[from];
        (mintAllowance[from], vipUntil[from], pulls[from]) = (0, 0, 0);
        mintAllowance[to] += a;
        if (v > vipUntil[to]) vipUntil[to] = v;
        pulls[to] += p;
        emit PerksMoved(from, to, a, v, p);
    }

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    /* ═════════════ 內部 ═════════════ */

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && frozen[from] && !_recovering) revert WalletFrozen(from);
        return super._update(to, tokenId, auth);
    }

    /// 鑄造盲盒：外觀由 RandomSeed（purpose＝1、ref＝編號）的 seed 決定，鏈下依 traits.json 計算
    function _mintBox(address to, uint8 kind, bool safe) private returns (uint256 id) {
        id = _takeId();
        _seed(PURPOSE_MINT, id);
        _hidden[id] = true;
        if (safe) _safeMint(to, id);
        else _mint(to, id);
        emit Minted(id, to, kind);
    }

    function _takeId() private returns (uint256 id) {
        id = nextId;
        if (id >= maxSupply) revert SoldOut();
        nextId = id + 1;
    }

    /// 費用用 ASC 支付並直接銷毀（池子不變、點數變少＝每點價值提高）
    function _pay(uint256 amount, string memory what) private {
        if (amount == 0) return;
        asc.burnFrom(msg.sender, amount);
        emit Paid(msg.sender, what, amount);
    }

    function _seed(uint8 purpose, uint256 ref) private returns (bytes32 seed) {
        uint256 n = nonce++;
        bytes32 prev = blockhash(block.number - 1);
        seed = keccak256(abi.encode(prev, block.prevrandao, msg.sender, n));
        emit RandomSeed(msg.sender, purpose, ref, prev, block.prevrandao, n, seed);
    }
}
