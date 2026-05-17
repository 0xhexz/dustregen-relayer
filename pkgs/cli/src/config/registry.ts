function normalizeAddress(address: string): string {
  return address.replace(/^0x/i, '').toLowerCase();
}

function loadWhitelist(): Set<string> {
  const whitelisted = process.env['WHITELISTED_CONTRACTS'];
  if (whitelisted && whitelisted.trim() !== '') {
    const addresses = whitelisted
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
      .map(normalizeAddress);
    return new Set(addresses);
  }

  // Fall back to CONTRACT_ADDRESS from env
  const contractAddress = process.env['CONTRACT_ADDRESS'];
  if (contractAddress && contractAddress.trim() !== '') {
    return new Set([normalizeAddress(contractAddress.trim())]);
  }

  return new Set();
}

export const CONTRACT_WHITELIST: Set<string> = loadWhitelist();

export function isContractWhitelisted(address: string): boolean {
  // If no whitelist is configured, allow all contracts
  if (CONTRACT_WHITELIST.size === 0) {
    return true;
  }
  return CONTRACT_WHITELIST.has(normalizeAddress(address));
}
