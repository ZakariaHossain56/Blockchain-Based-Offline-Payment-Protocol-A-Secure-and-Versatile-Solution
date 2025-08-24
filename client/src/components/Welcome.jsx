import React, { useContext, useState, useEffect, useMemo } from "react";
import { AiFillPlayCircle } from "react-icons/ai";
import { SiEthereum } from "react-icons/si";
import { BsInfoCircle } from "react-icons/bs";
import { TransactionContext } from "../context/TransactionContext";
import { shortenAddress } from "../utils/shortenAddress";
import { Loader } from ".";
import { ethers } from "ethers";
import contractJson from "../storage/BidirectionalPaymentChannel.json";
import { io } from "socket.io-client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";


/**
 * Frontend-only microtransaction flow using WebSockets + MetaMask signatures
 * - Sender proposes an off-chain transfer via socket: "microTxProposed"
 * - Receiver accepts → verifies, signs, and emits: "microTxAccepted"
 * - Both parties persist state + tx history to localStorage
 *
 * Saved JSON per channel (contractAddress):
 * - channelState:{ balanceA, balanceB, nonce }
 * - txHistory:[ { txHash, sender, receiver, sentAmount, senderBal, receiverBal, nonce, timestamp, senderSig, receiverSig } ]
 */

const companyCommonStyles =
  "min-h-[70px] sm:px-0 px-2 sm:min-w-[120px] flex justify-center items-center border-[0.5px] border-gray-400 text-sm font-light text-white";

