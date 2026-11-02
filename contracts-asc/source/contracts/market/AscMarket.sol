// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AscRoles} from "../common/AscRoles.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// 上游：AscPointV2（ASC 點數、已驗證／被標記錢包）
interface IAscVault is IERC20 {
    function verifiedOnly() external view returns (bool);
    function isVerified(address) external view returns (bool);
    function isFlagged(address) external view returns (bool);
    function burnToReserve(uint256 points) external returns (uint256 value);
}

/// @title AscMarket - 配件道具交易市場（用 ASC 點數計價）
/// @notice 賣家掛單時道具先放進市場保管，買家付 ASC 後直接拿到；可以只買一部分。
///   listPart(id, amount, unitPrice)   掛賣配件道具，單價是 ASC 點數（先在 AscCatParts 按 setApprovalForAll(市場, true)）
///   buy(listingId, amount, maxUnitPrice)  買：付 amount × unitPrice ASC（先在 AscPoint 按 approve(市場, 數量)）
///                                     手續費 feeBps（預設 20%）給 owner：ASC 銷毀、等值 USDT 從金庫池子移到保底（owner 用 Safe 提領），其餘給賣家
///   cancel(listingId)                 賣家下架，剩下的退回
/// 需要：金庫兌換開啟（ASC 只有開啟時能轉手）；市場合約要在金庫設成豁免（setExempt）。
/// 防洗錢：金庫 verifiedOnly 開啟時只有已驗證錢包能掛單和購買；不能買自己的單；單筆上限 maxTradeValue；
///   被標記的錢包不能買（金庫擋轉出）；賣家被標記時手續費改成 flagFeeBps（預設 95%，一樣進保底）。
contract AscMarket is ERC1155Holder, AscRoles, Pausable, ReentrancyGuard {
    using SafeERC20 for IAscVault;
    using SafeERC20 for IERC20;

    uint256 public constant MAX_TOTAL_FEE_BPS = 9900;

    IAscVault public immutable asc;
    IERC1155 public immutable parts;
    uint256 public feeBps = 2000;
    uint256 public flagFeeBps = 9500; // 賣家被標記時的總手續費（取代 feeBps，不是相加）
    uint256 public maxTradeValue = 100_000; // ASC 點數；0 = 不限

    struct Listing {
        address seller;
        uint256 id;
        uint256 remaining;
        uint256 unitPrice; // 每 1 個多少 ASC
        bool active;
    }
    Listing[] private _listings;
    mapping(uint256 => uint256) public escrowed; // 每種道具目前掛單保管中的數量（救援時只能動多出來的）

    event Listed(uint256 indexed listingId, address indexed seller, uint256 id, uint256 amount, uint256 unitPrice);
    event Bought(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 paid, uint256 fee, uint256 feeUsdt);
    event Cancelled(uint256 indexed listingId, uint256 returned);
    event PolicyChanged(uint256 feeBps, uint256 flagFeeBps, uint256 maxTradeValue);
    event Rescued(address indexed token, uint256 id, address indexed to, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error BadFee();
    error NotSeller();
    error NotActive();
    error TooMuch(uint256 remaining);
    error PriceChanged();
    error NotVerified(address account);
    error SelfTrade();
    error OverTradeCap(uint256 cap);

    constructor(address initialOwner, address asc_, address parts_) Ownable(initialOwner) {
        if (asc_ == address(0) || parts_ == address(0)) revert ZeroAddress();
        asc = IAscVault(asc_);
        parts = IERC1155(parts_);
    }

    function listPart(uint256 id, uint256 amount, uint256 unitPrice) external whenNotPaused nonReentrant returns (uint256 listingId) {
        if (amount == 0 || unitPrice == 0) revert ZeroAmount();
        _checkVerified(msg.sender);
        parts.safeTransferFrom(msg.sender, address(this), id, amount, "");
        listingId = _listings.length;
        _listings.push(Listing(msg.sender, id, amount, unitPrice, true));
        escrowed[id] += amount;
        emit Listed(listingId, msg.sender, id, amount, unitPrice);
    }

    /// @param maxUnitPrice 防止賣家改價：單價高於這個就不買（填 0 = 不檢查）
    function buy(uint256 listingId, uint256 amount, uint256 maxUnitPrice) external whenNotPaused nonReentrant {
        Listing storage l = _listings[listingId];
        if (!l.active) revert NotActive();
        if (amount == 0) revert ZeroAmount();
        if (amount > l.remaining) revert TooMuch(l.remaining);
        if (maxUnitPrice != 0 && l.unitPrice > maxUnitPrice) revert PriceChanged();
        if (msg.sender == l.seller) revert SelfTrade();
        _checkVerified(msg.sender);
        uint256 paid = amount * l.unitPrice;
        if (maxTradeValue != 0 && paid > maxTradeValue) revert OverTradeCap(maxTradeValue);
        uint256 fee = (paid * feeFor(listingId) + 9_999) / 10_000; // 無條件進位：小額交易也要收費，避免拆單免手續費
        l.remaining -= amount;
        if (l.remaining == 0) l.active = false;
        escrowed[l.id] -= amount;
        asc.safeTransferFrom(msg.sender, address(this), paid); // 市場是豁免地址：不收互轉稅
        uint256 feeUsdt = fee > 0 ? asc.burnToReserve(fee) : 0;
        asc.safeTransfer(l.seller, paid - fee);
        parts.safeTransferFrom(address(this), msg.sender, l.id, amount, "");
        emit Bought(listingId, msg.sender, amount, paid, fee, feeUsdt);
    }

    /// @notice 賣家下架（市場暫停時也可以，確保道具永遠拿得回來）
    function cancel(uint256 listingId) external nonReentrant {
        if (msg.sender != _listings[listingId].seller) revert NotSeller();
        _close(listingId);
    }

    /// @notice 救援：owner 幫賣家下架、道具退回賣家（市場要汰換、賣家錢包不會操作時）。道具只會回到原賣家
    function adminCancel(uint256[] calldata listingIds) external onlyAdmin nonReentrant {
        for (uint256 i; i < listingIds.length; ++i) if (_listings[listingIds[i]].active) _close(listingIds[i]);
    }

    /// @notice 救援：有人不小心直接轉進市場的配件道具（不是掛單的），只能動超出掛單保管量的部分
    function rescueParts(uint256 id, uint256 amount, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 extra = parts.balanceOf(address(this), id) - escrowed[id];
        if (amount > extra) revert TooMuch(extra);
        parts.safeTransferFrom(address(this), to, id, amount, "");
        emit Rescued(address(parts), id, to, amount);
    }

    /// @notice 救援：不小心轉進市場的 ERC-20（市場平常不留任何 ASC）
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, 0, to, amount);
    }

    function _close(uint256 listingId) private {
        Listing storage l = _listings[listingId];
        if (!l.active) revert NotActive();
        uint256 amount = l.remaining;
        l.remaining = 0;
        l.active = false;
        escrowed[l.id] -= amount;
        parts.safeTransferFrom(address(this), l.seller, l.id, amount, "");
        emit Cancelled(listingId, amount);
    }

    /* ───── 查詢 ───── */

    /// @notice 這筆掛單的總手續費率（bps）
    function feeFor(uint256 listingId) public view returns (uint256 bps) {
        bps = asc.isFlagged(_listings[listingId].seller) ? flagFeeBps : feeBps;
    }

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        return _listings[listingId];
    }

    /// @notice 一次讀很多筆（網站用）：從 from 開始最多 count 筆
    function listings(uint256 from, uint256 count) external view returns (Listing[] memory out) {
        uint256 n = _listings.length;
        if (from > n) from = n;
        if (count > n - from) count = n - from;
        out = new Listing[](count);
        for (uint256 i; i < count; ++i) out[i] = _listings[from + i];
    }

    /* ───── owner ───── */

    function setPolicy(uint256 feeBps_, uint256 flagFeeBps_, uint256 maxTradeValue_) external onlyAdmin {
        if (feeBps_ > MAX_TOTAL_FEE_BPS || flagFeeBps_ > MAX_TOTAL_FEE_BPS) revert BadFee();
        (feeBps, flagFeeBps, maxTradeValue) = (feeBps_, flagFeeBps_, maxTradeValue_);
        emit PolicyChanged(feeBps_, flagFeeBps_, maxTradeValue_);
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    function _checkVerified(address a) private view {
        if (asc.verifiedOnly() && !asc.isVerified(a)) revert NotVerified(a);
    }
}
