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
import { contractABI, contractBytecode } from "../utils/constants";
import { getPrivateKey } from "../utils/accounts"; // JSON mapping address -> privateKey



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
  } = useContext(TransactionContext);



  // Deployment state
  const [deploying, setDeploying] = useState(false);

  //for sender's deployment form
  const [deployForm, setDeployForm] = useState({
    receiver: "",
    fundingAmount: "",
    duration: "",  // Only sender sets this
  });

  //for receiver's funding + duration
  const [receiverFunding, setReceiverFunding] = useState(""); // ✅ define state


  const [incomingDeployment, setIncomingDeployment] = useState(null);
  const [currentDeployment, setCurrentDeployment] = useState(null);

  const [formData, setFormData] = useState({ amount: "" });


  const [microTxAmount, setMicroTxAmount] = useState("");
  const [microTxReceiver, setMicroTxReceiver] = useState(""); // optional, defaults to other party



  // Channel state (off-chain balances + nonce)
  const [channelState, setChannelState] = useState(null);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  const [txHistory, setTxHistory] = useState([]);
  const [pendingProposal, setPendingProposal] = useState(null); // proposal awaiting receiver's action

  const partyA = useMemo(() => currentDeployment?.sender?.toLowerCase(), [currentDeployment]);
  const partyB = useMemo(() => currentDeployment?.receiver?.toLowerCase(), [currentDeployment]);
  const isPartyA = useMemo(() => currentAccount && partyA && currentAccount.toLowerCase() === partyA, [currentAccount, partyA]);
  const isPartyB = useMemo(() => currentAccount && partyB && currentAccount.toLowerCase() === partyB, [currentAccount, partyB]);

  // const storageKeys = useMemo(() => {
  //   if (!currentDeployment?.contractAddress) return null;
  //   const c = currentDeployment.contractAddress.toLowerCase();
  //   return {
  //     state: `channelState:${c}`,
  //     history: `txHistory:${c}`,
  //   };
  // }, [currentDeployment]);

  const handleDeployChange = (e, name) => {
    setDeployForm({ ...deployForm, [name]: e.target.value });
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



  //Channel proposal listener




  // --- Socket registration and listeners ---
  useEffect(() => {
    if (!currentAccount) return;
    socket.emit("register", currentAccount);

    // Receiver: incoming deployment request
    socket.on("newDeployment", (deployment) => {
      const acc = currentAccount.toLowerCase();
      if (deployment.receiver.toLowerCase() === acc) {
        setIncomingDeployment(deployment); // show UI for receiver
        toast.info(`📢 New deployment request from ${shortenAddress(deployment.sender)}`, {
          position: "top-right",
          autoClose: 5000,
        });
      }
    });


    socket.on("deploymentAcknowledged", async (ack) => {
      const acc = currentAccount.toLowerCase();
      if (ack.sender.toLowerCase() !== acc) return;

      toast.success(`✅ Receiver ${shortenAddress(ack.receiver)} acknowledged deployment`);

      // Update local state
      setCurrentDeployment({ ...ack, accepted: true });


      // Build complete deploymentData object
      const deploymentData = {
        sender: ack.sender,
        receiver: ack.receiver,
        fundingAmount: ack.fundingAmount, // fallback if not in ack
        receiverFunding: ack.receiverFunding, // fallback
        duration: ack.duration ?? 3600, // fallback
      };

      console.log("deploymentAcknowledged socket called");

      console.log("Deployment data being sent:", deploymentData);


      // Deploy the contract
      deployChannelContract(deploymentData);
    });


    // Party B: automatically fund after receiving notification
    socket.on("contractDeployed", async (data) => {
      console.log("Contract deployment socket called");

      // Only proceed if current account is the receiver
      if (data.receiver.toLowerCase() !== currentAccount.toLowerCase()) return;

      toast.info(`📢 Contract deployed by sender at ${data.contractAddress}. Funding now...`);

      try {
        // --- Find private key for receiver ---
        let receiverAddress = data.receiver;
        console.log("Receiver address:", receiverAddress);
        //let addr = "0x33195a444beb51e19ae9dbc154e8dabf46d90b97";
        //receiverAddress = "0x33195a444bEb51e19ae9dBc154E8dAbF46d90B97";
        console.log("Using receiver address:", receiverAddress);
        const privateKey = getPrivateKey(receiverAddress);
        console.log("Private key", privateKey);
        if (!privateKey) throw new Error("Receiver private key not found in accounts.json");


        // --- Connect directly to Ganache ---
        const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:7545");
        const wallet = new ethers.Wallet(privateKey, provider);

        // Check receiver balance
        const balance = await wallet.getBalance();
        console.log("Receiver balance:", ethers.utils.formatEther(balance));

        // Connect contract with wallet
        const contract = new ethers.Contract(data.contractAddress, contractABI, wallet);

        // Fund the channel
        const tx = await contract.fundReceiver({
          value: ethers.utils.parseEther(data.receiverFunding.toString()),
        });
        const receipt = await tx.wait();
        console.log("Funding transaction hash:", receipt.transactionHash);

        toast.success(`✅ You funded ${data.receiverFunding} ETH to the channel`);



        // Notify sender that funding is complete
        socket.emit("receiverFunded", {
          sender: data.sender,
          receiver: data.receiver,
          contractAddress: data.contractAddress,
          fundedAmount: data.receiverFunding,
        });

      } catch (err) {
        console.error("❌ Receiver funding failed:", err);
        toast.error("❌ Funding failed");
      }
    });





    socket.on("channelDestroyed", (contractAddress) => {
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

    // MicroTx events remain unchanged
    socket.on("microTxProposed", async (proposal) => {
      if (!currentDeployment || proposal.contractAddress?.toLowerCase() !== currentDeployment.contractAddress?.toLowerCase()) return;
      const acc = currentAccount?.toLowerCase();
      if (!acc || proposal.receiver?.toLowerCase() !== acc) return;

      setPendingProposal(proposal);
      toast.info(`💬 Incoming micro-payment of ${proposal.sentAmount} ETH from ${shortenAddress(proposal.sender)}`, { autoClose: 4000 });
    });

    socket.on("microTxAccepted", (txRecord) => {
      if (!currentDeployment || txRecord.contractAddress?.toLowerCase() !== currentDeployment.contractAddress?.toLowerCase()) return;

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
      socket.off("deploymentAcknowledged");
      socket.off("contractDeployed");
      socket.off("channelDestroyed");
      socket.off("microTxProposed");
      socket.off("microTxAccepted");
    };
  }, [currentAccount, currentDeployment]);




  // --- Fetch deployments for current account (unchanged) ---
  // useEffect(() => {
  //   if (!currentAccount) return;
  //   const fetchDeployments = async () => {
  //     try {
  //       const res = await fetch(`http://localhost:5000/api/deployments/${currentAccount}`);
  //       const data = await res.json();

  //       // Pick the last accepted deployment, or null if none
  //       const activeDeployment = data.reverse().find(d => d.accepted);
  //       if (activeDeployment) {
  //         setCurrentDeployment(activeDeployment);
  //       } else {
  //         setCurrentDeployment(null);
  //       }
  //     } catch (err) {
  //       console.error(err);
  //     }
  //   };
  //   fetchDeployments();
  // }, [currentAccount]);


  useEffect(() => {
    const loadChannelState = async () => {
      if (!currentAccount) return;

      try {
        const res = await fetch("http://localhost:5000/api/getChannelState");
        const allChannels = await res.json();

        if (!allChannels || Object.keys(allChannels).length === 0) return;

        const userAddr = currentAccount.toLowerCase();

        // Find a channel where the user is sender or receiver
        let userChannel = null;
        for (const [contractAddress, state] of Object.entries(allChannels)) {
          if (
            state.sender?.toLowerCase() === userAddr ||
            state.receiver?.toLowerCase() === userAddr
          ) {
            userChannel = { contractAddress, ...state };
            break; // just pick the first one for now
          }
        }

        if (userChannel) {
          setCurrentDeployment({
            contractAddress: userChannel.contractAddress,
            sender: userChannel.sender,
            receiver: userChannel.receiver,
            accepted: true, // ensure microtx form shows
          });

          setChannelState({
            balanceSender: userChannel.balanceSender,
            balanceReceiver: userChannel.balanceReceiver,
            nonce: userChannel.nonce,
          });
        }
      } catch (err) {
        console.error("❌ Failed to load channel state:", err);
      }
    };

    loadChannelState();
  }, [currentAccount]);




  // useEffect(() => {
  //   if (!currentDeployment?.contractAddress) return;

  //   const loadStateAndHistory = async () => {
  //     const addr = currentDeployment.contractAddress.toLowerCase();

  //     try {
  //       // Fetch channel state from backend
  //       const stateRes = await fetch(`http://localhost:5000/api/loadChannel/${addr}`);
  //       const stateData = await stateRes.json();
  //       if (stateData) {
  //         setChannelState(stateData);
  //       } else {
  //         // --- FIXED: handle funding by Party A or Party B ---
  //         const funded = ethers.utils.parseEther(currentDeployment.fundedAmount || "0").toString();
  //         const balanceA = isPartyA ? funded : "0";
  //         const balanceB = isPartyB ? funded : "0";

  //         setChannelState({
  //           balanceA,
  //           balanceB,
  //           nonce: 0,
  //         });
  //       }

  //       // Fetch tx history from backend
  //       const txRes = await fetch(`http://localhost:5000/api/loadTx/${addr}`);
  //       const txData = await txRes.json();
  //       if (txData) setTxHistory(txData);
  //       else setTxHistory([]);
  //     } catch (err) {
  //       console.error("Failed to load channel state or tx history", err);
  //       const funded = ethers.utils.parseEther(currentDeployment.fundedAmount || "0").toString();
  //       const balanceA = isPartyA ? funded : "0";
  //       const balanceB = isPartyB ? funded : "0";

  //       setChannelState({
  //         balanceA,
  //         balanceB,
  //         nonce: 0,
  //       });
  //       setTxHistory([]);
  //     }
  //   };

  //   loadStateAndHistory();
  // }, [currentDeployment, isPartyA, isPartyB]);







  //sender sends deployment request
  const sendDeploymentRequest = async () => {
    if (!deployForm.receiver || !deployForm.fundingAmount || !deployForm.duration) {
      toast.error("Please fill all deployment fields");
      return;
    }

    const contractId = ethers.utils.hexlify(ethers.utils.randomBytes(20)); // temp ID for frontend

    const deployment = {
      sender: currentAccount,
      receiver: deployForm.receiver,
      fundingAmount: deployForm.fundingAmount,
      duration: deployForm.duration,
      contractAddress: contractId,
    };

    // Emit to backend socket
    socket.emit("sendDeploymentRequest", deployment);
    toast.info("📤 Deployment request sent. Waiting for receiver acknowledgement.");
  };

  // Receiver accepts deployment (sends ack back)
  const acceptDeploymentAck = () => {
    if (!incomingDeployment || !receiverFunding || Number(receiverFunding) <= 0) {
      toast.error("Enter a valid funding amount");
      return;
    }

    const ack = {
      sender: incomingDeployment.sender,
      receiver: currentAccount,
      receiverFunding: receiverFunding,
      fundingAmount: incomingDeployment.fundingAmount,
      duration: incomingDeployment.duration,
      contractAddress: incomingDeployment.contractAddress,
    };

    // Emit acknowledgement to backend
    socket.emit("acceptDeployment", ack);

    // Update current deployment and mark as accepted
    setCurrentDeployment({
      ...incomingDeployment,
      accepted: true, // <-- This enables microtransaction form
    });

    // Clear receiver UI
    setIncomingDeployment(null);
    setReceiverFunding("");
    toast.success("✅ Deployment acknowledged. You can now send microtransactions.");
  };



  //actual contract deployment function
  // Party A: deploy and notify Party B
  const deployChannelContract = async (deploymentData) => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const factory = new ethers.ContractFactory(contractABI, contractBytecode, signer);

      const network = await provider.getNetwork();
      console.log("Connected network:", network);

      console.log("Checking sender balance...");
      const balanceWei = await provider.getBalance(deploymentData.sender);
      // Convert to ETH
      const balanceEth = ethers.utils.formatEther(balanceWei);
      console.log(`Account ${deploymentData.sender} balance: ${balanceEth} ETH`);

      // Deploy contract with sender funding
      const contract = await factory.deploy(
        deploymentData.receiver,                  // _partyB
        deploymentData.duration,                  // _duration
        {
          value: ethers.utils.parseEther(deploymentData.fundingAmount.toString()),
        }
      );

      await contract.deployed();

      toast.success(`✅ Channel deployed at ${contract.address}`);

      console.log("deployChannelContract called with data:");
      console.log("Sender : ", deploymentData.sender);
      console.log("Receiver : ", deploymentData.receiver);

      // Save initial state to backend
      await fetch("http://localhost:5000/api/updateChannelState", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: contract.address,
          sender: deploymentData.sender,
          receiver: deploymentData.receiver,
          balanceSender: deploymentData.fundingAmount,
          balanceReceiver: deploymentData.receiverFunding,
          nonce: 0,
        }),
      });

      // Notify Party B via socket
      socket.emit("contractDeployed", {
        sender: deploymentData.sender,
        receiver: deploymentData.receiver,
        contractAddress: contract.address,
        receiverFunding: deploymentData.receiverFunding,
      });

      return contract.address;
    } catch (err) {
      console.error("❌ Deployment failed:", err);
      toast.error("❌ Deployment failed");
    }
  };





  // const acceptDeployment = (receiverFundingAmount) => {
  //   if (!incomingDeployment) return;
  //   if (!receiverFundingAmount || Number(receiverFundingAmount) <= 0) {
  //     toast.error("Enter a valid funding amount");
  //     return;
  //   }

  //   const ack = {
  //     sender: incomingDeployment.sender,
  //     receiver: currentAccount,
  //     receiverFunding: receiverFundingAmount,
  //     contractAddress: incomingDeployment.contractAddress,
  //     duration: incomingDeployment.duration,
  //     fundingAmount: incomingDeployment.fundingAmount,
  //   };

  //   // Send acknowledgement to sender
  //   socket.emit("acceptDeployment", ack);

  //   // Clear UI locally
  //   setIncomingDeployment(null);
  //   setReceiverFunding("");
  //   toast.success("✅ Deployment acknowledged. Waiting for sender to deploy.");
  // };




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

  const amountWei = ethers.utils.parseEther(amount);

  // Get current balances
  let currentSenderBalance = ethers.BigNumber.from(channelState.balanceSender);
  let currentReceiverBalance = ethers.BigNumber.from(channelState.balanceReceiver);

  // Determine who is Party A and Party B
  const isSenderPartyA = currentDeployment.sender.toLowerCase() === senderAddr;

  // Compute next balances without swapping incorrectly
  let nextSenderBalance = isSenderPartyA
    ? currentSenderBalance.sub(amountWei)
    : currentSenderBalance.add(amountWei);

  let nextReceiverBalance = isSenderPartyA
    ? currentReceiverBalance.add(amountWei)
    : currentReceiverBalance.sub(amountWei);

  if (nextSenderBalance.lt(0) || nextReceiverBalance.lt(0))
    return alert("Insufficient balance");

  const nextNonce = channelState.nonce + 1;

  // Generate state hash for signature
  const stateHash = ethers.utils.solidityKeccak256(
    ["uint256", "uint256", "uint256", "address"],
    [nextSenderBalance.toString(), nextReceiverBalance.toString(), nextNonce, currentDeployment.contractAddress]
  );

  const senderSig = await signer.signMessage(ethers.utils.arrayify(stateHash));

  const receiverAddr =
    currentDeployment.sender.toLowerCase() === senderAddr
      ? currentDeployment.receiver
      : currentDeployment.sender;

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

  // Update balances locally
  setChannelState({
    balanceSender: nextSenderBalance.toString(),
    balanceReceiver: nextReceiverBalance.toString(),
    nonce: nextNonce,
  });

  // Emit via socket
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
      sender: pendingProposal.sender,
      receiver: pendingProposal.receiver,
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

    console.log("MicroTx record:", record);

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

  const handleFormChange = (e, name) => {
    const { value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };








  return (
    <div className="flex w-full justify-center items-center">
      <ToastContainer />
      <div className="flex mf:flex-row flex-col items-start justify-between md:p-20 py-12 px-4">
        {/* Left Section */}
        <div className="flex flex-1 justify-start items-start flex-col mf:mr-10">
          <h1 className="text-3xl sm:text-5xl text-white text-gradient py-1">
            Send Crypto <br /> across the world
          </h1>
          <p className="text-left mt-5 text-white font-light md:w-9/12 w-11/12 text-base">
            Explore the off-chain micro-payment channel. Propose → Accept → Persist.
          </p>

          {/* Wallet Connect */}
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

          {/* Incoming Deployment */}
          {incomingDeployment && !currentDeployment && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-5 max-w-md mx-auto shadow-lg text-white">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                📢 Incoming Channel Request
              </h3>
              <div className="space-y-2 mb-4">
                <p><span className="font-semibold">From:</span> {shortenAddress(incomingDeployment.sender)}</p>
                <p><span className="font-semibold">Funding Amount (Sender):</span> {incomingDeployment.fundingAmount} ETH</p>
                <p><span className="font-semibold">Duration:</span> {incomingDeployment.duration} seconds</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Your Funding Amount (ETH)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 0.5"
                  value={receiverFunding}
                  onChange={(e) => setReceiverFunding(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-4 justify-end">
                <button
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md font-semibold transition"
                  onClick={acceptDeploymentAck}
                >
                  Accept & Send Ack
                </button>
                <button
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-md font-semibold transition"
                  onClick={() => setIncomingDeployment(null)}
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Features Grid */}
          <div className="grid sm:grid-cols-3 grid-cols-2 w-full mt-10">
            <div className={`rounded-tl-2xl ${companyCommonStyles}`}>Reliability</div>
            <div className={companyCommonStyles}>Security</div>
            <div className={`sm:rounded-tr-2xl ${companyCommonStyles}`}>Ethereum</div>
            <div className={`sm:rounded-bl-2xl ${companyCommonStyles}`}>Web 3.0</div>
            <div className={companyCommonStyles}>Low Fees</div>
            <div className={`rounded-br-2xl ${companyCommonStyles}`}>Blockchain</div>
          </div>
        </div>

        {/* Right Section */}
        <div className="flex flex-col flex-1 items-center justify-start w-full mf:mt-0 mt-10">
          {/* Ethereum Card */}
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

          {/* Deploy / MicroTx Section */}
          <div className="p-5 sm:w-96 w-full flex flex-col justify-start items-center blue-glassmorphism">
            {!currentDeployment ? (
              <>
                <Input
                  placeholder="Receiver Address"
                  name="receiver"
                  type="text"
                  value={deployForm.receiver}
                  handleChange={handleDeployChange}
                  disabled={deploying}
                />
                <Input
                  placeholder="Funding Amount (ETH)"
                  name="fundingAmount"
                  type="number"
                  value={deployForm.fundingAmount}
                  handleChange={handleDeployChange}
                  disabled={deploying}
                />
                <Input
                  placeholder="Channel Duration (seconds)"
                  name="duration"
                  type="number"
                  value={deployForm.duration || ""}
                  handleChange={handleDeployChange}
                  disabled={deploying}
                />
                <button
                  type="button"
                  onClick={sendDeploymentRequest}
                  className="mt-4 bg-green-600 hover:bg-green-500 px-6 py-2 rounded text-white font-semibold w-full"
                  disabled={deploying}
                >
                  {deploying ? "Deploying..." : "Deploy & Fund Channel"}
                </button>
              </>
            ) : (
              <>
                {/* Channel State */}
                {/* {channelState && (
                  <div className="w-full bg-gray-800 p-3 rounded mb-4 text-white">
                    <p><span className="font-semibold">Nonce:</span> {channelState.nonce}</p>
                    <p><span className="font-semibold">Party A Balance:</span> {channelState.balanceSender} ETH</p>
                    <p><span className="font-semibold">Party B Balance:</span> {channelState.balanceReceiver} ETH</p>
                  </div>
                )} */}

                {/* Microtransaction Form */}
                {currentDeployment && channelState && (
                  <div className="p-5 sm:w-96 w-full flex flex-col justify-start items-center blue-glassmorphism">
                    <form onSubmit={handleSubmit}>
                      <Input
                        placeholder="Amount (ETH)"
                        name="amount"
                        type="number"
                        step="0.0001"
                        value={formData.amount || ""}
                        handleChange={handleFormChange} // updates formData
                      />
                      <button
                        type="submit" // no onClick needed
                        className="mt-4 bg-green-600 hover:bg-green-500 px-6 py-2 rounded text-white font-semibold w-full"
                      >
                        Send MicroTx
                      </button>
                    </form>
                    <div className="mt-3 text-white">
                      <p>
                        Sender Balance:{" "}
                        {channelState?.balanceSender
                          ? ethers.utils.formatEther(channelState.balanceSender.toString())
                          : "0"}{" "}
                        ETH
                      </p>
                      <p>
                        Receiver Balance:{" "}
                        {channelState?.balanceReceiver
                          ? ethers.utils.formatEther(channelState.balanceReceiver.toString())
                          : "0"}{" "}
                        ETH
                      </p>
                      <p>Nonce: {channelState.nonce}</p>
                    </div>
                  </div>
                )}


                {/* Pending Proposal */}
                {pendingProposal && currentAccount?.toLowerCase() === pendingProposal.receiver.toLowerCase() && (
                  <div className="mt-4 w-full bg-gray-900 p-3 rounded text-white">
                    <p className="mb-2">Incoming MicroTx Proposal: {pendingProposal.sentAmount} ETH from {shortenAddress(pendingProposal.sender)}</p>
                    <div className="flex gap-4">
                      <button
                        className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded text-white font-semibold"
                        onClick={acceptPendingProposal}
                      >
                        Accept
                      </button>
                      <button
                        className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded text-white font-semibold"
                        onClick={() => setPendingProposal(null)}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

}
