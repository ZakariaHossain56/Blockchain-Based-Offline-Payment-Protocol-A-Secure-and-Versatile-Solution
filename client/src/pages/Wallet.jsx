import { Navbar, Footer } from "../components";
import QRCode from "react-qr-code";
import { useState, useEffect } from "react";

const Wallet = () => {
  const [account, setAccount] = useState("");
  const [wallet, setWallet] = useState({
    name: "",
    address: "",
    privateKey: "",
  });
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [deployments, setDeployments] = useState([]);
  const [channelStates, setChannelStates] = useState({});
  const [loading, setLoading] = useState(true);

  // Connect to MetaMask and get the selected account
  useEffect(() => {
    const connectMetaMask = async () => {
      if (!window.ethereum) {
        alert("MetaMask not detected!");
        return;
      }

      try {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        setAccount(accounts[0]);
      } catch (err) {
        console.error("Failed to connect MetaMask:", err);
      }
    };

    connectMetaMask();
  }, []);

  // Fetch wallet data from backend using the connected account
  useEffect(() => {
    if (!account) return;

    const fetchWalletData = async () => {
      try {
        // 1️⃣ Load private key from server (accounts.json)
        const resAccounts = await fetch("http://localhost:5000/api/accounts");
        const accountsData = await resAccounts.json();
        // normalize keys
        const normalizedAccounts = {};
        Object.keys(accountsData).forEach(k => {
          normalizedAccounts[k.toLowerCase()] = accountsData[k];
        });

        const privKey = normalizedAccounts[account.toLowerCase()] || "";


        setWallet({
          name: "Zakaria Hossain",
          address: account,
          privateKey: privKey,
        });

        // 2️⃣ Load deployments
        const resDeploy = await fetch(`http://localhost:5000/api/deployments/${account}`);
        const deploymentData = await resDeploy.json();
        setDeployments(deploymentData);

        // 3️⃣ Load channel states
        const resChannels = await fetch("http://localhost:5000/api/getChannelState");
        const channels = await resChannels.json();
        setChannelStates(channels);

        setLoading(false);
      } catch (err) {
        console.error("Failed to fetch wallet data:", err);
        setLoading(false);
      }
    };

    fetchWalletData();
  }, [account]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Loading wallet data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />

      <div className="flex flex-col items-center justify-center py-16 px-4 w-full">
        <h1 className="text-4xl font-bold text-center text-blue-400 mb-10">My Wallet</h1>

        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6 flex flex-col items-center">
          {/* Name */}
          <div className="w-full flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Name:</span>
            <span className="break-all">{wallet.name}</span>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center">
            <span className="font-semibold text-gray-400 mb-2">Wallet QR Code:</span>
            <div className="bg-white p-2 rounded">
              <QRCode value={wallet.address} size={128} />
            </div>
          </div>

          {/* Address */}
          <div className="w-full flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Address:</span>
            <span className="break-all">{wallet.address}</span>
          </div>

          {/* Private Key */}
          {wallet.privateKey ? (
            <div className="w-full flex flex-col">
              <div className="flex justify-between border-b border-gray-700 pb-2">
                <span className="font-semibold text-gray-400">Private Key:</span>
                <button
                  className="text-blue-400 hover:text-blue-500 font-medium"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              {showPrivateKey && (
                <span className="break-all mt-2 text-red-400 font-mono">{wallet.privateKey}</span>
              )}
            </div>
          ) : (
            <p className="text-gray-400">Private key not available for this account.</p>
          )}

          {/* Channels */}
          <div className="w-full mt-4">
            <h2 className="text-lg font-semibold mb-2 text-blue-300">Channels</h2>
            {deployments.length === 0 ? (
              <p className="text-gray-400">No active channels.</p>
            ) : (
              deployments.map((d) => {
                const state = channelStates[d.contractAddress.toLowerCase()] || {};
                return (
                  <div key={d.contractAddress} className="border border-gray-700 rounded p-3 mb-2">
                    <p className="text-gray-300">Contract: {d.contractAddress.slice(0, 12)}...</p>
                    <p className="text-gray-300">Sender Balance: {state.balanceSender || 0}</p>
                    <p className="text-gray-300">Receiver Balance: {state.balanceReceiver || 0}</p>
                    <p className="text-gray-300">Nonce: {state.nonce || 0}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Wallet;
