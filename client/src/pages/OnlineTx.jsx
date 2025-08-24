import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

const OnlineTx = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);

  // Load connected MetaMask account
  useEffect(() => {
    const loadAccount = async () => {
      if (!window.ethereum) return console.warn("MetaMask not detected");
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const addr = await signer.getAddress();
        setAccount(addr.toLowerCase());
      } catch (err) {
        console.error("Failed to get connected account:", err);
      }
    };
    loadAccount();
  }, []);

  // Fetch all online transactions
  useEffect(() => {
    if (!account) return;

    const fetchTransactions = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/onlineTx");
        const data = await res.json();

        const formatted = data.map(tx => ({
          ...tx,
          sentETH: parseFloat(tx.sentETH).toFixed(6) + " ETH",
          timestamp: new Date(tx.timestamp),
          isSender: tx.sender?.toLowerCase() === account,
          isReceiver: tx.receiver?.toLowerCase() === account,
        }));

        setTransactions(formatted);
      } catch (err) {
        console.error("Failed to fetch online transactions:", err);
        setTransactions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [account]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex-grow container mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-center mb-10">Online Transactions</h1>

        {loading ? (
          <p className="text-center text-gray-400">Loading...</p>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400">No transactions found.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {transactions.map(tx => (
              <Link
                to={`/online-tx/${tx.hash}`}
                state={{ tx }}
                key={tx.hash}
                className="block bg-gray-800 p-6 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transform transition duration-300"
              >
                <h2 className="text-xl font-semibold mb-3 text-indigo-400">
                  Tx Hash: {tx.hash.slice(0, 12)}...
                </h2>
                <p>
                  <span className="font-medium">Sender:</span>{" "}
                  <span className="text-gray-300">{tx.sender?.slice(0, 10)}...</span>
                  {tx.isSender && <span className="ml-2 text-green-400">(You)</span>}
                </p>
                <p>
                  <span className="font-medium">Receiver:</span>{" "}
                  <span className="text-gray-300">{tx.receiver?.slice(0, 10) ?? 'Contract'}...</span>
                  {tx.isReceiver && <span className="ml-2 text-blue-400">(You)</span>}
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Time: {tx.timestamp.toLocaleString("en-US", { hour12: true })}
                </p>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-green-400">Gas: {tx.gasUsed}</span>
                  <span className="text-blue-400">ETH: {tx.sentETH}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">
                  Block: {tx.minedBlock}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
};

export default OnlineTx;
