// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// 只讀 NFT 合約（本 repo 的 NFT.sol 都有這些函式）
interface INFTView {
    function ownerOf(uint256 id) external view returns (address);
    function isVip(address user) external view returns (bool);
    function frozen(address user) external view returns (bool);
    function isRevealed(uint256 id) external view returns (bool);
}

interface IBurnable {
    function burnFrom(address account, uint256 value) external;
}

/// @title Wardrobe - 衣櫃（換裝模組，UUPS 可升級）
/// @notice 換裝不再銷毀配件，改成「代管」：
///   · 穿上自己的配件：配件從背包轉進衣櫃保管（kind＝OWN），屬於這隻 NFT；換下來就轉回「當時的持有者」背包
///   · VIP 借穿公庫存：只有 VIP 能借（admin 放進公庫存的普通配件），不用擁有；換下來回到公庫存（對玩家來說就是消失）。VIP 到期後照樣穿著
///   · 原始外觀（kind＝ORIGINAL）：鑄造時就有的外觀，衣櫃沒有保管，換掉就消失（超稀有由管理面板用 NFT 的 giveParts 退回）
///   · 費用：VIP 免換裝費；一般人每筆付 changeFee（點數，直接銷毀，要先 approve 衣櫃）
///   外觀仍在鏈下：每筆換裝發跟 NFT 合約一模一樣的 Equipped 事件，出圖同步程式多讀這個地址即可；SlotChanged 給管理面板與網站看細節。
///   不能新發或銷毀配件（Part 的 minter 仍是 NFT），所以不影響轉蛋。
/// @dev 升級：只有 owner（建議 Safe 多簽）能 upgradeToAndCall。新版只能在最後面加變數（用掉 __gap），不能調換或刪除既有變數。
contract Wardrobe is Initializable, UUPSUpgradeable, ReentrancyGuard, ERC1155Holder {
    uint32 public constant NONE = type(uint32).max; // 「脫掉／沒有」
    uint8 public constant KIND_ORIGINAL = 0; // 衣櫃沒經手（鑄造時的原始外觀，或衣櫃上線前 V2 換裝且沒有補登記）
    uint8 public constant KIND_OWN = 1; // 衣櫃保管中、屬於這隻 NFT 的配件
    uint8 public constant KIND_STOCK = 2; // 向公庫存借的
    uint8 public constant KIND_EMPTY = 3; // 用衣櫃脫掉了
    uint256 public constant MAX_CHANGES = 16;

    struct Worn {
        uint32 partId;
        uint8 kind;
    }

    /// slot＝部位（partId / 256）；partId＝NONE 表示脫掉；borrow＝向公庫存借（只限 VIP）
    struct Change {
        uint32 slot;
        uint32 partId;
        bool borrow;
    }

    INFTView public nft;
    IERC1155 public parts;
    IBurnable public token;
    address public owner;
    address public pendingOwner;
    address public admin;
    address public operator; // 例如 Discord 機器人的熱錢包：只能緊急暫停換裝（不能恢復、不能改設定、碰不到配件）
    address public guardian; // 救援錢包：owner 被盜時強制換主人（0＝不使用）
    bool public paused;
    bool public seedClosed; // 補登記（seedWorn）關閉後不能再開
    uint256 public changeFee;
    mapping(uint256 => mapping(uint256 => Worn)) private _worn;
    mapping(uint256 => uint256) public stock; // 公庫存數量
    mapping(uint256 => uint256) public held; // 穿在 NFT 身上、由衣櫃保管的數量
    mapping(uint256 => bool) public fixedSlot; // 不能空著的部位（例如身體）
    uint256[39] private __gap;

    event Equipped(uint256 indexed tokenId, address indexed owner, uint256[] partIds, uint256[] clearSlots);
    event SlotChanged(uint256 indexed tokenId, address indexed owner, uint256 slot, uint256 oldPart, uint8 oldKind, uint256 newPart, uint8 newKind);
    event SlotSeeded(uint256 indexed tokenId, uint256 slot, uint256 partId);
    event Paid(address indexed user, uint256 amount);
    event StockChanged(uint256 indexed partId, uint256 stock);
    event FeeChanged(uint256 fee);
    event PausedChanged(bool paused);
    event FixedSlotChanged(uint256 slot, bool fixed_);
    event SeedClosed();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event OperatorChanged(address indexed operator);
    event GuardianTakeover(address indexed oldOwner, address indexed newOwner);

    error NotOwner();
    error NotAdmin();
    error NotOperator();
    error NotGuardian();
    error NotPendingOwner();
    error ZeroAddress();
    error IsPaused();
    error NotTokenOwner(uint256 tokenId);
    error WalletFrozen(address account);
    error NotRevealed(uint256 tokenId);
    error NotVip();
    error BadAmount();
    error BadSlot(uint256 slot);
    error DuplicateSlot(uint256 slot);
    error WrongSlot(uint256 slot, uint256 partId);
    error SlotRequired(uint256 slot);
    error NoChange(uint256 slot);
    error NoStock(uint256 partId);
    error NotEnough(uint256 partId, uint256 available);
    error AlreadyTracked(uint256 tokenId, uint256 slot);
    error SeedIsClosed();
    error LengthMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != owner && (msg.sender != admin || admin == address(0))) revert NotAdmin();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner_, address guardian_, address nft_, address parts_, address token_, uint256 changeFee_) external initializer {
        if (owner_ == address(0) || nft_ == address(0) || parts_ == address(0) || token_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        nft = INFTView(nft_);
        parts = IERC1155(parts_);
        token = IBurnable(token_);
        changeFee = changeFee_;
        emit OwnershipTransferred(address(0), owner_);
        emit FeeChanged(changeFee_);
    }

    /* ═════════════ 玩家 ═════════════ */

    /// @notice 換裝：一次改多個部位。穿自己的配件要先 parts.setApprovalForAll(衣櫃, true)；一般人要先 approve 點數 changeFee
    function change(uint256 id, Change[] calldata cs) external nonReentrant {
        if (paused) revert IsPaused();
        if (nft.ownerOf(id) != msg.sender) revert NotTokenOwner(id);
        if (nft.frozen(msg.sender)) revert WalletFrozen(msg.sender);
        if (!nft.isRevealed(id)) revert NotRevealed(id);
        uint256 n = cs.length;
        if (n == 0 || n > MAX_CHANGES) revert BadAmount();
        bool vip = nft.isVip(msg.sender);

        Acc memory acc = Acc(new uint256[](n), new uint256[](n), new uint256[](n), new uint256[](n), 0, 0, 0, 0, 0);
        // 先改狀態，最後才轉配件（checks-effects-interactions）
        for (uint256 i; i < n; ++i) _apply(id, cs[i], vip, acc);

        if (!vip && changeFee > 0) {
            token.burnFrom(msg.sender, changeFee);
            emit Paid(msg.sender, changeFee);
        }
        if (acc.ni > 0) parts.safeBatchTransferFrom(msg.sender, address(this), _cut(acc.ins, acc.ni), _ones(acc.ni), "");
        if (acc.no > 0) parts.safeBatchTransferFrom(address(this), msg.sender, _cut(acc.outs, acc.no), _ones(acc.no), "");
        emit Equipped(id, msg.sender, _cut(acc.puts, acc.np), _cut(acc.clears, acc.nc));
    }

    /// 一筆換裝裡收集的結果（獨立成 struct，避免 stack too deep）
    struct Acc {
        uint256[] puts; // 穿上的配件
        uint256[] clears; // 脫掉的部位
        uint256[] ins; // 要從背包收進來的
        uint256[] outs; // 要退回背包的
        uint256 np;
        uint256 nc;
        uint256 ni;
        uint256 no;
        uint256 mask; // 這筆已經改過的部位
    }

    function _apply(uint256 id, Change calldata c, bool vip, Acc memory acc) private {
        uint256 slot = c.slot;
        if (slot >= 256) revert BadSlot(slot);
        if (((acc.mask >> slot) & 1) == 1) revert DuplicateSlot(slot);
        acc.mask |= uint256(1) << slot;
        Worn memory old = _worn[id][slot];
        uint256 pid = c.partId;
        uint8 kind;
        if (pid == NONE) {
            if (fixedSlot[slot]) revert SlotRequired(slot);
            if (old.kind == KIND_EMPTY) revert NoChange(slot);
            kind = KIND_EMPTY;
        } else {
            if (pid / 256 != slot) revert WrongSlot(slot, pid);
            kind = c.borrow ? KIND_STOCK : KIND_OWN;
            if (old.kind == kind && old.partId == pid) revert NoChange(slot);
        }
        // 換下舊的
        if (old.kind == KIND_OWN) {
            held[old.partId] -= 1;
            acc.outs[acc.no++] = old.partId;
        } else if (old.kind == KIND_STOCK) {
            stock[old.partId] += 1;
            emit StockChanged(old.partId, stock[old.partId]);
        }
        // 穿上新的
        if (kind == KIND_EMPTY) {
            acc.clears[acc.nc++] = slot;
        } else {
            if (kind == KIND_STOCK) {
                if (!vip) revert NotVip();
                if (stock[pid] == 0) revert NoStock(pid);
                stock[pid] -= 1;
                emit StockChanged(pid, stock[pid]);
            } else {
                held[pid] += 1;
                acc.ins[acc.ni++] = pid;
            }
            acc.puts[acc.np++] = pid;
        }
        _worn[id][slot] = Worn(kind == KIND_EMPTY ? NONE : uint32(pid), kind);
        emit SlotChanged(id, msg.sender, slot, old.kind == KIND_OWN || old.kind == KIND_STOCK ? old.partId : NONE, old.kind, kind == KIND_EMPTY ? NONE : pid, kind);
    }

    /* ═════════════ 查詢 ═════════════ */

    /// @notice 某隻 NFT 某個部位：partId（ORIGINAL／EMPTY 時是 NONE）與 kind
    function worn(uint256 id, uint256 slot) external view returns (uint256 partId, uint8 kind) {
        Worn memory w = _worn[id][slot];
        return (w.kind == KIND_OWN || w.kind == KIND_STOCK ? w.partId : NONE, w.kind);
    }

    /// @notice 一次讀很多部位
    function wornMany(uint256 id, uint256[] calldata slots) external view returns (uint256[] memory partIds, uint8[] memory kinds) {
        partIds = new uint256[](slots.length);
        kinds = new uint8[](slots.length);
        for (uint256 i; i < slots.length; ++i) {
            Worn memory w = _worn[id][slots[i]];
            (partIds[i], kinds[i]) = (w.kind == KIND_OWN || w.kind == KIND_STOCK ? w.partId : NONE, w.kind);
        }
    }

    /// @notice 衣櫃收到、還沒分配（不是公庫存也不是穿著中）的數量
    function unassigned(uint256 partId) public view returns (uint256) {
        uint256 bal = parts.balanceOf(address(this), partId);
        uint256 used = stock[partId] + held[partId];
        return bal > used ? bal - used : 0;
    }

    function stocks(uint256[] calldata ids) external view returns (uint256[] memory out) {
        out = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = stock[ids[i]];
    }

    /* ═════════════ admin ═════════════ */

    function setChangeFee(uint256 fee) external onlyAdmin {
        changeFee = fee;
        emit FeeChanged(fee);
    }

    function setPaused(bool v) external onlyAdmin {
        paused = v;
        emit PausedChanged(v);
    }

    /// @notice operator（或 admin）：緊急暫停換裝；恢復要 admin 用 setPaused(false)
    function emergencyPause() external {
        if (msg.sender != operator && (msg.sender != owner && (msg.sender != admin || admin == address(0)))) revert NotOperator();
        paused = true;
        emit PausedChanged(true);
    }

    function setOperator(address op) external onlyAdmin {
        operator = op;
        emit OperatorChanged(op);
    }

    function setFixedSlots(uint256[] calldata slots, bool v) external onlyAdmin {
        for (uint256 i; i < slots.length; ++i) {
            fixedSlot[slots[i]] = v;
            emit FixedSlotChanged(slots[i], v);
        }
    }

    /// @notice 把衣櫃收到、還沒分配的配件放進公庫存（先用 NFT 的 giveParts 發給衣櫃地址）
    function addStock(uint256[] calldata ids, uint256[] calldata amounts) external onlyAdmin {
        if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            uint256 free = unassigned(ids[i]);
            if (amounts[i] > free) revert NotEnough(ids[i], free);
            stock[ids[i]] += amounts[i];
            emit StockChanged(ids[i], stock[ids[i]]);
        }
    }

    /// @notice 搬遷用：登記「衣櫃上線前用 V2 換裝穿上的配件」為 OWN（先把同款配件發給衣櫃），以後換下來就退回。closeSeed 後永久關閉
    function seedWorn(uint256[] calldata ids, uint256[] calldata slots, uint256[] calldata partIds) external onlyAdmin {
        if (seedClosed) revert SeedIsClosed();
        if (ids.length != slots.length || ids.length != partIds.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) {
            (uint256 id, uint256 slot, uint256 pid) = (ids[i], slots[i], partIds[i]);
            if (pid / 256 != slot) revert WrongSlot(slot, pid);
            if (_worn[id][slot].kind != KIND_ORIGINAL) revert AlreadyTracked(id, slot);
            uint256 free = unassigned(pid);
            if (free == 0) revert NotEnough(pid, 0);
            held[pid] += 1;
            _worn[id][slot] = Worn(uint32(pid), KIND_OWN);
            emit SlotSeeded(id, slot, pid);
        }
    }

    /* ═════════════ owner ═════════════ */

    function closeSeed() external onlyOwner {
        seedClosed = true;
        emit SeedClosed();
    }

    /// @notice 從公庫存拿出配件（例如改放別的普通配件）
    function removeStock(uint256 partId, uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount > stock[partId]) revert NotEnough(partId, stock[partId]);
        stock[partId] -= amount;
        emit StockChanged(partId, stock[partId]);
        parts.safeTransferFrom(address(this), to, partId, amount, "");
    }

    /// @notice 誤轉進來、還沒分配的配件退出去（穿在 NFT 身上的動不了）
    function withdrawUnassigned(uint256 partId, uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 free = unassigned(partId);
        if (amount > free) revert NotEnough(partId, free);
        parts.safeTransferFrom(address(this), to, partId, amount, "");
    }

    function setAdmin(address a) external onlyOwner {
        emit AdminChanged(admin, a);
        admin = a;
    }

    /// @notice 轉移主人要兩步：owner 先 transferOwnership，新地址自己 acceptOwnership
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        _setOwner(msg.sender);
    }

    function guardianTakeover(address newOwner) external {
        if (msg.sender != guardian || guardian == address(0)) revert NotGuardian();
        if (newOwner == address(0)) revert ZeroAddress();
        emit GuardianTakeover(owner, newOwner);
        _setOwner(newOwner);
    }

    /* ═════════════ 內部 ═════════════ */

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _setOwner(address o) private {
        if (admin != address(0)) {
            emit AdminChanged(admin, address(0));
            admin = address(0);
        }
        pendingOwner = address(0);
        emit OwnershipTransferred(owner, o);
        owner = o;
    }

    function _cut(uint256[] memory a, uint256 n) private pure returns (uint256[] memory) {
        assembly {
            mstore(a, n)
        }
        return a;
    }

    function _ones(uint256 n) private pure returns (uint256[] memory a) {
        a = new uint256[](n);
        for (uint256 i; i < n; ++i) a[i] = 1;
    }
}
