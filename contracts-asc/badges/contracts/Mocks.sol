// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// 匯入代理合約，讓 hardhat 一起編譯（部署頁用它的 bytecode）
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// 測試用：喵武士 NFT 只要 ownerOf／balanceOf／frozen／isRevealed
contract MockCatNFT {
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public frozen;
    mapping(uint256 => bool) public isRevealed;

    function mint(address to, uint256 id, bool revealed) external {
        ownerOf[id] = to;
        balanceOf[to] += 1;
        isRevealed[id] = revealed;
    }

    function transfer(uint256 id, address to) external {
        balanceOf[ownerOf[id]] -= 1;
        ownerOf[id] = to;
        balanceOf[to] += 1;
    }

    function setFrozen(address u, bool v) external {
        frozen[u] = v;
    }
}

/// 測試用：金庫只要 isVerified
contract MockVault {
    mapping(address => bool) public isVerified;

    function setVerified(address u, bool v) external {
        isVerified[u] = v;
    }
}
