// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Intentionally vulnerable Solidity code for scanner validation.
// DO NOT deploy.

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract VulnContract {
    address public owner;
    uint256 public price;
    AggregatorV3Interface internal priceFeed;
    IERC20 internal token;

    // 27. Oracle stale data — latestRoundData without staleness check
    function getPrice() external view returns (uint256) {
        (, int256 answer,,,) = priceFeed.latestRoundData();
        return uint256(answer);
    }

    // 28. Flash loan vulnerability — balanceOf for pricing
    function calculateValue() external view returns (uint256) {
        return token.balanceOf(address(this)) * price / 1e18;
    }

    // 29. Storage collision via delegatecall with state
    function upgrade(address impl, bytes calldata data) external {
        impl.delegatecall(data);
    }

    // 30. State change without event emission
    function setOwner(address _owner) external {
        owner = _owner;
    }
}
