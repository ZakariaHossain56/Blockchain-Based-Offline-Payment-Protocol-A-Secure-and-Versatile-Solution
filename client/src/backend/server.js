// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const app = express();
const server = http.createServer(app);
const crypto = require("crypto");
const { send } = require("process");
const e = require("express");
const EC = require("elliptic").ec;

const ec = new EC("secp256k1");
const ALGO = "aes-256-gcm";
const IV_LEN = 12; // recommended for AES-GCM

const axios = require("axios");
const FormData = require("form-data");

const strip0x = (hex) => (hex.startsWith("0x") ? hex.slice(2) : hex);




// Socket.IO setup
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Pinata API credentials (replace with your actual keys)
const PINATA_API_KEY = "113ce3c2fd0fbc49bc96";
const PINATA_API_SECRET = "07b6c15cc1348087999c6f3cc33b02cc8707fa947b91f409c8a5edff56b601e7";

// --- File storage paths ---
const DEPLOY_FILE = path.join(__dirname, "deployments.json");
const CHANNEL_FILE = path.join(__dirname, "channelStates.json");
const TX_FILE = path.join(__dirname, "txHistory.json");
const ACCOUNTS_FILE = path.join(__dirname, "accounts.json");
const ENCRYPTED_CHANNEL_FILE = path.join(__dirname, "channelState.encrypted.json");
const DECRYPTED_CHANNEL_FILE = path.join(__dirname, "channelState.decrypted.json");
const CID_FILE = path.join(__dirname, "cid.txt");

// Initialize files if they don't exist
const initializeFiles = () => {
  if (!fs.existsSync(DEPLOY_FILE)) fs.writeFileSync(DEPLOY_FILE, '[]');
  if (!fs.existsSync(CHANNEL_FILE)) fs.writeFileSync(CHANNEL_FILE, '{}');
  if (!fs.existsSync(TX_FILE)) fs.writeFileSync(TX_FILE, '{}');
  if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '{}');
  if (!fs.existsSync(ENCRYPTED_CHANNEL_FILE)) fs.writeFileSync(ENCRYPTED_CHANNEL_FILE, '{}');
  if (!fs.existsSync(DECRYPTED_CHANNEL_FILE)) fs.writeFileSync(DECRYPTED_CHANNEL_FILE, '{}');
  
  console.log("✅ All necessary files are initialized.");
};

initializeFiles();


// --- Utility functions ---
const readJSONFile = (file) => {
  console.log(`📖 Reading JSON file: ${file}`);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️ File does not exist, returning default for ${file}`);
    return file === DEPLOY_FILE ? [] : {};
  }

  const data = fs.readFileSync(file);
  if (!data.length) {
    console.warn(`⚠️ File empty: ${file}`);
    return file === DEPLOY_FILE ? [] : {};
  }

  try {
    const parsed = JSON.parse(data);
    console.log(`✅ Successfully parsed ${file}`);
    return parsed;
  } catch (err) {
    console.error(`❌ Failed to parse ${file}:`, err);
    return file === DEPLOY_FILE ? [] : {};
  }
};



const saveJSONFile = (file, data) => {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`✅ Successfully saved to ${file}`);
  } catch (err) {
    console.error(`❌ Error saving to ${file}:`, err);
    throw err;
  }
};

// Deployments
const readDeployments = () => readJSONFile(DEPLOY_FILE);
const saveDeployments = (deployments) => saveJSONFile(DEPLOY_FILE, deployments);
const saveDeployment = (deployment) => {
  const deployments = readDeployments();
  deployments.push(deployment);
  saveDeployments(deployments);
};

// Upload JSON to Pinata
async function uploadJsonToPinata(jsonData) {
  try {
    // Convert JSON object to Buffer
    const buffer = Buffer.from(JSON.stringify(jsonData), "utf8");

    // Prepare form data
    const formData = new FormData();
    formData.append("file", buffer, { filename: "data.json" });

    // Send request to Pinata pinning API
    const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      maxBodyLength: "Infinity",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_API_SECRET,
      },
    });

    // Extract CID from response
    const cid = res.data.IpfsHash;
    console.log("✅ Uploaded to IPFS with CID:", cid);

    // Save CID to file
    fs.writeFileSync(CID_FILE, cid);
    console.log(`✅ CID saved to file: ${CID_FILE}`);

    return cid;
  } catch (err) {
    console.error("❌ Error uploading JSON to Pinata:", err);
    throw err;
  }
}


async function fetchJsonFromIPFS() {
  try {
    // Read the CID from file
    const cid = fs.readFileSync(CID_FILE, "utf8").trim();
    console.log("🔑 CID read from file:", cid);

    // Fetch file from a public IPFS gateway
    //const url = `https://ipfs.io/ipfs/${cid}`;
    // const url = `https://example-gateway.mypinata.cloud/ipfs/${cid}`;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
    const res = await axios.get(url);

    // Parse JSON data
    const jsonData = res.data;
    console.log("✅ JSON data fetched from IPFS:", jsonData);

    return jsonData;
  } catch (err) {
    console.error("❌ Error fetching JSON from IPFS:", err);
    throw err;
  }
}

