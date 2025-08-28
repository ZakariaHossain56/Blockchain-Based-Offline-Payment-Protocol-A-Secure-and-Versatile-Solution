// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract BidirectionalPaymentChannel {
    address public partyA;
    address public partyB;
    uint256 public expiryTime;
    uint256 public depositA;
    uint256 public depositB;
    bool public isClosed;
    bool public isActive;  // channel is active only after both parties have funded
    uint256 public round;   // session counter

    // usedStates per round to prevent replay across sessions
    mapping(uint256 => mapping(bytes32 => bool)) public usedStates;
    mapping(address => uint256) public pendingWithdrawals;

    event ChannelRequested(address indexed from, address indexed to, uint256 amount);
    event ChannelFunded(address indexed from, uint256 amount);
    event ChannelReopened(uint256 round, uint256 expiryTime, uint256 depositA, uint256 depositB);
    event ChannelClosed(uint256 balanceA, uint256 balanceB, uint256 round);
    event FinalStateSubmitted(address submitter, uint256 balanceA, uint256 balanceB, uint256 round);
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

    /// Constructor: Party A deploys and funds the contract; pass partyB and initial duration (seconds)
    constructor(address _partyB, uint256 _duration) payable {
        require(msg.value > 0, "A must deposit funds");
        partyA = msg.sender;
        partyB = _partyB;
        depositA = msg.value;
        expiryTime = block.timestamp + _duration;
        isActive = false;
        isClosed = false;
        round = 1;
        emit ChannelRequested(partyA, partyB, msg.value);
    }

    /// General fund function: either participant can top-up their deposit
    function fundChannel() external payable onlyParticipants {
        require(msg.value > 0, "Must send ETH to fund");

        if (msg.sender == partyA) {
            depositA += msg.value;
        } else {
            depositB += msg.value;
        }

        // activate if both deposits present
        if (depositA > 0 && depositB > 0) {
            isActive = true;
            isClosed = false;
        }

        emit ChannelFunded(msg.sender, msg.value);
    }

    /// Backwards-compatible helper for your frontend
    function fundReceiver() external payable {
        require(msg.sender == partyB, "Only receiver can fund");
        require(msg.value > 0, "Receiver must deposit funds");
        depositB += msg.value;

        if (depositA > 0 && depositB > 0) {
            isActive = true;
            isClosed = false;
        }

        emit ChannelFunded(partyB, msg.value);
    }

    /// Reopen a new session (round). Caller may send ETH to top up their deposit.
    /// _duration is seconds from now for the new expiry.
    function reopenChannel(uint256 _duration) external payable onlyParticipants {
        require(isClosed || !isActive, "Channel currently active");

        if (msg.value > 0) {
            if (msg.sender == partyA) depositA += msg.value;
            else depositB += msg.value;
        }

        // require both parties have deposits to open
        require(depositA > 0 && depositB > 0, "Both parties must have deposits to reopen");

        round += 1;
        expiryTime = block.timestamp + _duration;
        isClosed = false;
        isActive = true;

        emit ChannelReopened(round, expiryTime, depositA, depositB);
    }

    /// Final settlement for the current round. State hash includes `round`.
    function submitFinalState(
        uint256 balanceA,
        uint256 balanceB,
        uint256 nonce,
        bytes memory sigA,
        bytes memory sigB
    ) external onlyParticipants onlyIfActive onlyIfNotClosed {
        // include round so states cannot be replayed across sessions
        bytes32 stateHash = keccak256(abi.encodePacked(balanceA, balanceB, nonce, address(this), round));
        require(!usedStates[round][stateHash], "State already used");
        usedStates[round][stateHash] = true;

        require(recoverSigner(stateHash, sigA) == partyA, "Invalid signature for Party A");
        require(recoverSigner(stateHash, sigB) == partyB, "Invalid signature for Party B");

        uint256 totalRequested = balanceA + balanceB;
        require(totalRequested <= address(this).balance, "Invalid balances: not enough funds in contract");

        // attempt direct payout; if fails, credit pendingWithdrawals
        _attemptPay(partyA, balanceA);
        _attemptPay(partyB, balanceB);

        // close this round and zero deposits so reopen requires fresh funding
        isClosed = true;
        isActive = false;
        depositA = 0;
        depositB = 0;

        emit FinalStateSubmitted(msg.sender, balanceA, balanceB, round);
        emit ChannelClosed(balanceA, balanceB, round);
    }

    function _attemptPay(address recipient, uint256 amount) internal {
        if (amount == 0) {
            emit PaymentAttempt(recipient, amount, true);
            return;
        }

        (bool success, ) = payable(recipient).call{value: amount}("");
        if (!success) {
            pendingWithdrawals[recipient] += amount;
            emit PaymentAttempt(recipient, amount, false);
        } else {
            emit PaymentAttempt(recipient, amount, true);
        }
    }

    /// Withdraw funds credited due to failed push or timeout
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No funds to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Withdraw failed");
        emit Withdrawal(msg.sender, amount);
    }

    /// Emergency withdrawal after expiry if final settlement not submitted
    function timeoutWithdraw() external onlyParticipants onlyIfExpired onlyIfNotClosed {
        isClosed = true;
        isActive = false;

        if (depositA > 0) {
            (bool okA, ) = payable(partyA).call{value: depositA}("");
            if (!okA) pendingWithdrawals[partyA] += depositA;
        }
        if (depositB > 0) {
            (bool okB, ) = payable(partyB).call{value: depositB}("");
            if (!okB) pendingWithdrawals[partyB] += depositB;
        }

        depositA = 0;
        depositB = 0;

        emit ChannelClosed(depositA, depositB, round);
    }

    // helpers for signature recovery (personal_sign style)
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

    /// UI helper: contract balance
    function contractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {}
}
