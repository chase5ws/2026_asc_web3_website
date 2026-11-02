// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AscRoles} from "../common/AscRoles.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title AscCatParts - 喵武士配件道具（ERC-1155，可以交易）
/// @notice 道具編號 id = 類別 × 256 + 選項（類別：0 Wepon、1 Body、2 Clothes、3 Face、4 Dress；選項對照 traits.json）
///   只有喵武士合約（minter）能發行與銷毀：轉蛋抽到、換裝換下來 → 發給玩家；換裝穿上 → 從玩家背包銷毀。
///   喵武士身上「裝備中」的配件不在玩家背包裡，換下來才會變成道具。
contract AscCatParts is ERC1155, AscRoles {
    using Strings for uint256;

    address public minter;
    address public operator; // 例如 Discord 機器人：只能凍結被盜錢包
    mapping(address => bool) public frozen; // 被盜錢包：道具不能轉出
    bool private _recovering;
    string private _base;

    event MinterChanged(address minter);
    event OperatorChanged(address operator);
    event FrozenChanged(address indexed account, bool frozen);
    event PartsRecovered(address indexed from, address indexed to, uint256[] ids, uint256[] amounts);
    event BaseURIChanged(string baseURI);

    error NotMinter();
    error NotOperator();
    error WalletFrozen(address account);
    error NotFrozen(address account);
    error ZeroAddress();

    constructor(address initialOwner, string memory baseURI_) ERC1155("") Ownable(initialOwner) {
        _base = baseURI_;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    function name() external pure returns (string memory) {
        return "Asc Cat Samurai Parts";
    }

    function symbol() external pure returns (string memory) {
        return "ACSP";
    }

    /// @notice 道具 metadata：{baseURI}{id}.json（id 是十進位）
    function uri(uint256 id) public view override returns (string memory) {
        return string.concat(_base, id.toString(), ".json");
    }

    function partId(uint8 cat, uint8 idx) external pure returns (uint256) {
        return uint256(cat) * 256 + idx;
    }

    /// @notice 一次讀某人很多種道具的數量
    function balancesOf(address account, uint256[] calldata ids) external view returns (uint256[] memory out) {
        out = new uint256[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = balanceOf(account, ids[i]);
    }

    function mint(address to, uint256 id, uint256 amount) external onlyMinter {
        _mint(to, id, amount, "");
    }

    function burn(address from, uint256 id, uint256 amount) external onlyMinter {
        _burn(from, id, amount);
    }

    /* ───── 被盜救援 ───── */

    /// @notice owner 或作業員：凍結被盜錢包（道具不能轉出、不能上架），玩家回報後馬上按
    function setFrozen(address[] calldata users, bool v) external {
        if (msg.sender != operator && !_isAdmin(msg.sender)) revert NotOperator();
        for (uint256 i; i < users.length; ++i) {
            frozen[users[i]] = v;
            emit FrozenChanged(users[i], v);
        }
    }

    /// @notice owner：把「已凍結」錢包的道具搬到玩家的新錢包（只能從凍結的錢包搬）
    function recoverParts(address from, address to, uint256[] calldata ids, uint256[] calldata amounts) external onlyOwner {
        if (!frozen[from]) revert NotFrozen(from);
        if (to == address(0) || frozen[to]) revert ZeroAddress();
        _recovering = true;
        _safeBatchTransferFrom(from, to, ids, amounts, "");
        _recovering = false;
        emit PartsRecovered(from, to, ids, amounts);
    }

    function setOperator(address op) external onlyAdmin {
        operator = op;
        emit OperatorChanged(op);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0) && frozen[from] && !_recovering) revert WalletFrozen(from);
        super._update(from, to, ids, values);
    }

    /// @notice owner：設定喵武士合約（只有它能發行／銷毀道具）
    function setMinter(address m) external onlyOwner {
        if (m == address(0)) revert ZeroAddress();
        minter = m;
        emit MinterChanged(m);
    }

    /// @notice 救援：metadata 主機失效時改成新網址（{新網址}{id}.json）
    function setBaseURI(string calldata b) external onlyAdmin {
        _base = b;
        emit URI(b, 0);
        emit BaseURIChanged(b);
    }
}