//get private key for an address
function getPrivateKey(address) {
  // Normalize to lowercase for safe lookup
  const normalized = address.toLowerCase();
  console.log("Looking up private key for address:", normalized);
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  for (const acc in accounts) {
    if (acc.toLowerCase() === normalized) {
      return accounts[acc];
    }
  }
  return null; // not found
}



// Channel state
async function saveChannelState(contractAddress, state) {
  try {
    console.log(`💾 Saving channel state for ${contractAddress}...`);
    const all = readJSONFile(CHANNEL_FILE);
    console.log("📂 Current channelStates.json content:", all);

    all[contractAddress.toLowerCase()] = state;

    saveJSONFile(CHANNEL_FILE, all);
    console.log("✅ Channel state written:", all);

    
    const sender = state.sender;
    const receiver = state.receiver;
    console.log("Sender:", sender);
    console.log("Receiver:", receiver);

    const privKey1 = getPrivateKey(sender);
    const privKey2 = getPrivateKey(receiver);
    console.log("Private Key 1:", privKey1);
    console.log("Private Key 2:", privKey2);  


    const data = JSON.parse(fs.readFileSync(CHANNEL_FILE, "utf8"));
    const encrypted = encryptWithTwoPrivates(privKey1, privKey2, data);
    fs.writeFileSync("./channelState.encrypted.json", JSON.stringify(encrypted, null, 2));
    console.log("Encryption complete. Saved as channelState.encrypted.json");

    const encrypted_data = JSON.parse(fs.readFileSync(ENCRYPTED_CHANNEL_FILE, "utf8"));
    // const decrypted = decryptWithTwoPrivates(privKey1, privKey2, encrypted_data);
    // fs.writeFileSync("./channelState.decrypted.json", JSON.stringify(decrypted, null, 2));
    // console.log("Decryption complete. Saved as channelState.decrypted.json");

    await uploadJsonToPinata(encrypted_data);
    console.log("✅ Channel state saved and uploaded to IPFS.");
    const fetched_data = await fetchJsonFromIPFS();
    fs.writeFileSync("./channelState.fromIPFS.json", JSON.stringify(fetched_data, null, 2));
    console.log("✅ Fetched data from IPFS and saved as channelState.fromIPFS.json");


  } catch (err) {
    console.error(`❌ Error saving channel state for ${contractAddress}:`, err);
  }
}


const loadChannelState = (contractAddress) => {
  const all = readJSONFile(CHANNEL_FILE);
  return all[contractAddress.toLowerCase()] || null;
};

// Transaction history
const saveTxHistory = (contractAddress, record) => {
  const all = readJSONFile(TX_FILE); // read all txs by contract
  const key = contractAddress.toLowerCase();

  if (!all[key]) all[key] = []; // initialize array if not exists
  all[key].push(record);         // append the new tx

  saveJSONFile(TX_FILE, all);    // save back to file
};

const loadTxHistory = (contractAddress) => {
  const all = readJSONFile(TX_FILE);

  // Ensure we always have an object
  if (typeof all !== "object" || all === null) return [];

  const key = contractAddress.toLowerCase();

  // Return an empty array if no history exists
  if (!Array.isArray(all[key])) return [];

  return all[key];
};


// --- Socket.IO ---
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("register", (account) => {
    socket.join(account.toLowerCase());
    console.log(`Socket ${socket.id} joined room ${account}`);
  });

  // Just notify receiver via socket
socket.on("sendDeploymentRequest", (deployment) => {
  const receiver = deployment.receiver.toLowerCase();
  io.to(receiver).emit("newDeployment", deployment);
  console.log(`📢 Sender ${deployment.sender} sent deployment request to ${receiver}`);
});

//notify sender that receiver accepted deployment
socket.on("acceptDeployment", (ack) => {
  const sender = ack.sender.toLowerCase();
  io.to(sender).emit("deploymentAcknowledged", ack);
  console.log(`✅ Receiver ${ack.receiver} acknowledged deployment to sender ${sender}`);
});

