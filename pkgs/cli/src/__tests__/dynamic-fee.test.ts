import { computeDynamicFeeSafetyMargin } from '../fees/dynamic-fee.js';
import {
  getCurrentBlockHeight,
  compute_maximum_price_adjustment,
} from '@midnight-ntwrk/ledger-v8';

const mockGetCurrentBlockHeight = getCurrentBlockHeight as jest.MockedFunction<typeof getCurrentBlockHeight>;
const mockComputeMaxPrice = compute_maximum_price_adjustment as jest.MockedFunction<typeof compute_maximum_price_adjustment>;

describe('computeDynamicFeeSafetyMargin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch block height and compute safety margin', async () => {
    mockGetCurrentBlockHeight.mockResolvedValue(500n);
    mockComputeMaxPrice.mockReturnValue(3000n);

    const result = await computeDynamicFeeSafetyMargin('http://indexer.test');

    expect(mockGetCurrentBlockHeight).toHaveBeenCalledWith('http://indexer.test');
    expect(mockComputeMaxPrice).toHaveBeenCalledWith(500n, {
      baseVerificationBudget: 1000n,
      targetDimensionWeight: 1000n,
    });
    expect(result).toBe(3000n);
  });

  it('should return the computed value from compute_maximum_price_adjustment', async () => {
    mockGetCurrentBlockHeight.mockResolvedValue(1000n);
    mockComputeMaxPrice.mockReturnValue(5000n);

    const result = await computeDynamicFeeSafetyMargin('http://indexer.test');
    expect(result).toBe(5000n);
  });

  it('should propagate errors from getCurrentBlockHeight', async () => {
    mockGetCurrentBlockHeight.mockRejectedValue(new Error('network error'));

    await expect(
      computeDynamicFeeSafetyMargin('http://indexer.test'),
    ).rejects.toThrow('network error');
  });

  it('should propagate errors from compute_maximum_price_adjustment', async () => {
    mockGetCurrentBlockHeight.mockResolvedValue(100n);
    mockComputeMaxPrice.mockImplementation(() => {
      throw new Error('computation failed');
    });

    await expect(
      computeDynamicFeeSafetyMargin('http://indexer.test'),
    ).rejects.toThrow('computation failed');
  });
});
