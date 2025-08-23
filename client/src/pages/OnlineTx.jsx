import { Navbar, Footer } from "../components";
import { Link } from "react-router-dom";

const onlineTransactions = [
  {
    hash: "0xaaa111222333",
    sender: "0xSenderA",
    receiver: "0xReceiverA",
    contractAddress: "0xContractA",
    gasUsed: "21000",
    sentETH: "0.8 ETH",
    minedBlock: 150234,
    txData: "0xdataAAA",
    timestamp: "2021-12-21T16:33:21",
  },
  {
    hash: "0xbbb444555666",
    sender: "0xSenderB",
    receiver: "0xReceiverB",
    contractAddress: "0xContractB",
    gasUsed: "45000",
    sentETH: "1.2 ETH",
    minedBlock: 150567,
    txData: "0xdataBBB",
    timestamp: "2021-12-22T11:20:45",
  },
  {
    hash: "0xccc777888999",
    sender: "0xSenderC",
    receiver: "0xReceiverC",
    contractAddress: "0xContractC",
    gasUsed: "30000",
    sentETH: "2.0 ETH",
    minedBlock: 150890,
    txData: "0xdataCCC",
    timestamp: "2021-12-23T09:45:10",
  },
];

const OnlineTx = () => (
  <div className="min-h-screen bg-gray-900 text-white flex flex-col">
    <Navbar />
    <div className="flex-grow container mx-auto px-6 py-10">
      <h1 className="text-4xl font-bold text-center mb-10">
        Online Transactions
      </h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {onlineTransactions.map((tx) => (
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
              <span className="text-gray-300">{tx.sender.slice(0, 10)}...</span>
            </p>
            <p>
              <span className="font-medium">Receiver:</span>{" "}
              <span className="text-gray-300">{tx.receiver.slice(0, 10)}...</span>
            </p>
            <p>
              <span className="font-medium">Contract:</span>{" "}
              <span className="text-gray-300">{tx.contractAddress.slice(0, 10)}...</span>
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Time: {new Date(tx.timestamp).toLocaleString("en-US", { hour12: true })}
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
    </div>
    <Footer />
  </div>
);

export default OnlineTx;