socket.on("contractDeployed", (data) => {
  const receiver = data.receiver.toLowerCase();
  // send the event to the receiver only
  io.to(receiver).emit("contractDeployed", data);
  console.log(`📢 Contract deployed event sent to receiver ${receiver}`);
});


// Notify sender that receiver funded
socket.on("receiverFunded", (data) => {
  const sender = data.sender.toLowerCase();
  io.to(sender).emit("fundingComplete", data);
});







  socket.on("microTxProposed", (proposal) => {
    const receiver = proposal.receiver.toLowerCase();
    io.to(receiver).emit("microTxProposed", proposal);

    console.log(`📢 MicroTx proposed from ${proposal.sender} to ${proposal.receiver}`);
    console.log(`   Amount: ${proposal.sentAmount} ETH`);
    console.log(`   Next balances -> Sender: ${proposal.balanceSender}, Receiver: ${proposal.balanceReceiver}`);
  });


  socket.on("microTxAccepted", (txRecord) => {
    const contract = txRecord.contractAddress.toLowerCase();

    // Load existing channel state
    const state = loadChannelState(contract);
    if (!state) return;

    // Load existing tx history
    const history = loadTxHistory(contract);

    // Skip duplicate tx
    if (history.some(tx => tx.txHash === txRecord.txHash)) {
      console.log("Duplicate tx, skipping save");
      return;
    }

    // Update balances according to fixed roles
    if (txRecord.sender.toLowerCase() === state.sender) {
      // Sender initiated the microTx
      state.balanceSender = txRecord.balanceSenderWei;
      state.balanceReceiver = txRecord.balanceReceiverWei;
    } else {
      // Receiver initiated the microTx
      // Still save balances in sender/receiver order
      state.balanceSender = txRecord.balanceReceiverWei;
      state.balanceReceiver = txRecord.balanceSenderWei;
    }

    state.nonce = txRecord.nonce;

    // Persist updated channel state
    saveChannelState(contract, state);

    // Persist tx record
    saveTxHistory(contract, txRecord);

    // Emit updated tx to both parties
    io.to(state.sender).emit("microTxAccepted", txRecord);
    io.to(state.receiver).emit("microTxAccepted", txRecord);
  });



  socket.on("channelDestroyed", (contractAddress) => {
    io.emit("channelDestroyed", contractAddress); // notify all
    console.log(`Channel destroyed: ${contractAddress}`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// --- API routes ---



// Save Deployment API
app.post("/api/saveDeployment", (req, res) => {
  try {
    const deployment = req.body;
    console.log("📥 Incoming deployment payload:", deployment);

    deployment.accepted = false;

    // Save deployment
    const allDeployments = readJSONFile(DEPLOY_FILE);
    allDeployments[deployment.contractAddress.toLowerCase()] = deployment;
    saveJSONFile(DEPLOY_FILE, allDeployments);
    console.log("💾 Deployment saved to deployments.json");

    // Initialize channel state
    const sender = deployment.sender.toLowerCase();
    const receiver = deployment.receiver.toLowerCase();
    const balanceSender = ethers.parseEther(deployment.fundingAmount || "0").toString();

    const initialState = {
      sender,
      receiver,
      balanceSender,
      balanceReceiver: "0",
      nonce: 0,
    };

    const allChannelStates = readJSONFile(CHANNEL_FILE);
    allChannelStates[deployment.contractAddress.toLowerCase()] = initialState;
    saveJSONFile(CHANNEL_FILE, allChannelStates);
    console.log("✅ Initial channel state saved");

    // Initialize empty tx history
    const allTx = readJSONFile(TX_FILE);
    allTx[deployment.contractAddress.toLowerCase()] = [];
    saveJSONFile(TX_FILE, allTx);
    console.log("📜 Empty tx history initialized");

    // Emit to receiver via socket (if io is available)
    if (global.io) {
      io.to(receiver).emit("newDeployment", deployment);
      console.log(`📢 Emitted newDeployment event to receiver ${receiver}`);
    }

    return res.json({ success: true, deployment, initialState });
  } catch (err) {
    console.error("❌ Error in /api/saveDeployment:", err);
    return res.status(500).json({ error: "Failed to save deployment" });
  }
});


// Update Channel State API
app.post("/api/updateChannelState", (req, res) => {
  try {
    const { contractAddress, sender, receiver, balanceSender, balanceReceiver, nonce } = req.body;

    if (!contractAddress) {
      return res.status(400).json({ error: "contractAddress required" });
    }

    const allChannelStates = readJSONFile(CHANNEL_FILE);

    const key = contractAddress.toLowerCase();

    // If already exists → update, else → add new
    allChannelStates[key] = {
      sender: sender || allChannelStates[key]?.sender || "",
      receiver: receiver || allChannelStates[key]?.receiver || "",
      balanceSender: balanceSender
        ? ethers.parseEther(balanceSender.toString()).toString()
        : allChannelStates[key]?.balanceSender || "0",
      balanceReceiver: balanceReceiver
        ? ethers.parseEther(balanceReceiver.toString()).toString()
        : allChannelStates[key]?.balanceReceiver || "0",
      nonce: nonce !== undefined ? nonce : allChannelStates[key]?.nonce || 0,
    };

    saveJSONFile(CHANNEL_FILE, allChannelStates);
    console.log(`✅ Channel state saved/updated for ${key}`);

    return res.json({
      success: true,
      channelState: allChannelStates[key],
    });
  } catch (err) {
    console.error("❌ Error in /api/updateChannelState:", err);
    return res.status(500).json({ error: "Failed to update channel state" });
  }
});


// Load all channel states
app.get("/api/getChannelState", (req, res) => {
  try {
    const allChannelStates = readJSONFile(CHANNEL_FILE);
    return res.json(allChannelStates);
  } catch (err) {
    console.error("❌ Error in /api/getChannelStates:", err);
    return res.status(500).json({ error: "Failed to load channel states" });
  }
});

// Load a single channel state by contractAddress
app.get("/api/getChannelState/:contractAddress", (req, res) => {
  try {
    const { contractAddress } = req.params;
    const allChannelStates = readJSONFile(CHANNEL_FILE);
    const channelState = allChannelStates[contractAddress.toLowerCase()];

    if (!channelState) {
      return res.status(404).json({ error: "Channel state not found" });
    }

    return res.json(channelState);
  } catch (err) {
    console.error("❌ Error in /api/getChannelState:", err);
    return res.status(500).json({ error: "Failed to load channel state" });
  }
});





//Destroy channel and remove deployment
app.post("/api/destroyDeployment", (req, res) => {
  try {
    const { contractAddress } = req.body;
    const deployments = readDeployments();
    const newDeployments = deployments.filter(
      (d) => d.contractAddress.toLowerCase() !== contractAddress.toLowerCase()
    );
    saveDeployments(newDeployments);

    // Remove channel state
    const channels = readJSONFile(CHANNEL_FILE);
    delete channels[contractAddress.toLowerCase()];
    saveJSONFile(CHANNEL_FILE, channels);

    // Remove tx history
    const history = readJSONFile(TX_FILE);
    delete history[contractAddress.toLowerCase()];
    saveJSONFile(TX_FILE, history);

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to destroy deployment" });
  }
});





// Fetch deployments for a user
app.get("/api/deployments/:account", (req, res) => {
  const account = req.params.account.toLowerCase();
  const deployments = readDeployments().filter(
    (d) => d.sender.toLowerCase() === account || d.receiver.toLowerCase() === account
  );
  res.json(deployments);
});

// Encrypt jsonData using AES-256-GCM
function encryptWithTwoPrivates(privA, privB, jsonData) {
  // Normalize private keys
  const a = strip0x(privA);
  const b = strip0x(privB);

  // Create keypairs
  const keyA = ec.keyFromPrivate(a, "hex");
  const keyB = ec.keyFromPrivate(b, "hex");

  // Derive shared secret (ECDH)
  const shared = keyA.derive(keyB.getPublic()); // BN instance
  const sharedBuf = Buffer.from(shared.toArray("be", 32));

  // Derive AES key from shared secret
  const key = crypto.createHash("sha256").update(sharedBuf).digest();

  // Encrypt JSON data
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(jsonData), "utf8"),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: ciphertext.toString("hex")
  };
}


function decryptWithTwoPrivates(privA, privB, encryptedContent) {


  // Extract iv, tag, data
  const iv = Buffer.from(encryptedContent.iv, "hex");
  const tag = Buffer.from(encryptedContent.tag, "hex");
  const ciphertext = Buffer.from(encryptedContent.data, "hex");

  // Normalize private keys
  const a = strip0x(privA);
  const b = strip0x(privB);

  // Create keypairs
  const keyA = ec.keyFromPrivate(a, "hex");
  const keyB = ec.keyFromPrivate(b, "hex");

  // Derive shared secret (ECDH)
  const shared = keyA.derive(keyB.getPublic()); // BN instance
  const sharedBuf = Buffer.from(shared.toArray("be", 32));

  // Derive AES key from shared secret
  const key = crypto.createHash("sha256").update(sharedBuf).digest();

  // Decrypt
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const decryptedBuffer = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  // Convert back to JSON object
  const jsonData = JSON.parse(decryptedBuffer.toString("utf8"));

  return jsonData;
}

// Save / Load channel state
app.post("/api/saveChannelState", (req, res) => {
  try {
    console.log("💾 API: saveChannelState called", req.body);
    const { contractAddress, state } = req.body;
    saveChannelState(contractAddress, state);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save channel state" });
  }
});

app.get("/api/loadChannel/:contractAddress", (req, res) => {
  const state = loadChannelState(req.params.contractAddress);
  res.json(state);
});

// Save / Load tx history
app.post("/api/saveTxHistory", (req, res) => {
  try {
    console.log("📝 API: saveTxHistory called", req.body);
    const { contractAddress, history } = req.body;
    saveTxHistory(contractAddress, history);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save tx history" });
  }
});

app.get("/api/loadTx/:contractAddress", (req, res) => {
  const history = loadTxHistory(req.params.contractAddress);
  res.json(history);
});


// Fetch all transactions across all contracts
app.get("/api/loadAllTx", (req, res) => {
  try {
    const allTx = readJSONFile(TX_FILE); // get the entire txHistory.json
    let flattened = [];

    // Flatten object { contractAddress: [tx1, tx2] } into a single array
    Object.keys(allTx).forEach((contract) => {
      const txs = allTx[contract];
      if (Array.isArray(txs)) {
        flattened = flattened.concat(txs.map(tx => ({ ...tx, contractAddress: contract })));
      }
    });

    res.json(flattened);
  } catch (err) {
    console.error("❌ Error fetching all txs:", err);
    res.status(500).json({ error: "Failed to fetch all transactions" });
  }
});


// server.js (add after existing API routes)

// Fetch online transactions directly from Ganache
app.get("/api/onlineTx", async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:7545");
    const latestBlock = await provider.getBlockNumber();
    const numBlocks = 100; // last 100 blocks
    const txs = [];

    for (let i = latestBlock; i >= 0 && i > latestBlock - numBlocks; i--) {
      const block = await provider.getBlock(i); // fetch block without transactions
      const timestamp = block.timestamp * 1000;

      for (const txHash of block.transactions) {
        const tx = await provider.getTransaction(txHash); // fetch full tx details
        txs.push({
          hash: tx.hash,
          sender: tx.from,
          receiver: tx.to,
          contractAddress: tx.to,
          gasUsed: tx.gasLimit.toString(),
          sentETH: ethers.formatEther(tx.value),
          timestamp,
          minedBlock: i,
          txData: tx.data,
        });
      }
    }

    // Sort by most recent
    txs.sort((a, b) => b.minedBlock - a.minedBlock);
    res.json(txs);
  } catch (err) {
    console.error("❌ Error fetching Ganache transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions from Ganache" });
  }
});




