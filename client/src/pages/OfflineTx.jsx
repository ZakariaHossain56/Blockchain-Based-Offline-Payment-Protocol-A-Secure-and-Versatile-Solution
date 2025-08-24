import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ethers } from "ethers";

const OfflineTx = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);

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
        const res = await fetch(`http://localhost:5000/api/loadAllTx`); // fetch all transactions from backend
        const data = await res.json();

        if (Array.isArray(data)) {
          // Filter by sender or receiver
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

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex-grow container mx-auto px-6 py-10">
        <h1 className="text-4xl font-bold text-center mb-10">
          Offline Transactions
        </h1>

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
                  to={`/offline-tx/${tx.txHash}`} // optional: can navigate to details
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
                    <span className="text-green-400">Balance: {tx.balanceSender}</span>
                    <span className="text-blue-400">Balance: {tx.balanceReceiver}</span>
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
