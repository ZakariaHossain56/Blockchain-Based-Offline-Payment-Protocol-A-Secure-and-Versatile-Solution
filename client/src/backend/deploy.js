// Correct way when .env is in the same folder as deploy.js
require("dotenv").config(); // just this, no path needed

const { ethers } = require("ethers");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/deploy", async (req, res) => {
  try {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
    const wallet = new ethers.Wallet(process.env.PARTY_A_PRIVATE_KEY, provider);
    //console.log("PARTY_A_PRIVATE_KEY", process.env.PARTY_A_PRIVATE_KEY);
    //const partyA = process.env.PARTY_A_ADDRESS;

    // Load contract JSON
    const contractJson = require("../storage/BidirectionalPaymentChannel.json");
    const abi = contractJson.abi;
    //console.log("Contract ABI:", abi);
    //console.log("Contract Bytecode:", contractJson.bytecode);   
    const bytecode = contractJson.bytecode;

    // const partyB = process.env.PARTY_B_ADDRESS;
    const duration = 3600; // 1 hour timeout

    // Deploy contract
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const partyB = await wallet.getAddress();
    const contract = await factory.deploy(partyB, duration, { value: 0 });
    await contract.waitForDeployment();

    const contractAddress = await contract.getAddress();

    // Save deployment info
    const deploymentInfo = {
      network: "ganache",
      contractAddress,
      timestamp: Date.now(),
    };
    //if (!fs.existsSync("./storage")) fs.mkdirSync("./storage");
    fs.writeFileSync(`../storage/deployment-info.json`, JSON.stringify(deploymentInfo, null, 2));

    res.json({ success: true, contractAddress });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(5000, () => console.log("🚀 Backend running on http://localhost:5000"));
