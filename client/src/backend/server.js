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



// Socket.IO setup
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Middleware
app.use(cors());
app.use(bodyParser.json());


// --- File storage paths ---
const DEPLOY_FILE = path.join(__dirname, "deployments.json");
const CHANNEL_FILE = path.join(__dirname, "channelStates.json");
const TX_FILE = path.join(__dirname, "txHistory.json");

// Initialize files if they don't exist
const initializeFiles = () => {
  if (!fs.existsSync(DEPLOY_FILE)) fs.writeFileSync(DEPLOY_FILE, '[]');
  if (!fs.existsSync(CHANNEL_FILE)) fs.writeFileSync(CHANNEL_FILE, '{}');
  if (!fs.existsSync(TX_FILE)) fs.writeFileSync(TX_FILE, '{}');
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

// Channel state
const saveChannelState = (contractAddress, state) => {
  try {
    console.log(`💾 Saving channel state for ${contractAddress}...`);
    const all = readJSONFile(CHANNEL_FILE);
    console.log("📂 Current channelStates.json content:", all);

    all[contractAddress.toLowerCase()] = state;

    saveJSONFile(CHANNEL_FILE, all);
    console.log("✅ Channel state written:", all);
  } catch (err) {
    console.error(`❌ Error saving channel state for ${contractAddress}:`, err);
  }
};


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

// Save deployment
// Save deployment
app.post("/api/saveDeployment", (req, res) => {
  try {
    const deployment = req.body;
    console.log("📥 Incoming deployment payload:", deployment);

    deployment.accepted = false;
    saveDeployment(deployment);
    console.log("💾 Deployment saved to deploy.json");

    const sender = deployment.sender.toLowerCase();   // deployer/funder
    const receiver = deployment.receiver.toLowerCase(); // other party

    console.log("👤 Sender:", sender);
    console.log("👤 Receiver:", receiver);

    // Notify receiver about new deployment
    io.to(receiver).emit("newDeployment", deployment);
    console.log(`📢 Emitted newDeployment event to receiver ${receiver}`);

    console.log("📥 Incoming deployment payload:", deployment);
console.log("📥 fundedAmount type:", typeof deployment.fundedAmount, "value:", deployment.fundedAmount);


    // Initialize channel state with fixed roles
    const initialState = {
      sender,             // fixed sender
      receiver,           // fixed receiver
      balanceSender: ethers.parseEther(deployment.fundedAmount || "0").toString(),
      balanceReceiver: "0",
      nonce: 0,
    };

    console.log("📝 Initial channel state to save:", initialState);

    saveChannelState(deployment.contractAddress, initialState);
    console.log("✅ Channel state saved to channelStates.json");

    // Initialize empty tx history
    saveTxHistory(deployment.contractAddress, []);
    console.log("📜 Empty tx history initialized");

    return res.json({ success: true, deployment, initialState });
  } catch (err) {
    console.error("❌ Error in /api/saveDeployment:", err);
    return res.status(500).json({ error: "Failed to save deployment" });
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



// Accept deployment
app.post("/api/acceptDeployment", (req, res) => {
  try {
    const { contractAddress, receiver } = req.body;
    const deployments = readDeployments();

    const deployment = deployments.find(
      (d) =>
        d.contractAddress === contractAddress &&
        (d.receiver.toLowerCase() === receiver.toLowerCase() ||
          d.sender.toLowerCase() === receiver.toLowerCase())
    );

    if (!deployment) return res.status(404).json({ error: "Deployment not found" });

    deployment.accepted = true;
    deployment.acceptedBy = receiver;
    saveDeployments(deployments);

    io.to(deployment.sender.toLowerCase()).emit("deploymentAccepted", deployment);
    io.to(deployment.receiver.toLowerCase()).emit("deploymentAccepted", deployment);

    return res.json({ success: true, deployment });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to accept deployment" });
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

// --- Start server ---
const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
