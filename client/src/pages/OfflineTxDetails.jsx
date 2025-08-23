import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Navbar, Footer } from "../components";

const OfflineTxDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tx } = location.state || {};

  const [coinForgery, setCoinForgery] = useState(false);
  const [doubleSpend, setDoubleSpend] = useState(false);

  if (!tx) return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="flex flex-col items-center justify-center mt-20">
        <h1 className="text-3xl font-bold mb-4">Transaction Not Found</h1>
        <button
          className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded text-white"
          onClick={() => navigate(-1)}
        >
          Go Back
        </button>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <h1 className="text-4xl font-bold mb-8 text-center text-blue-400">
          Transaction Details
        </h1>

        {/* Attack Toggles */}
        <div className="flex space-x-4 mb-6">
          <button
            className={`px-4 py-2 rounded font-semibold ${coinForgery ? "bg-red-600" : "bg-gray-700"}`}
            onClick={() => setCoinForgery(!coinForgery)}
          >
            {coinForgery ? "Disable" : "Enable"} Coin Forgery
          </button>
          <button
            className={`px-4 py-2 rounded font-semibold ${doubleSpend ? "bg-red-600" : "bg-gray-700"}`}
            onClick={() => setDoubleSpend(!doubleSpend)}
          >
            {doubleSpend ? "Disable" : "Enable"} Double Spend
          </button>
        </div>

        {/* Transaction Card */}
        <div className="bg-gray-800 rounded-xl shadow-xl p-8 max-w-2xl w-full space-y-6">
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Tx Hash:</span>
            <span className="break-all">{tx.hash}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Sender:</span>
            <span className="break-all">{tx.sender}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Receiver:</span>
            <span className="break-all">{tx.receiver}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Sender Balance:</span>
            <span>{tx.senderBalance} ETH</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Receiver Balance:</span>
            <span>{tx.receiverBalance} ETH</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Nonce:</span>
            <span>{tx.nonce}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Timestamp:</span>
            <span>{new Date(tx.timestamp).toLocaleString("en-US", { hour12: true })}</span>
          </div>
          <div className="flex flex-col border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400 mb-1">Sender Signature:</span>
            <span className="break-all">{tx.senderSignature}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-gray-400 mb-1">Receiver Signature:</span>
            <span className="break-all">{tx.receiverSignature}</span>
          </div>

          {coinForgery && (
            <button
              className="mt-6 w-full bg-red-600 hover:bg-red-500 py-2 rounded text-white font-semibold"
              onClick={() => alert("Redeem action triggered!")}
            >
              Redeem Transaction
            </button>
          )}

          <button
            className="mt-6 w-full bg-blue-600 hover:bg-blue-500 py-2 rounded text-white font-semibold"
            onClick={() => navigate(-1)}
          >
            Back to Transactions
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default OfflineTxDetails;
