import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { contractABI } from "../utils/constants";

export const TransactionContext = React.createContext();

const { ethereum } = window;

export const TransactionsProvider = ({ children }) => {
  const [currentAccount, setCurrentAccount] = useState("");
  const [formData, setFormData] = useState({ addressTo: "", amount: "", keyword: "", message: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [transactionCount, setTransactionCount] = useState(localStorage.getItem("transactionCount"));
  const [transactions, setTransactions] = useState([]);
  const [deployedAddress, setDeployedAddress] = useState(""); // <-- dynamic contract address

  const handleChange = (e, name) => {
    setFormData((prevState) => ({ ...prevState, [name]: e.target.value }));
  };

  const getEthereumContract = () => {
    if (!deployedAddress) return null; // contract not deployed yet
    const provider = new ethers.providers.Web3Provider(ethereum);
    const signer = provider.getSigner();
    const transactionContract = new ethers.Contract(deployedAddress, contractABI, signer);
    return transactionContract;
  };

  const sendTransaction = async () => {
    try {
      if (!ethereum) return console.log("Ethereum is not present");
      if (!deployedAddress) return alert("Contract is not deployed yet");

      const { addressTo, amount, keyword, message } = formData;
      const transactionsContract = getEthereumContract();
      const parsedAmount = ethers.utils.parseEther(amount);

      await ethereum.request({
        method: "eth_sendTransaction",
        params: [{
          from: currentAccount,
          to: addressTo,
          gas: "0x5208", // 21000 gwei
          value: parsedAmount._hex,
        }],
      });

      const transactionHash = await transactionsContract.addToBlockchain(
        addressTo, parsedAmount, message, keyword
      );

      setIsLoading(true);
      await transactionHash.wait();
      setIsLoading(false);

      const transactionsCount = await transactionsContract.getTransactionCount();
      setTransactionCount(transactionsCount.toNumber());
    } catch (error) {
      console.log(error);
    }
  };

  const deployContract = async () => {
    try {
      if (!ethereum) return alert("Please install MetaMask");

      setIsLoading(true);

      const response = await fetch("http://localhost:5000/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      if (data.success) {
        setDeployedAddress(data.contractAddress);
        alert("Contract deployed at: " + data.contractAddress);
      } else {
        alert("Deployment failed: " + data.error);
      }

      setIsLoading(false);
    } catch (err) {
      console.log(err);
      setIsLoading(false);
    }
  };

  const connectWallet = async () => {
    try {
      if (!ethereum) return alert("Please install MetaMask");

      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (accounts.length > 0) setCurrentAccount(accounts[0]);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    const checkIfWalletIsConnect = async () => {
      try {
        if (!ethereum) return alert("Please install MetaMask");
        const accounts = await ethereum.request({ method: "eth_accounts" });
        if (accounts.length) setCurrentAccount(accounts[0]);
      } catch (err) {
        console.log(err);
      }
    };
    checkIfWalletIsConnect();
  }, []);

  return (
    <TransactionContext.Provider
      value={{
        transactionCount,
        connectWallet,
        transactions,
        currentAccount,
        isLoading,
        sendTransaction,
        handleChange,
        formData,
        deployContract,
        deployedAddress, // export this so UI can react
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};
