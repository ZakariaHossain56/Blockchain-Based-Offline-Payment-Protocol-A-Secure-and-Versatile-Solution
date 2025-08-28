// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract BidirectionalPaymentChannel {
    address public partyA;
    address public partyB;
    uint256 public expiryTime;
    uint256 public depositA;
    uint256 public depositB;
    bool public isClosed;
    bool public isActive;  // channel is active only after B funds
    bool public isSettled; // ✅ prevent double settlement


    mapping(bytes32 => bool) public usedStates;
    mapping(address => uint256) public pendingWithdrawals;

    event ChannelRequested(address indexed from, address indexed to, uint256 amount);
    event ChannelFunded(address indexed from, uint256 amount);
    event ChannelClosed(uint256 balanceA, uint256 balanceB);
    event FinalStateSubmitted(address submitter, uint256 balanceA, uint256 balanceB);
    event Withdrawal(address indexed who, uint256 amount);
    event PaymentAttempt(address indexed to, uint256 amount, bool success);

    modifier onlyParticipants() {
        require(msg.sender == partyA || msg.sender == partyB, "Not a channel participant");
        _;
    }

    modifier onlyIfNotClosed() {
        require(!isClosed, "Channel is already closed");
        _;
    }

    modifier onlyIfActive() {
        require(isActive, "Channel not active yet");
        _;
    }

    modifier onlyIfExpired() {
        require(block.timestamp >= expiryTime, "Channel has not expired yet");
        _;
    }

    // Constructor: Party A funds and requests channel
    constructor(address _partyB, uint256 _duration) payable {
        require(msg.value > 0, "A must deposit funds");
        partyA = msg.sender;
        partyB = _partyB;
        depositA = msg.value;
        expiryTime = block.timestamp + _duration;
        isActive = false;
        emit ChannelRequested(partyA, partyB, msg.value);
    }

    // Receiver funds the channel
    function fundReceiver() external payable {
        require(msg.sender == partyB, "Only receiver can fund");
        require(!isActive, "Channel already active");
        require(msg.value > 0, "Receiver must deposit funds");

        depositB = msg.value;
        isActive = true;

        emit ChannelFunded(partyB, depositB);
    }

    // Final settlement after off-chain transactions
function submitFinalState(
    uint256 balanceA,
    uint256 balanceB,
    uint256 nonce,
    bytes memory sigA,
    bytes memory sigB
) external onlyParticipants onlyIfActive onlyIfNotClosed {
    require(!isSettled, "Channel already settled"); // ✅ new guard

    bytes32 stateHash = keccak256(
        abi.encodePacked(balanceA, balanceB, nonce, address(this))
    );
    require(!usedStates[stateHash], "State already used");
    usedStates[stateHash] = true;

    require(recoverSigner(stateHash, sigA) == partyA, "Invalid signature for Party A");
    require(recoverSigner(stateHash, sigB) == partyB, "Invalid signature for Party B");

    uint256 totalRequested = balanceA + balanceB;
    require(totalRequested <= address(this).balance, "Invalid balances: not enough funds in contract");

    // ✅ Perform final settlement
    _attemptPay(partyA, balanceA);
    _attemptPay(partyB, balanceB);

    isClosed = true;
    isSettled = true; // ✅ permanently lock channel

    emit FinalStateSubmitted(msg.sender, balanceA, balanceB);
    emit ChannelClosed(balanceA, balanceB);
}


    function _attemptPay(address recipient, uint256 amount) internal {
        if (amount == 0) {
            emit PaymentAttempt(recipient, amount, true);
            return;
        }

        // Use call to forward all gas, but check result. If it fails, credit for withdrawal.
        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            pendingWithdrawals[recipient] += amount;
            emit PaymentAttempt(recipient, amount, false);
        } else {
            emit PaymentAttempt(recipient, amount, true);
        }
    }

    // Withdraw function (pull) for recipients if call failed or they prefer withdrawal pattern
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to withdraw");
        // effects before interaction
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");
        emit Withdrawal(msg.sender, amount);
    }

    // Emergency withdrawal after expiry if final settlement not submitted
    function timeoutWithdraw() external onlyParticipants onlyIfExpired onlyIfNotClosed {
        isClosed = true;
        // credit pending withdrawals instead of immediate transfer for safety
        if (depositA > 0) {
            (bool okA, ) = payable(partyA).call{value: depositA}("");
            if (!okA) pendingWithdrawals[partyA] += depositA;
        }
        if (depositB > 0) {
            (bool okB, ) = payable(partyB).call{value: depositB}("");
            if (!okB) pendingWithdrawals[partyB] += depositB;
        }
        emit ChannelClosed(depositA, depositB);
    }

    // Signature recovery
    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        bytes32 ethSignedMessage = prefixed(message);
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);
        return ecrecover(ethSignedMessage, v, r, s);
    }

    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function splitSignature(bytes memory sig) internal pure returns (uint8, bytes32, bytes32) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27) v += 27;
        require(v == 27 || v == 28, "Invalid v");

        return (v, r, s);
    }

    // Fallback to accept Ether
    receive() external payable {}
}
