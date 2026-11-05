// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// 只讀喵武士 NFT（AscCatSamuraiV2）
interface ICatNFT {
    function ownerOf(uint256 id) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function frozen(address user) external view returns (bool);
    function isRevealed(uint256 id) external view returns (bool);
}

/// 只讀 ASC 金庫（AscPointV2）：isVerified＝錢包已在 Discord 綁定
interface IVault {
    function isVerified(address account) external view returns (bool);
}

/// @title EventBadges - 活動徽章（活動背景，不能轉移，UUPS 可升級）
/// @notice 每場活動一個徽章編號（id）：
///   · 領取：活動期間在網站輸入公告的代碼（claim），每個錢包每場一次；可限定「Discord 已綁定的錢包」與「持有喵武士」。
///   · 不能轉移、不能上架：徽章永遠在領取的錢包裡，是「我參加過」的證明（管理員可以補發、收回）。
///   · 當背景穿：持有者把徽章當背景穿在自己的喵武士上（wear，免費）。背景只在「領取者本人還持有那隻喵武士」時有效：
///     喵武士轉手後 backgroundOf 自動回到 0（沒有背景），徽章仍在原錢包，可以再穿到他別隻身上。
///   · 外觀在鏈下：出圖同步讀 backgroundOf（或 BackgroundSet 事件）把背景畫在最底層。VIP 不能借穿（沒有公庫存）。
/// @dev 代碼存的是 keccak256(abi.encodePacked(id, code))：建立活動時代碼不上鏈；第一個人領取後代碼會出現在交易資料裡，
///      所以建議開啟 verifiedOnly（只有 Discord 綁定過的錢包能領）。升級時只能在最後面加變數（用掉 __gap）。
contract EventBadges is Initializable, UUPSUpgradeable, ERC1155 {
    using Strings for uint256;

    struct EventInfo {
        bytes32 codeHash; // keccak256(abi.encodePacked(id, code))
        uint64 start; // 開始領取（unix 秒）
        uint64 end; // 截止（unix 秒，含）
        uint32 cap; // 最多幾人（0＝不限）
        uint32 claimed; // 已領人數（含補發）
        bool verifiedOnly; // 只限 Discord 綁定的錢包
        bool holdersOnly; // 只限持有喵武士的錢包
        bool exists;
    }

    struct Wear {
        uint32 badge; // 穿著的徽章 id（0＝沒有）
        address by; // 誰穿上的（背景只在他還持有這隻時有效）
    }

    string public constant name = "ASC Cat Samurai Event Badges";
    string public constant symbol = "ASCEVT";

    ICatNFT public nft;
    IVault public vault;
    address public owner;
    address public pendingOwner;
    address public admin;
    address public operator; // 只能緊急暫停
    address public guardian; // 救援錢包：owner 被盜時強制換主人（0＝不使用）
    bool public paused;
    string public baseURI; // 徽章 metadata：baseURI + id + ".json"
    uint256[] private _eventIds;
    mapping(uint256 => EventInfo) private _events;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => Wear) private _wear;
    uint256[40] private __gap;

    event EventSet(uint256 indexed id, uint64 start, uint64 end, uint32 cap, bool verifiedOnly, bool holdersOnly, bool newCode);
    event Claimed(uint256 indexed id, address indexed user, bool byAdmin);
    event Revoked(uint256 indexed id, address indexed user);
    event BackgroundSet(uint256 indexed tokenId, address indexed owner, uint256 badge);
    event BaseURIChanged(string uri);
    event PausedChanged(bool paused);
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
    error Soulbound();
    error BadEvent(uint256 id);
    error EventExists(uint256 id);
    error BadTime();
    error NotOpen(uint256 id);
    error WrongCode();
    error AlreadyClaimed(uint256 id, address user);
    error EventFull(uint256 id);
    error NotVerified(address user);
    error NotHolder(address user);
    error NotTokenOwner(uint256 tokenId);
    error WalletFrozen(address user);
    error NotRevealed(uint256 tokenId);
    error NoBadge(uint256 badge);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != owner && (msg.sender != admin || admin == address(0))) revert NotAdmin();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() ERC1155("") {
        _disableInitializers();
    }

    function initialize(address owner_, address guardian_, address nft_, address vault_, string calldata baseURI_) external initializer {
        if (owner_ == address(0) || nft_ == address(0) || vault_ == address(0)) revert ZeroAddress();
        owner = owner_;
        guardian = guardian_;
        nft = ICatNFT(nft_);
        vault = IVault(vault_);
        baseURI = baseURI_;
        emit OwnershipTransferred(address(0), owner_);
    }

    /* ═════════════ 玩家 ═════════════ */

    /// @notice 活動期間輸入代碼領取徽章（每個錢包每場一次）
    function claim(uint256 id, string calldata code) external {
        if (paused) revert IsPaused();
        EventInfo storage e = _events[id];
        if (!e.exists) revert BadEvent(id);
        if (block.timestamp < e.start || block.timestamp > e.end) revert NotOpen(id);
        if (keccak256(abi.encodePacked(id, code)) != e.codeHash) revert WrongCode();
        if (e.verifiedOnly && !vault.isVerified(msg.sender)) revert NotVerified(msg.sender);
        if (e.holdersOnly && nft.balanceOf(msg.sender) == 0) revert NotHolder(msg.sender);
        _give(id, msg.sender, false);
    }

    /// @notice 把徽章當背景穿到自己的喵武士上（badge＝0 是拿掉背景）。免費。
    function wear(uint256 tokenId, uint256 badge) external {
        if (paused) revert IsPaused();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner(tokenId);
        if (nft.frozen(msg.sender)) revert WalletFrozen(msg.sender);
        if (!nft.isRevealed(tokenId)) revert NotRevealed(tokenId);
        if (badge != 0 && balanceOf(msg.sender, badge) == 0) revert NoBadge(badge);
        _wear[tokenId] = Wear(uint32(badge), badge == 0 ? address(0) : msg.sender);
        emit BackgroundSet(tokenId, msg.sender, badge);
    }

    /* ═════════════ 查詢 ═════════════ */

    /// @notice 這隻喵武士現在有效的背景（0＝沒有）：穿上的人已經不是持有者、或徽章被收回，就是 0
    function backgroundOf(uint256 tokenId) public view returns (uint256) {
        Wear memory w = _wear[tokenId];
        if (w.badge == 0) return 0;
        try nft.ownerOf(tokenId) returns (address o) {
            if (o != w.by) return 0;
        } catch {
            return 0;
        }
        return balanceOf(w.by, w.badge) > 0 ? w.badge : 0;
    }

    function backgroundsOf(uint256[] calldata tokenIds) external view returns (uint256[] memory out) {
        out = new uint256[](tokenIds.length);
        for (uint256 i; i < tokenIds.length; ++i) out[i] = backgroundOf(tokenIds[i]);
    }

    /// @notice 穿上時記下的原始資料（不管有沒有轉手）
    function wearOf(uint256 tokenId) external view returns (uint256 badge, address by) {
        Wear memory w = _wear[tokenId];
        return (w.badge, w.by);
    }

    function eventOf(uint256 id) external view returns (EventInfo memory) {
        return _events[id];
    }

    function eventIds() external view returns (uint256[] memory) {
        return _eventIds;
    }

    function eventCount() external view returns (uint256) {
        return _eventIds.length;
    }

    /// @notice 某個錢包擁有哪些徽章（依 eventIds 順序）
    function badgesOf(address user) external view returns (uint256[] memory ids) {
        uint256 n;
        for (uint256 i; i < _eventIds.length; ++i) if (balanceOf(user, _eventIds[i]) > 0) ++n;
        ids = new uint256[](n);
        n = 0;
        for (uint256 i; i < _eventIds.length; ++i) if (balanceOf(user, _eventIds[i]) > 0) ids[n++] = _eventIds[i];
    }

    /// @notice 管理頁算代碼雜湊用（也可以在網頁上自己算）
    function hashCode(uint256 id, string calldata code) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(id, code));
    }

    function uri(uint256 id) public view override returns (string memory) {
        return bytes(baseURI).length > 0 ? string.concat(baseURI, id.toString(), ".json") : "";
    }

    /* ═════════════ 不能轉移 ═════════════ */

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert Soulbound();
        super._update(from, to, ids, values);
    }

    /* ═════════════ admin ═════════════ */

    /// @notice 建立活動（id 自訂、不能重複、不能是 0）。codeHash＝keccak256(abi.encodePacked(id, 代碼))
    function createEvent(uint256 id, bytes32 codeHash, uint64 start, uint64 end, uint32 cap, bool verifiedOnly, bool holdersOnly) external onlyAdmin {
        if (id == 0 || id > type(uint32).max) revert BadEvent(id);
        if (_events[id].exists) revert EventExists(id);
        if (end < start || codeHash == bytes32(0)) revert BadTime();
        _events[id] = EventInfo(codeHash, start, end, cap, 0, verifiedOnly, holdersOnly, true);
        _eventIds.push(id);
        emit EventSet(id, start, end, cap, verifiedOnly, holdersOnly, true);
    }

    /// @notice 修改活動（codeHash 填 0 表示不換代碼）。提早結束：把 end 改成現在。
    function updateEvent(uint256 id, bytes32 codeHash, uint64 start, uint64 end, uint32 cap, bool verifiedOnly, bool holdersOnly) external onlyAdmin {
        EventInfo storage e = _events[id];
        if (!e.exists) revert BadEvent(id);
        if (end < start) revert BadTime();
        if (codeHash != bytes32(0)) e.codeHash = codeHash;
        (e.start, e.end, e.cap, e.verifiedOnly, e.holdersOnly) = (start, end, cap, verifiedOnly, holdersOnly);
        emit EventSet(id, start, end, cap, verifiedOnly, holdersOnly, codeHash != bytes32(0));
    }

    /// @notice 補發（例如活動當下沒連上錢包的人）：不看期限與代碼，但每個錢包每場一次、受人數上限限制
    function grant(uint256 id, address[] calldata users) external onlyAdmin {
        if (!_events[id].exists) revert BadEvent(id);
        for (uint256 i; i < users.length; ++i) {
            if (users[i] == address(0)) revert ZeroAddress();
            _give(id, users[i], true);
        }
    }

    /// @notice 收回（例如被盜的錢包，之後可以 grant 給他的新錢包）：銷毀徽章，穿著中的背景自動失效
    function revoke(uint256 id, address user) external onlyAdmin {
        if (balanceOf(user, id) == 0) revert NoBadge(id);
        _burn(user, id, 1); // hasClaimed 保持 true：被收回的錢包不能再領同一場
        _events[id].claimed -= 1;
        emit Revoked(id, user);
    }

    function setBaseURI(string calldata b) external onlyAdmin {
        baseURI = b;
        emit BaseURIChanged(b);
    }

    function setPaused(bool v) external onlyAdmin {
        paused = v;
        emit PausedChanged(v);
    }

    /// @notice operator（或 admin）：緊急暫停領取與穿戴；恢復要 admin 用 setPaused(false)
    function emergencyPause() external {
        if (msg.sender != operator && msg.sender != owner && (msg.sender != admin || admin == address(0))) revert NotOperator();
        paused = true;
        emit PausedChanged(true);
    }

    function setOperator(address op) external onlyAdmin {
        operator = op;
        emit OperatorChanged(op);
    }

    /* ═════════════ owner ═════════════ */

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

    function _give(uint256 id, address user, bool byAdmin) private {
        EventInfo storage e = _events[id];
        if (hasClaimed[id][user]) revert AlreadyClaimed(id, user);
        if (e.cap != 0 && e.claimed >= e.cap) revert EventFull(id);
        hasClaimed[id][user] = true;
        e.claimed += 1;
        _mint(user, id, 1, "");
        emit Claimed(id, user, byAdmin);
    }

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
}
