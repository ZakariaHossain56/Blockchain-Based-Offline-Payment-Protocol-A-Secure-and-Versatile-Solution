// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract BidirectionalPaymentChannel {
    address public partyA;
    address public partyB;
    uint256 public expiryTime;
    uint256 public depositA;
    uint256 public depositB;
    bool public isClosed;

    mapping(bytes32 => bool) public usedStates;

    event ChannelFunded(address indexed from, uint256 amount);
    event ChannelClosed(uint256 balanceA, uint256 balanceB);
    event FinalStateSubmitted(address submitter, uint256 balanceA, uint256 balanceB);

    modifier onlyParticipants() {
        require(msg.sender == partyA || msg.sender == partyB, "Not a channel participant");
        _;
    }

    modifier onlyIfNotClosed() {
        require(!isClosed, "Channel is already closed");
        _;
    }

    modifier onlyIfExpired() {
        require(block.timestamp >= expiryTime, "Channel has not expired yet");
        _;
    }

    constructor(address _partyB, uint256 _duration) payable {
        partyA = msg.sender;
        partyB = _partyB;
        expiryTime = block.timestamp + _duration;  // Set the expiry time
        depositA = msg.value;
        emit ChannelFunded(partyA, msg.value);
    }

    function fundChannelByPartyB() external payable onlyIfNotClosed {
        require(depositB == 0, "Already funded by Party B");
        require(msg.sender == partyB, "Only Party B can fund");
        depositB = msg.value;
        emit ChannelFunded(partyB, msg.value);
    }

    function submitFinalState(
        uint256 balanceA,
        uint256 balanceB,
        uint256 nonce,
        bytes memory sigA,
        bytes memory sigB
    ) external onlyParticipants onlyIfNotClosed {
        bytes32 stateHash = keccak256(
            abi.encodePacked(balanceA, balanceB, nonce, address(this))
        );
        require(!usedStates[stateHash], "State already used");
        usedStates[stateHash] = true;

        // Recover the signers to validate the signatures
        require(recoverSigner(stateHash, sigA) == partyA, "Invalid signature for Party A");
        require(recoverSigner(stateHash, sigB) == partyB, "Invalid signature for Party B");

        isClosed = true; // Close the channel

        // Distribute funds
        require(balanceA + balanceB <= address(this).balance, "Invalid final state balances");

        if (balanceA > 0) payable(partyA).transfer(balanceA);
        if (balanceB > 0) payable(partyB).transfer(balanceB);

        emit FinalStateSubmitted(msg.sender, balanceA, balanceB);
        emit ChannelClosed(balanceA, balanceB);
    }

    // Recover signer from the provided signature
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

    // Emergency withdraw after expiry if the channel is not closed
    function timeoutWithdraw() external onlyParticipants onlyIfExpired {
        require(!isClosed, "Channel already closed");
        isClosed = true;
        payable(partyA).transfer(depositA);
        payable(partyB).transfer(depositB);
        emit ChannelClosed(depositA, depositB);
    }

    // Fallback function to accept ether
    receive() external payable {}
}
