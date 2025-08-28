import accounts from "../backend/accounts.json";

export const getPrivateKey = (address) => {
  if (!address) throw new Error("Address is required");

  // Find the key case-insensitively
  const key = Object.keys(accounts).find(
    (addr) => addr.toLowerCase() === address.toLowerCase()
  );

  if (!key) throw new Error(`Private key not found for address ${address}`);
  return accounts[key];
};