// Finalize all channels for a given account (using JSON, no on-chain call)
app.post("/api/finalizeChannels", (req, res) => {
  try {
    const { account } = req.body;
    if (!account) return res.status(400).json({ error: "Account required" });

    const allTxs = readJSONFile(TX_FILE); // load txHistory.json
    const finalizedChannels = [];

    // Iterate over all contracts
    for (const contractAddr of Object.keys(allTxs)) {
      const txs = allTxs[contractAddr];

      // Filter txs where account is sender or receiver
      const relevantTxs = txs.filter(
        (tx) =>
          tx.sender.toLowerCase() === account.toLowerCase() ||
          tx.receiver.toLowerCase() === account.toLowerCase()
      );

      if (relevantTxs.length === 0) continue;

      // Pick the tx with the latest nonce
      const latestTx = relevantTxs.reduce((prev, curr) =>
        curr.nonce > prev.nonce ? curr : prev
        , relevantTxs[0]);

      // Prepare the finalized channel state
      finalizedChannels.push({
        contractAddress: contractAddr,
        balanceSender: latestTx.balanceSender,
        balanceReceiver: latestTx.balanceReceiver,
        nonce: latestTx.nonce,
        senderSig: latestTx.senderSig,
        receiverSig: latestTx.receiverSig,
        txHash: latestTx.txHash,
      });
    }

    return res.json({ success: true, finalizedChannels });
  } catch (err) {
    console.error("❌ Error finalizing channels:", err);
    return res.status(500).json({ error: "Failed to finalize channels", details: err.message });
  }
});




// --- Start server ---
const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
