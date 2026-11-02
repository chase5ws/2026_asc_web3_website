// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title AscRoles - 權限（4 份合約共用）
/// @notice 三種管理角色（加上 Discord 機器人用的 operator）：
///   owner（主人，只有一個，建議 Safe）
///     · 可以做 admin 的所有事
///     · 只有 owner 能：轉移合約、指定／更換 admin、抽保底、動到資金或別人資產的指令（各合約標 onlyOwner 的）
///     · 轉移合約要兩個錢包確認：owner 先 transferOwnership(新地址) → 新地址自己 acceptOwnership() 才生效
///   admin（助手，只有一個，owner 指定，可隨時更換或設 0 取消）
///     · 可以做日常營運（標 onlyAdmin 的）：開關、價格、白名單、VIP、空投、凍結被盜錢包…
///     · 不能轉移合約、不能指定 admin、不能抽保底
///   GUARDIAN（救援錢包，寫死不能改）
///     · 只能 guardianTakeover(新owner)：owner 被盜時強制轉移合約主人
///   合約主人一換（不管是正常轉移或救援接管），admin 會自動清空，新主人要重新指定。
abstract contract AscRoles is Ownable2Step {
    address public constant GUARDIAN = 0xDe8119fE605C934C99cF2ADF2e76e151e8F5E887;

    address public admin;

    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    event GuardianTakeover(address indexed oldOwner, address indexed newOwner);

    error NotAdmin();
    error NotGuardian();
    error BadRoleTarget();
    error RenounceDisabled();

    /// owner 或 admin
    modifier onlyAdmin() {
        if (!_isAdmin(msg.sender)) revert NotAdmin();
        _;
    }

    /// @notice owner：指定助手 admin（只有一個；再呼叫一次就是更換；設 0 = 取消）
    function setAdmin(address a) external onlyOwner {
        if (a != address(0) && (a == owner() || a == GUARDIAN)) revert BadRoleTarget();
        emit AdminChanged(admin, a);
        admin = a;
    }

    /// @notice 救援錢包：owner 被盜時強制把合約主人轉給新地址（立即生效，取消進行中的轉移、清空 admin）
    function guardianTakeover(address newOwner) external {
        if (msg.sender != GUARDIAN) revert NotGuardian();
        if (newOwner == address(0)) revert BadRoleTarget();
        address old = owner();
        _transferOwnership(newOwner);
        emit GuardianTakeover(old, newOwner);
    }

    /// 不允許放棄主人（避免合約變成沒人管）
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    function _isAdmin(address a) internal view returns (bool) {
        return a == owner() || (a == admin && a != address(0));
    }

    /// 主人換人時清空 admin，也清掉進行中的轉移（Ownable2Step）
    function _transferOwnership(address newOwner) internal virtual override {
        if (admin != address(0)) {
            emit AdminChanged(admin, address(0));
            admin = address(0);
        }
        super._transferOwnership(newOwner);
    }
}