const Input = ({ placeholder, name, type, value, handleChange, disabled }) => (
  <input
    placeholder={placeholder}
    type={type}
    step="0.0001"
    value={value}
    onChange={(e) => handleChange(e, name)}
    disabled={disabled}
    className={`my-2 w-full rounded-sm p-2 outline-none bg-transparent text-white border-none text-sm white-glassmorphism ${disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
  />
);

// --- Socket ---
const socket = io("http://localhost:5000");

export default function Welcome() {
  const {
    currentAccount,
    connectWallet,
    switchWallet,
    handleChange,
    formData,
    isLoading,
  } = useContext(TransactionContext);

  const [deploying, setDeploying] = useState(false);
  const [deployForm, setDeployForm] = useState({ receiver: "", fundingAmount: "" });
  const [incomingDeployment, setIncomingDeployment] = useState(null);
  const [currentDeployment, setCurrentDeployment] = useState(null);

  // Channel state (off-chain balances + nonce)
  const [channelState, setChannelState] = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [pendingProposal, setPendingProposal] = useState(null); // proposal awaiting receiver's action

  const partyA = useMemo(() => currentDeployment?.sender?.toLowerCase(), [currentDeployment]);
  const partyB = useMemo(() => currentDeployment?.receiver?.toLowerCase(), [currentDeployment]);
  const isPartyA = useMemo(() => currentAccount && partyA && currentAccount.toLowerCase() === partyA, [currentAccount, partyA]);
  const isPartyB = useMemo(() => currentAccount && partyB && currentAccount.toLowerCase() === partyB, [currentAccount, partyB]);

  const storageKeys = useMemo(() => {
    if (!currentDeployment?.contractAddress) return null;
    const c = currentDeployment.contractAddress.toLowerCase();
    return {
      state: `channelState:${c}`,
      history: `txHistory:${c}`,
    };
  }, [currentDeployment]);

  const handleDeployChange = (e, name) => {
    setDeployForm({ ...deployForm, [name]: e.target.value });
  };

  //--- helpers: localStorage persistence ---
  const loadPersisted = async () => {
    if (!currentDeployment?.contractAddress) return;
    try {
      // Load channel state
      const stateRes = await fetch(`http://localhost:5000/api/loadChannel/${currentDeployment.contractAddress}`);
      const stateData = await stateRes.json();
      if (stateData) setChannelState(stateData);

      // Load transaction history
      const txRes = await fetch(`http://localhost:5000/api/loadTx/${currentDeployment.contractAddress}`);
      const txData = await txRes.json();
      if (txData) setTxHistory(txData);
    } catch (err) {
      console.error("Failed to load persisted state from server", err);
    }
  };


  const persistState = async (nextState) => {
    if (!currentDeployment?.contractAddress) return;
    try {
      await fetch("http://localhost:5000/api/saveChannel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: currentDeployment.contractAddress,
          state: nextState,
        }),
      });
    } catch (err) {
      console.error("Failed to persist channel state to server", err);
    }
  };

  const persistHistory = async (nextHistory) => {
    if (!currentDeployment?.contractAddress) return;
    try {
      await fetch("http://localhost:5000/api/saveTx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: currentDeployment.contractAddress,
          history: nextHistory,
        }),
      });
    } catch (err) {
      console.error("Failed to persist tx history to server", err);
    }
  };



  // --- Socket registration and listeners ---
  useEffect(() => {
    if (!currentAccount) return;
    socket.emit("register", currentAccount);

    // New channel deployments (unchanged from your flow)
    socket.on("newDeployment", (deployment) => {
      const acc = currentAccount.toLowerCase();
      if (deployment.receiver.toLowerCase() === acc) { // <- only receiver
        setIncomingDeployment(deployment);
        toast.info(`📢 New Deployment from ${shortenAddress(deployment.sender)}`, {
          position: "top-right",
          autoClose: 5000,
        });
      }
    });


    socket.on("deploymentAccepted", (deployment) => {
      const acc = currentAccount.toLowerCase();
      if (deployment.receiver.toLowerCase() === acc || deployment.sender.toLowerCase() === acc) {
        alert(`Deployment accepted!\nContract: ${shortenAddress(deployment.contractAddress)}`);
        setCurrentDeployment({ ...deployment, accepted: true });
        setIncomingDeployment(null);
      }
    });


    socket.on("channelDestroyed", (contractAddress) => {
      // Clear current deployment if it matches
      if (
        (currentDeployment && currentDeployment.contractAddress === contractAddress) ||
        (incomingDeployment && incomingDeployment.contractAddress === contractAddress)
      ) {
        alert("⚠️ Channel has been destroyed.");
        setCurrentDeployment(null);
        setIncomingDeployment(null);
        setChannelState(null);
        setTxHistory([]);
      }
    });


    // --- MicroTX events ---
    socket.on("microTxProposed", async (proposal) => {
      // Receiver side: only if this user is the intended receiver for this channel
      if (!currentDeployment || proposal.contractAddress?.toLowerCase() !== currentDeployment.contractAddress?.toLowerCase()) return;
      const acc = currentAccount?.toLowerCase();
      if (!acc || proposal.receiver?.toLowerCase() !== acc) return;
      // Show toast & set pending
      setPendingProposal(proposal);
      toast.info(`💬 Incoming micro-payment of ${proposal.sentAmount} ETH from ${shortenAddress(proposal.sender)}`, { autoClose: 4000 });
    });

    socket.on("microTxAccepted", (txRecord) => {
  if (!currentDeployment || txRecord.contractAddress?.toLowerCase() !== currentDeployment.contractAddress?.toLowerCase()) return;

  // Update channel state using sender/receiver balances
  setChannelState({
    balanceSender: txRecord.balanceSender,
    balanceReceiver: txRecord.balanceReceiver,
    nonce: txRecord.nonce,
  });

  setTxHistory((prev) => {
    const next = [...prev, {
      txHash: txRecord.txHash,
      sender: txRecord.sender,
      receiver: txRecord.receiver,
      sentAmount: txRecord.sentAmount,
      nonce: txRecord.nonce,
      timestamp: txRecord.timestamp,
      senderSig: txRecord.senderSig,
      receiverSig: txRecord.receiverSig,
      balanceSender: txRecord.balanceSender,
      balanceReceiver: txRecord.balanceReceiver,
    }];
    persistHistory(next);
    return next;
  });

  setPendingProposal(null);
});



    return () => {
      socket.off("newDeployment");
      socket.off("deploymentAccepted");
      socket.off("channelDestroyed");
      socket.off("microTxProposed");
      socket.off("microTxAccepted");
    };
  }, [currentAccount, currentDeployment]);

  // --- Fetch deployments for current account (unchanged) ---
  useEffect(() => {
    if (!currentAccount) return;
    const fetchDeployments = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/deployments/${currentAccount}`);
        const data = await res.json();

        // Pick the last accepted deployment, or null if none
        const activeDeployment = data.reverse().find(d => d.accepted);
        if (activeDeployment) {
          setCurrentDeployment(activeDeployment);
        } else {
          setCurrentDeployment(null);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchDeployments();
  }, [currentAccount]);


  useEffect(() => {
    if (!currentDeployment?.contractAddress) return;

    const loadStateAndHistory = async () => {
      const addr = currentDeployment.contractAddress.toLowerCase();

      try {
        // Fetch channel state from backend
        const stateRes = await fetch(`http://localhost:5000/api/loadChannel/${addr}`);
        const stateData = await stateRes.json();
        if (stateData) {
          setChannelState(stateData);
        } else {
          // --- FIXED: handle funding by Party A or Party B ---
          const funded = ethers.utils.parseEther(currentDeployment.fundedAmount || "0").toString();
          const balanceA = isPartyA ? funded : "0";
          const balanceB = isPartyB ? funded : "0";

          setChannelState({
            balanceA,
            balanceB,
            nonce: 0,
          });
        }

        // Fetch tx history from backend
        const txRes = await fetch(`http://localhost:5000/api/loadTx/${addr}`);
        const txData = await txRes.json();
        if (txData) setTxHistory(txData);
        else setTxHistory([]);
      } catch (err) {
        console.error("Failed to load channel state or tx history", err);
        const funded = ethers.utils.parseEther(currentDeployment.fundedAmount || "0").toString();
        const balanceA = isPartyA ? funded : "0";
        const balanceB = isPartyB ? funded : "0";

        setChannelState({
          balanceA,
          balanceB,
          nonce: 0,
        });
        setTxHistory([]);
      }
    };

    loadStateAndHistory();
  }, [currentDeployment, isPartyA, isPartyB]);





  const deployContract = async () => {
    try {
      if (!window.ethereum) return alert("Please install MetaMask");
      if (!deployForm.receiver || !deployForm.fundingAmount) {
        return alert("Please enter receiver address and funding amount");
      }

      setDeploying(true);
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const factory = new ethers.ContractFactory(
        contractJson.abi,
        contractJson.bytecode,
        signer
      );

      const partyBAddr = deployForm.receiver;
      const duration = 3600;
      const value = ethers.utils.parseEther(deployForm.fundingAmount);

      const contract = await factory.deploy(partyBAddr, duration, { value });
      const receipt = await contract.deployTransaction.wait();

      const deploymentInfo = {
        network: (await provider.getNetwork()).name,
        contractAddress: contract.address,
        sender: await signer.getAddress(),
        receiver: partyBAddr,
        fundedAmount: deployForm.fundingAmount,
        gasUsed: receipt.gasUsed.toString(),
        blockNumber: receipt.blockNumber,
        timestamp: new Date().toISOString(),
        accepted: false,
      };

      await fetch("http://localhost:5000/api/saveDeployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentInfo),
      });

      setDeployForm({ receiver: "", fundingAmount: "" });
      setCurrentDeployment(deploymentInfo);
      setDeploying(false);
    } catch (err) {
      setDeploying(false);
      console.error("Deployment failed:", err);
      alert("Deployment failed: " + err.message);
    }
  };

  const acceptDeployment = async () => {
    if (!incomingDeployment) return;
    try {
      const res = await fetch("http://localhost:5000/api/acceptDeployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: incomingDeployment.contractAddress,
          receiver: currentAccount, // Party B just accepts
        }),
      });
      const acceptedDeployment = await res.json();

      setCurrentDeployment({ ...acceptedDeployment, accepted: true });
      setIncomingDeployment(null);

      toast.success("✅ Channel accepted and ready to use");

      // Notify via socket
      socket.emit("deploymentAccepted", acceptedDeployment);
    } catch (err) {
      console.error(err);
      toast.error("Failed to accept deployment");
    }
  };


  const destroyChannel = async () => {
    if (!currentDeployment) return;
    try {
      const confirm = window.confirm(
        `Are you sure you want to destroy the channel with ${shortenAddress(
          currentDeployment.receiver
        )}?`
      );
      if (!confirm) return;

      await fetch("http://localhost:5000/api/destroyDeployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress: currentDeployment.contractAddress }),
      });

      socket.emit("channelDestroyed", currentDeployment.contractAddress);

      alert("✅ Channel destroyed successfully.");
      setCurrentDeployment(null);
      setIncomingDeployment(null);
      setChannelState(null);
      setTxHistory([]);
    } catch (err) {
      console.error(err);
      alert("Failed to destroy channel: " + err.message);
    }
  };

  // --- Microtransaction flow (frontend only) ---
  const canShowTransactionForm = () => currentDeployment && currentDeployment.accepted;

  const proposeMicroTx = async () => {
  if (!window.ethereum) return alert("Please install MetaMask");
  if (!canShowTransactionForm()) return alert("Channel not accepted yet");
  if (!channelState) return alert("Channel state not ready");

  const { amount } = formData;
  if (!amount) return alert("Enter amount");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const senderAddr = (await signer.getAddress()).toLowerCase();

  // Determine receiver: typed in form or default to the other party
  let receiverAddr = formData.addressTo?.toLowerCase() || null;
  const deploymentSender = currentDeployment.sender.toLowerCase();
  const deploymentReceiver = currentDeployment.receiver.toLowerCase();

  if (!receiverAddr) {
    receiverAddr = senderAddr === deploymentSender ? deploymentReceiver : deploymentSender;
  }

  // Validate sender and receiver are channel participants
  if (![deploymentSender, deploymentReceiver].includes(senderAddr)) {
    return alert("Sender must be a channel participant");
  }
  if (![deploymentSender, deploymentReceiver].includes(receiverAddr)) {
    return alert("Receiver must be the other party in the channel");
  }

  const amountWei = ethers.utils.parseEther(amount);

  // Compute next balances based on sender/receiver
  let nextSenderBalance, nextReceiverBalance;

// Use channelState.sender / receiver as reference
if (senderAddr === channelState.sender && receiverAddr === channelState.receiver) {
  nextSenderBalance = ethers.BigNumber.from(channelState.balanceSender);
  nextReceiverBalance = ethers.BigNumber.from(channelState.balanceReceiver);
} else if (senderAddr === channelState.receiver && receiverAddr === channelState.sender) {
  nextSenderBalance = ethers.BigNumber.from(channelState.balanceReceiver);
  nextReceiverBalance = ethers.BigNumber.from(channelState.balanceSender);
} else {
  return alert("Sender/receiver mismatch");
}


  if (nextSenderBalance.lt(amountWei)) return alert("Insufficient sender balance");

  nextSenderBalance = nextSenderBalance.sub(amountWei);
  nextReceiverBalance = nextReceiverBalance.add(amountWei);

  const nextNonce = channelState.nonce + 1;

  // Generate state hash for signature
  const stateHash = ethers.utils.solidityKeccak256(
    ["uint256", "uint256", "uint256", "address"],
    [nextSenderBalance.toString(), nextReceiverBalance.toString(), nextNonce, currentDeployment.contractAddress]
  );

  const senderSig = await signer.signMessage(ethers.utils.arrayify(stateHash));

  const proposal = {
    contractAddress: currentDeployment.contractAddress,
    sender: senderAddr,
    receiver: receiverAddr,
    sentAmount: amount,
    stateHash,
    balanceSender: nextSenderBalance.toString(),
    balanceReceiver: nextReceiverBalance.toString(),
    nonce: nextNonce,
    timestamp: new Date().toISOString(),
    senderSig,
  };

  // Optimistic UI: update balances locally
  setChannelState({
    balanceSender: nextSenderBalance.toString(),
    balanceReceiver: nextReceiverBalance.toString(),
    nonce: nextNonce,
  });

  // Emit proposal via socket
  socket.emit("microTxProposed", proposal);

  toast.info(`⏳ Proposed ${amount} ETH to ${shortenAddress(receiverAddr)}`);
};





  const acceptPendingProposal = async () => {
  if (!pendingProposal) return;
  if (!window.ethereum) return alert("Please install MetaMask");

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const me = (await signer.getAddress()).toLowerCase();

  if (me !== pendingProposal.receiver.toLowerCase())
    return alert("Not the intended receiver");

  // Verify sender signature
  const recovered = ethers.utils.verifyMessage(
    ethers.utils.arrayify(pendingProposal.stateHash),
    pendingProposal.senderSig
  );

  if (recovered.toLowerCase() !== pendingProposal.sender.toLowerCase()) {
    toast.error("❌ Invalid sender signature");
    setPendingProposal(null);
    return;
  }

  // Sign as receiver
  const receiverSig = await signer.signMessage(
    ethers.utils.arrayify(pendingProposal.stateHash)
  );

  // Update balances based on sender/receiver
  const nextSenderBalance = ethers.BigNumber.from(pendingProposal.balanceSender);
  const nextReceiverBalance = ethers.BigNumber.from(pendingProposal.balanceReceiver);

  const newState = {
    balanceSender: nextSenderBalance.toString(),
    balanceReceiver: nextReceiverBalance.toString(),
    nonce: pendingProposal.nonce,
  };

  // Build transaction record
  const record = {
    contractAddress: pendingProposal.contractAddress,
    txHash: ethers.utils.keccak256(
      ethers.utils.concat([
        ethers.utils.arrayify(pendingProposal.stateHash),
        ethers.utils.toUtf8Bytes(pendingProposal.timestamp),
      ])
    ),
    sender: pendingProposal.sender,
    receiver: pendingProposal.receiver,
    sentAmount: pendingProposal.sentAmount,
    nonce: pendingProposal.nonce,
    timestamp: pendingProposal.timestamp,
    senderSig: pendingProposal.senderSig,
    receiverSig,
    balanceSender: newState.balanceSender,
    balanceReceiver: newState.balanceReceiver,
  };

  // --- Save via backend ---
  try {
    await fetch("http://localhost:5000/api/saveChannelState", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractAddress: pendingProposal.contractAddress, state: newState }),
    });

    await fetch("http://localhost:5000/api/saveTxHistory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractAddress: pendingProposal.contractAddress, history: record }),
    });
  } catch (err) {
    console.error("Failed to save channel state/history", err);
    toast.error("Failed to save microtx");
    return;
  }

  // Emit via socket
  socket.emit("microTxAccepted", record);

  setChannelState(newState);
  setPendingProposal(null);
  toast.success(`✅ MicroTx accepted: ${pendingProposal.sentAmount} ETH`);
};





  // Handle form submit: route to micro-tx instead of on-chain send
  const handleSubmit = (e) => {
    e.preventDefault();
    proposeMicroTx();
  };

  return (
    <div className="flex w-full justify-center items-center">
      <ToastContainer />
      <div className="flex mf:flex-row flex-col items-start justify-between md:p-20 py-12 px-4">
        <div className="flex flex-1 justify-start items-start flex-col mf:mr-10">
          <h1 className="text-3xl sm:text-5xl text-white text-gradient py-1">
            Send Crypto <br /> across the world
          </h1>
          <p className="text-left mt-5 text-white font-light md:w-9/12 w-11/12 text-base">
            Explore the off-chain micro-payment channel. Propose → Accept → Persist.
          </p>

          <button
            type="button"
            onClick={currentAccount ? switchWallet : connectWallet}
            className="flex flex-row justify-center items-center my-5 bg-[#2952e3] p-3 rounded-full cursor-pointer hover:bg-[#2546bd]"
          >
            <AiFillPlayCircle className="text-white mr-2" />
            <p className="text-white text-base font-semibold">
              {currentAccount ? "Switch Wallet" : "Connect Wallet"}
            </p>
          </button>

          {incomingDeployment && !(currentDeployment && currentDeployment.accepted) && (
            <div className="bg-yellow-500 text-black p-2 rounded mt-2 cursor-pointer" onClick={acceptDeployment}>
              📢 New Deployment from {shortenAddress(incomingDeployment.sender)} - Click to Accept
            </div>
          )}

          <div className="grid sm:grid-cols-3 grid-cols-2 w-full mt-10">
            <div className={`rounded-tl-2xl ${companyCommonStyles}`}>Reliability</div>
            <div className={companyCommonStyles}>Security</div>
            <div className={`sm:rounded-tr-2xl ${companyCommonStyles}`}>Ethereum</div>
            <div className={`sm:rounded-bl-2xl ${companyCommonStyles}`}>Web 3.0</div>
            <div className={companyCommonStyles}>Low Fees</div>
            <div className={`rounded-br-2xl ${companyCommonStyles}`}>Blockchain</div>
          </div>
        </div>

        <div className="flex flex-col flex-1 items-center justify-start w-full mf:mt-0 mt-10">
          <div className="p-3 flex justify-end items-start flex-col rounded-xl h-40 sm:w-72 w-full my-5 eth-card white-glassmorphism">
            <div className="flex justify-between flex-col w-full h-full">
              <div className="flex justify-between items-start">
                <div className="w-10 h-10 rounded-full border-2 border-white flex justify-center items-center">
                  <SiEthereum fontSize={21} color="#fff" />
                </div>
                <BsInfoCircle fontSize={17} color="#fff" />
              </div>
              <div>
                <p className="text-white font-light text-sm">
                  {currentAccount ? shortenAddress(currentAccount) : "Not Connected"}
                </p>
                <p className="text-white font-semibold text-lg mt-1">Ethereum</p>
              </div>
            </div>
          </div>

          <div className="p-5 sm:w-96 w-full flex flex-col justify-start items-center blue-glassmorphism">
            {/* Deploy / Accept flow */}
            {!canShowTransactionForm() ? (
              <>
                <Input placeholder="Receiver Address" name="receiver" type="text" value={deployForm.receiver} handleChange={handleDeployChange} disabled={deploying} />
                <Input placeholder="Funding Amount (ETH)" name="fundingAmount" type="number" value={deployForm.fundingAmount} handleChange={handleDeployChange} disabled={deploying} />
                <button type="button" onClick={deployContract} className="mt-4 bg-green-600 hover:bg-green-500 px-6 py-2 rounded text-white font-semibold w-full" disabled={deploying}>
                  {deploying ? "Deploying..." : "Deploy & Fund Channel"}
                </button>
              </>
            ) : (
              <>
                {/* MicroTx Form */}
                <Input placeholder="Address To (leave blank for channel counterparty)" name="addressTo" type="text" handleChange={handleChange} />
                <Input placeholder="Amount (ETH)" name="amount" type="number" handleChange={handleChange} />
                <Input placeholder="(Optional) Message" name="message" type="text" handleChange={handleChange} />
                <div className="h-[1px] w-full bg-gray-400 my-2" />
                {isLoading ? (
                  <Loader />
                ) : (
                  <button type="button" onClick={handleSubmit} className="text-white w-full mt-2 border-[1px] p-2 border-[#3d4f7c] rounded-full cursor-pointer hover:bg-[#3d4f7c]">
                    Propose Micro Payment
                  </button>
                )}

                {/* Destroy Channel Button */}
                <button type="button" onClick={destroyChannel} className="mt-4 bg-red-600 hover:bg-red-500 px-6 py-2 rounded text-white font-semibold w-full">
                  Destroy Channel
                </button>

                {/* Pending proposal controls for receiver */}
                {pendingProposal && (
                  <div className="mt-4 w-full bg-yellow-700/40 border border-yellow-600 rounded p-3 text-white text-sm">
                    <div className="font-semibold">Incoming Proposal</div>
                    <div>From: {shortenAddress(pendingProposal.sender)} → To: {shortenAddress(pendingProposal.receiver)}</div>
                    <div>Amount: {pendingProposal.sentAmount} ETH</div>
                    <div>Nonce: {pendingProposal.nonce}</div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={acceptPendingProposal} className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded">Accept & Sign</button>
                      <button onClick={() => setPendingProposal(null)} className="bg-gray-600 hover:bg-gray-500 px-4 py-1 rounded">Dismiss</button>
                    </div>
                  </div>
                )}

                {/* Channel State Summary */}
                {channelState && (
                  <div className="mt-4 w-full text-white text-xs bg-black/40 rounded p-3">
                    <div className="font-semibold mb-1">Channel State</div>
                    <p>


  Sender: {channelState.balanceSender
    ? ethers.utils.formatEther(channelState.balanceSender)
    : "0"} ETH
</p>
<p>
  Receiver: {channelState.balanceReceiver
    ? ethers.utils.formatEther(channelState.balanceReceiver)
    : "0"} ETH
</p>




                    <div>Nonce: {channelState.nonce}</div>
                  </div>
                )}

                {/* History */}
                <div className="mt-4 w-full">
                  <h2 className="text-white text-lg font-semibold mb-2">Transaction History</h2>
                  <div className="max-h-60 overflow-y-auto bg-black p-3 rounded">
                    {txHistory && txHistory.length > 0 ? (
                      txHistory.map((tx, i) => (
                        <div key={`${tx.txHash || i}`} className="text-white text-xs border-b border-gray-700 py-2">
                          <p className="font-semibold">Nonce {tx.nonce}: {tx.sentAmount || 0} ETH</p>
                          <p>
                            From {tx.sender ? shortenAddress(tx.sender) : "Unknown"} →
                            {tx.receiver ? shortenAddress(tx.receiver) : "Unknown"} |
                            Time: {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "Unknown"}
                          </p>


                          
  <p>
  Sender Balance: {tx.balanceSender ? ethers.utils.formatEther(tx.balanceSender) : 0} ETH | 
  Receiver Balance: {tx.balanceReceiver ? ethers.utils.formatEther(tx.balanceReceiver) : 0} ETH
</p>




                          <p className="truncate">TxHash: {tx.txHash || "N/A"}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 text-sm">No transactions yet.</p>
                    )}

                  </div>
                </div>
              </>
            )}


          </div>
        </div>
      </div>
    </div>
  );
}
