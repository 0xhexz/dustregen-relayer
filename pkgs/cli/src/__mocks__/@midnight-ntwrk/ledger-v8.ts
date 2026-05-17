// Mock for @midnight-ntwrk/ledger-v8
export const queryLedger = jest.fn().mockResolvedValue({});

export const getCurrentBlockHeight = jest.fn().mockResolvedValue(100n);

export const compute_maximum_price_adjustment = jest.fn().mockReturnValue(2000n);
