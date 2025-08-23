import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";

const transactions = [
  {
    hash: "0xabc123456789",
    sender: "0xSender1",
    receiver: "0xReceiver1",
    senderBalance: "3.5 ETH",
    receiverBalance: "1.2 ETH",
    nonce: 1,
    senderSignature: "0xsigSender1",
    receiverSignature: "0xsigReceiver1",
    timestamp: "2021-12-21T16:33:21",
  },
  {
    hash: "0xdef987654321",
    sender: "0xSender2",
    receiver: "0xReceiver2",
    senderBalance: "4.1 ETH",
    receiverBalance: "2.7 ETH",
    nonce: 2,
    senderSignature: "0xsigSender2",
    receiverSignature: "0xsigReceiver2",
    timestamp: "2021-12-22T10:15:00",
  },
  {
    hash: "0xghi456123789",
    sender: "0xSender3",
    receiver: "0xReceiver3",
    senderBalance: "6.0 ETH",
    receiverBalance: "3.4 ETH",
    nonce: 3,
    senderSignature: "0xsigSender3",
    receiverSignature: "0xsigReceiver3",
    timestamp: "2021-12-23T09:45:10",
  },
];

const OfflineTx = () => (
  <div className="min-h-screen bg-gray-900 text-white flex flex-col">
    <Navbar />
    <div className="flex-grow container mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold text-center mb-10">
        Offline Transactions
      </h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {transactions.map((tx) => (
          <Link
            to={`/offline-tx/${tx.hash}`}
            state={{ tx }}
            key={tx.hash}
            className="block bg-gray-800 p-6 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transform transition duration-300"
          >
            <h2 className="text-xl font-semibold mb-3 text-indigo-400">
              Tx Hash: {tx.hash.slice(0, 12)}...
            </h2>
            <p>
              <span className="font-medium">Sender:</span>{" "}
              <span className="text-gray-300">{tx.sender.slice(0, 10)}...</span>
            </p>
            <p>
              <span className="font-medium">Receiver:</span>{" "}
              <span className="text-gray-300">{tx.receiver.slice(0, 10)}...</span>
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Time: {new Date(tx.timestamp).toLocaleString("en-US", { hour12: true })}
            </p>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-green-400">Balance: {tx.senderBalance}</span>
              <span className="text-blue-400">Balance: {tx.receiverBalance}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
    <Footer />
  </div>
);

export default OfflineTx;
