import { ethers } from "ethers";
import contractABI from "../storage/BidirectionalPaymentChannel.json";

/**
 * Deploys and funds a payment channel with Party A and Party B.
 * @param {string} receiverAddress - Ethereum address of Party B
 * @param {string} amountInEth - ETH amount to fund
 * @returns deployed contract address
 */
export const createAndFundChannel = async (receiverAddress, amountInEth) => {
  if (!window.ethereum) throw new Error("MetaMask not detected");

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const factory = new ethers.ContractFactory(
    contractABI.abi,
    contractABI.bytecode,
    signer
  );

  const contract = await factory.deploy(
    await signer.getAddress(), // Party A
    receiverAddress,           // Party B
    { value: ethers.parseEther(amountInEth) }
  );

  await contract.waitForDeployment();
  return contract.target; // deployed contract address
};
