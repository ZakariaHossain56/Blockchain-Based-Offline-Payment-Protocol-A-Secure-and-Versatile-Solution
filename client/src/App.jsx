// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Market from "./pages/Market";
import OfflineTx from "./pages/OfflineTx";
import OfflineTxDetails from "./pages/OfflineTxDetails";
import OnlineTx from "./pages/OnlineTx";
import OnlineTxDetails from "./pages/OnlineTxDetails";
import Wallet from "./pages/Wallet";

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/home" element={<Home />} />

      {/* Offline Transactions */}
      <Route path="/offline-tx" element={<OfflineTx />} /> 
      <Route path="/offline-tx/:hash" element={<OfflineTxDetails />} />

      {/* Online Transactions */}
      <Route path="/online-tx" element={<OnlineTx />} />
      <Route path="/online-tx/:hash" element={<OnlineTxDetails />} />

      {/* Wallet */}
      <Route path="/wallet" element={<Wallet />} />
    </Routes>
  </Router>
);

export default App;
