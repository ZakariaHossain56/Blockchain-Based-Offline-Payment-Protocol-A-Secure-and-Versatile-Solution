import { Navbar, Footer } from "../components";
import QRCode from "react-qr-code"; // install: npm install react-qr-code
import { useState } from "react";

const Wallet = () => {
  // Example wallet data
  const [wallet] = useState({
    name: "Zakaria Hossain",
    address: "0x1234ABCD5678EFGH9012IJKL3456MNOP7890QRST",
    privateKey: "0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890",
  });

  const [showPrivateKey, setShowPrivateKey] = useState(false);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <Navbar />

      <div className="flex flex-col items-center justify-center py-16 px-4">
        <h1 className="text-4xl font-bold text-center text-blue-400 mb-10">
          My Wallet
        </h1>

        {/* Wallet Card */}
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
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Wallet;
