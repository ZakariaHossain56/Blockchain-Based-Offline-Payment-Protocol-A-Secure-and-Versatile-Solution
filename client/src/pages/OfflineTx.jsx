import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { contractABI } from "../utils/constants"; // import your ABI

const OfflineTx = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [finalizing, setFinalizing] = useState(false);

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

  // Finalize all channels on-chain using MetaMask signer
  const finalizeChannels = async () => {
    if (!account || transactions.length === 0) return;
    setFinalizing(true);

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();
      const finalized = [];

      for (const tx of transactions) {
        const contract = new ethers.Contract(tx.contractAddress, contractABI, signer);

        try {
          const txResponse = await contract.submitFinalState(
            tx.balanceSender,
            tx.balanceReceiver,
            tx.nonce,
            tx.senderSig,
            tx.receiverSig
          );
          const receipt = await txResponse.wait();
          finalized.push({
            contractAddress: tx.contractAddress,
            txHash: receipt.transactionHash,
          });
        } catch (err) {
          console.error(`❌ Failed to finalize channel ${tx.contractAddress}:`, err);
        }
      }

      alert(`✅ Finalized ${finalized.length} channel(s) on-chain`);
      console.log("Finalized channels:", finalized);
    } catch (err) {
      console.error("❌ Error finalizing channels:", err);
      alert("Failed to finalize channels");
    }

    setFinalizing(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex-grow container mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-center mb-10">
          Offline Transactions
        </h1>

        <div className="text-center mb-6">
          <button
            onClick={finalizeChannels}
            disabled={finalizing || !account || transactions.length === 0}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-lg font-semibold transition disabled:opacity-50"
          >
            {finalizing ? "Finalizing..." : "Finalize Channels"}
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
