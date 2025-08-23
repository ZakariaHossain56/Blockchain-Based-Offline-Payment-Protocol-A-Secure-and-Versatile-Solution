import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Navbar, Footer } from "../components";

const OnlineTxDetails = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tx } = location.state || {};

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
          Online Transaction Details
        </h1>

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
            <span className="font-semibold text-gray-400">Contract:</span>
            <span className="break-all">{tx.contractAddress}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Gas Used:</span>
            <span>{tx.gasUsed}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">ETH Sent:</span>
            <span>{tx.sentETH}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Block:</span>
            <span>{tx.minedBlock}</span>
          </div>
          <div className="flex justify-between border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400">Timestamp:</span>
            <span>{new Date(tx.timestamp).toLocaleString("en-US", { hour12: true })}</span>
          </div>
          <div className="flex flex-col border-b border-gray-700 pb-2">
            <span className="font-semibold text-gray-400 mb-1">Tx Data:</span>
            <span className="break-all">{tx.txData}</span>
          </div>

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

export default OnlineTxDetails;
