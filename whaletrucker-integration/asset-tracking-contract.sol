// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/**
 * @title  AssetTracker
 * @author WhaleTrucker Ecosystem
 * @notice Production-ready asset balance and yield accrual tracker for the
 *         WhaleTrucker integration on Polkadot Hub.
 *
 * @dev    Designed for deployment on Polkadot Hub (EVM-compatible, chain IDs
 *         420420417 / 420420419).  The contract stores per-user, per-token
 *         balances and cumulative yield figures that are updated by the
 *         off-chain Yields Tracker bridge (`yields-tracker-integration.ts`).
 *
 *         XCM cross-chain state hooks are included as extensible placeholders
 *         pointing to the Polkadot XCM precompile interface.
 */
contract AssetTracker {

    // -----------------------------------------------------------------------
    // Custom Errors (gas-efficient vs. revert strings)
    // -----------------------------------------------------------------------

    /// @notice Caller is not the contract owner.
    error NotOwner();

    /// @notice Caller is not an authorised data-feed operator.
    error NotOperator();

    /// @notice Provided address is the zero address.
    error ZeroAddress();

    /// @notice Tracked amount must be greater than zero.
    error ZeroAmount();

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    /**
     * @notice Emitted when an asset balance is updated for a user.
     * @param user      The account whose balance changed.
     * @param token     The ERC-20 token address (or address(0) for native DOT).
     * @param oldAmount Previous tracked balance (in token base units).
     * @param newAmount New tracked balance (in token base units).
     */
    event AssetTracked(
        address indexed user,
        address indexed token,
        uint256 oldAmount,
        uint256 newAmount
    );

    /**
     * @notice Emitted when cumulative yield is updated for a user.
     * @param user        The beneficiary account.
     * @param token       The yield-bearing token address.
     * @param yieldAmount Incremental yield added (in token base units).
     * @param totalYield  New cumulative total yield for this user/token pair.
     */
    event YieldUpdated(
        address indexed user,
        address indexed token,
        uint256 yieldAmount,
        uint256 totalYield
    );

    /**
     * @notice Emitted when ownership of the contract is transferred.
     * @param previousOwner Old owner address.
     * @param newOwner      New owner address.
     */
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    /**
     * @notice Emitted when an operator is authorised or revoked.
     * @param operator The address whose status changed.
     * @param approved `true` if authorised, `false` if revoked.
     */
    event OperatorSet(address indexed operator, bool approved);

    /**
     * @notice Emitted when an XCM cross-chain asset state update is requested.
     * @param targetChain  Polkadot parachain ID of the destination.
     * @param user         Account whose state is being synchronised.
     * @param token        Token address on the source chain.
     * @param balance      Balance to be communicated cross-chain.
     */
    event XcmStateUpdateRequested(
        uint32 indexed targetChain,
        address indexed user,
        address indexed token,
        uint256 balance
    );

    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice Contract owner – has full administrative access.
    address public owner;

    /// @notice Accounts authorised to push asset/yield data from the bridge.
    mapping(address => bool) public operators;

    /**
     * @notice Tracked asset balance per user per token.
     * @dev    balances[user][token] = amount in token base units.
     */
    mapping(address => mapping(address => uint256)) public balances;

    /**
     * @notice Cumulative yield accrued per user per token.
     * @dev    yields[user][token] = total yield in token base units.
     */
    mapping(address => mapping(address => uint256)) public yields;

    /**
     * @notice List of tokens being tracked for a given user (for enumeration).
     * @dev    Tokens are appended on first balance update; never removed to
     *         avoid gas-intensive array manipulation.
     */
    mapping(address => address[]) private _trackedTokens;

    /**
     * @notice Guard to prevent duplicate entries in `_trackedTokens`.
     */
    mapping(address => mapping(address => bool)) private _tokenTracked;

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    /// @dev Restricts a function to the contract owner.
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @dev Restricts a function to authorised operators (or the owner).
    modifier onlyOperator() {
        if (!operators[msg.sender] && msg.sender != owner) revert NotOperator();
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /**
     * @notice Deploys the AssetTracker and assigns the deployer as owner.
     */
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // -----------------------------------------------------------------------
    // Admin Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Transfers contract ownership to `newOwner`.
     * @param  newOwner Address of the incoming owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Grants or revokes operator privileges for `operator`.
     * @param  operator Address to update.
     * @param  approved `true` to authorise, `false` to revoke.
     */
    function setOperator(address operator, bool approved) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = approved;
        emit OperatorSet(operator, approved);
    }

    // -----------------------------------------------------------------------
    // Asset Tracking Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Records or updates the tracked balance for `user` and `token`.
     * @dev    Only authorised operators (or the owner) may call this function.
     *         The function is intentionally NOT restricted to increase/decrease
     *         only – the bridge always pushes the authoritative balance.
     * @param  user    Account to update.
     * @param  token   Token address (use `address(0)` for native DOT).
     * @param  amount  New tracked balance in token base units.
     */
    function trackAsset(
        address user,
        address token,
        uint256 amount
    ) external onlyOperator {
        if (user == address(0)) revert ZeroAddress();

        uint256 oldAmount = balances[user][token];
        balances[user][token] = amount;

        // Register the token in the enumeration list on first encounter.
        if (!_tokenTracked[user][token]) {
            _tokenTracked[user][token] = true;
            _trackedTokens[user].push(token);
        }

        emit AssetTracked(user, token, oldAmount, amount);
    }

    /**
     * @notice Batch-updates balances for multiple user/token pairs in one
     *         transaction, reducing gas overhead for bulk synchronisations.
     * @param  users   Array of user addresses.
     * @param  tokens  Array of token addresses (parallel to `users`).
     * @param  amounts Array of new balances (parallel to `users`).
     */
    function trackAssetBatch(
        address[] calldata users,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external onlyOperator {
        uint256 length = users.length;
        require(
            tokens.length == length && amounts.length == length,
            "AssetTracker: array length mismatch"
        );

        for (uint256 i = 0; i < length; ) {
            address user  = users[i];
            address token = tokens[i];
            uint256 amount = amounts[i];

            if (user == address(0)) revert ZeroAddress();

            uint256 oldAmount = balances[user][token];
            balances[user][token] = amount;

            if (!_tokenTracked[user][token]) {
                _tokenTracked[user][token] = true;
                _trackedTokens[user].push(token);
            }

            emit AssetTracked(user, token, oldAmount, amount);

            unchecked { ++i; }
        }
    }

    // -----------------------------------------------------------------------
    // Yield Accrual Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Records incremental yield earned by `user` for `token`.
     * @dev    Yield is *additive* – each call appends to the cumulative total.
     * @param  user        Beneficiary account.
     * @param  token       Yield-bearing token address.
     * @param  yieldAmount Incremental yield in token base units (must be > 0).
     */
    function updateYield(
        address user,
        address token,
        uint256 yieldAmount
    ) external onlyOperator {
        if (user == address(0)) revert ZeroAddress();
        if (yieldAmount == 0) revert ZeroAmount();

        yields[user][token] += yieldAmount;

        emit YieldUpdated(user, token, yieldAmount, yields[user][token]);
    }

    // -----------------------------------------------------------------------
    // XCM Cross-Chain State (Extensibility Hooks)
    // -----------------------------------------------------------------------

    /**
     * @notice Requests a cross-chain balance state update to a target parachain
     *         via XCM.  This function emits an event that the off-chain bridge
     *         monitors to construct and dispatch the XCM message.
     *
     * @dev    Direct XCM dispatch can be wired here once the XCM precompile
     *         address is confirmed for the deployed network.  The precompile
     *         interface is available at:
     *         https://docs.polkadot.network/smart-contracts/precompiles/xcm/
     *
     * @param  targetChain Parachain ID of the destination chain.
     * @param  user        Account whose state is being synchronised.
     * @param  token       Token address on this (source) chain.
     */
    function requestXcmStateUpdate(
        uint32 targetChain,
        address user,
        address token
    ) external onlyOperator {
        if (user == address(0)) revert ZeroAddress();

        uint256 currentBalance = balances[user][token];

        emit XcmStateUpdateRequested(targetChain, user, token, currentBalance);
    }

    // -----------------------------------------------------------------------
    // View / Query Functions
    // -----------------------------------------------------------------------

    /**
     * @notice Returns the tracked balance for `user` and `token`.
     * @param  user  Account to query.
     * @param  token Token address.
     * @return amount Tracked balance in token base units.
     */
    function getBalance(
        address user,
        address token
    ) external view returns (uint256 amount) {
        return balances[user][token];
    }

    /**
     * @notice Returns the cumulative yield for `user` and `token`.
     * @param  user  Account to query.
     * @param  token Token address.
     * @return totalYield Cumulative yield in token base units.
     */
    function getYield(
        address user,
        address token
    ) external view returns (uint256 totalYield) {
        return yields[user][token];
    }

    /**
     * @notice Returns all token addresses that have been tracked for `user`.
     * @param  user Account to query.
     * @return tokens Array of token addresses.
     */
    function getTrackedTokens(
        address user
    ) external view returns (address[] memory tokens) {
        return _trackedTokens[user];
    }

    /**
     * @notice Convenience function – returns balance and yield in one call.
     * @param  user  Account to query.
     * @param  token Token address.
     * @return balance    Current tracked balance.
     * @return totalYield Cumulative yield accrued.
     */
    function getAssetSummary(
        address user,
        address token
    ) external view returns (uint256 balance, uint256 totalYield) {
        return (balances[user][token], yields[user][token]);
    }
}
