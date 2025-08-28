import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { contractABI } from "../utils/constants"; // import your ABI
import { io } from "socket.io-client";

const OfflineTx = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [finalizing, setFinalizing] = useState(false);
  const [isSettled, setIsSettled] = useState(false);





const socket = io("http://localhost:5000"); // your backend URL

useEffect(() => {
  if (!account) return;

  // register account with backend
  socket.emit("register", account);

  // listen for settlement
  socket.on("channelSettled", (msg) => {
    console.log("🔔 Settlement message:", msg);

    alert(`✅ Channel finalized for contract ${msg.contractAddress}`);

    // update UI (optional: mark tx as settled)
    setTransactions((prev) =>
      prev.map((tx) =>
        tx.contractAddress.toLowerCase() === msg.contractAddress.toLowerCase()
          ? { ...tx, settled: true }
          : tx
      )
    );
  });

  return () => {
    socket.off("channelSettled");
  };
}, [account]);


  // Load currently connected account
  useEffect(() => {
    const loadAccount = async () => {
      if (!window.ethereum) return console.warn("MetaMask not detected");

      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const addr = await signer.getAddress();
        console.log("Connected account:", addr);
        setAccount(addr.toLowerCase());
      } catch (err) {
        console.error("Failed to get connected account:", err);
        setAccount("none");
      }
    };
    loadAccount();
  }, []);

  // Fetch all txs and filter by connected account
  useEffect(() => {
    if (!account) return;

    const fetchTxs = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/loadAllTx`);
        const data = await res.json();

        if (Array.isArray(data)) {
          const filtered = data.filter(
            (tx) =>
              tx.sender?.toLowerCase() === account ||
              tx.receiver?.toLowerCase() === account
          );
          setTransactions(filtered);
        } else {
          setTransactions([]);
        }
        setLoading(false);
      } catch (err) {
        console.error("Error fetching tx:", err);
        setTransactions([]);
        setLoading(false);
      }
    };

    fetchTxs();
  }, [account]);


  async function getBalances(provider, addrA, addrB) {
    const bA = await provider.getBalance(addrA);
    const bB = await provider.getBalance(addrB);
    return {
      balanceA: ethers.utils.formatEther(bA),
      balanceB: ethers.utils.formatEther(bB)
    };
  }



  // Finalize all channels on-chain using MetaMask signer
  async function finalizeChannels(transactions) {
    if (!window.ethereum) throw new Error("No wallet");

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const signer = provider.getSigner();

    // pick highest nonce per contract
    const byContract = {};
    for (const tx of transactions) {
      const c = tx.contractAddress.toLowerCase();
      if (!byContract[c] || Number(tx.nonce) > Number(byContract[c].nonce)) {
        byContract[c] = tx;
      }
    }

    const results = [];
    for (const contractAddress of Object.keys(byContract)) {
      const tx = byContract[contractAddress];
      const contract = new ethers.Contract(contractAddress, contractABI, signer);

      try {
        const balanceA = ethers.BigNumber.from(tx.balanceSender.toString());
        const balanceB = ethers.BigNumber.from(tx.balanceReceiver.toString());
        const nonce = ethers.BigNumber.from(tx.nonce);

        const txResponse = await contract.submitFinalState(
          balanceA,
          balanceB,
          nonce,
          tx.senderSig,
          tx.receiverSig
        );
        const receipt = await txResponse.wait();

        // balances after settlement
        const { balanceA: newA, balanceB: newB } = await getBalances(
          provider,
          tx.sender,
          tx.receiver
        );

        results.push({
          contractAddress,
          txHash: receipt.transactionHash,
          balances: { sender: newA, receiver: newB }
        });
      } catch (err) {
        console.error("❌ Failed to finalize", contractAddress, err);
      }
    }

    return results;
  }



  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex-grow container mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-center mb-10">
          Offline Transactions
        </h1>

        <div className="text-center mb-6">


          <button
  onClick={async () => {
    if (!account || transactions.length === 0 || isSettled) return;

    setFinalizing(true);
    try {
      // 👉 Use your finalizeChannels helper
      const results = await finalizeChannels(transactions);

      // notify receiver via socket
for (const result of results) {
  socketRef.current.emit("channelFinalized", {
    contractAddress: result.contractAddress,
    sender: account,
    receiver: transactions.find(
      (tx) => tx.contractAddress.toLowerCase() === result.contractAddress.toLowerCase()
    )?.receiver,
  });
}



      console.log("✅ Settlement complete", results);
      setIsSettled(true); // disable button after settlement
    } catch (err) {
      console.error("❌ Error during final settlement:", err);
    }
    setFinalizing(false);
  }}
  disabled={finalizing || !account || transactions.length === 0 || isSettled}
  className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-lg font-semibold transition disabled:opacity-50"
>
  {isSettled ? "Settled ✅" : finalizing ? "Finalizing..." : "Finalize Channels"}
</button>





        </div>

        {loading ? (
          <p className="text-center text-gray-400">Loading...</p>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400">
            No transactions found for your account.
          </p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {transactions.map((tx) => {
              const isSender = tx.sender.toLowerCase() === account;
              const isReceiver = tx.receiver.toLowerCase() === account;

              return (
                <Link
                  to={`/offline-tx/${tx.txHash}`}
                  state={{ tx }}
                  key={tx.txHash}
                  className="block bg-gray-800 p-6 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transform transition duration-300"
                >
                  <h2 className="text-xl font-semibold mb-3 text-indigo-400">
                    Tx Hash: {tx.txHash.slice(0, 12)}...
                  </h2>

                  <p>
                    <span className="font-medium">Sender:</span>{" "}
                    <span className="text-gray-300">{tx.sender.slice(0, 10)}...</span>
                    {isSender && <span className="ml-2 text-green-400">(You)</span>}
                  </p>

                  <p>
                    <span className="font-medium">Receiver:</span>{" "}
                    <span className="text-gray-300">{tx.receiver.slice(0, 10)}...</span>
                    {isReceiver && <span className="ml-2 text-blue-400">(You)</span>}
                  </p>

                  <p className="mt-2 text-sm text-gray-400">
                    Time: {new Date(tx.timestamp).toLocaleString("en-US", { hour12: true })}
                  </p>

                  <div className="mt-4 flex justify-between text-sm">
                    <span className="text-green-400">
                      Sender Bal: {ethers.utils.formatEther(tx.balanceSender)} ETH
                    </span>
                    <span className="text-blue-400">
                      Receiver Bal: {ethers.utils.formatEther(tx.balanceReceiver)} ETH
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default OfflineTx;
