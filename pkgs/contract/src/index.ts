// Contract exports and utilities
export * from './DustRegenRelayer.compact';

// Contract interface types
export interface RelayerConfig {
  owner: string;
  feePercentage: number;
  isActive: boolean;
}

export interface SponsorshipRequest {
  user: string;
  gasAmount: bigint;
  userSignature: string;
}

export interface RelayerStats {
  totalSponsored: bigint;
  sponsoredCount: bigint;
  activeUsers: number;
}

// Utility functions for contract interaction
export function validateSponsorshipRequest(request: SponsorshipRequest): boolean {
  return (
    request.user.length === 64 && // 32 bytes hex
    request.gasAmount > 0n &&
    request.userSignature.length > 0
  );
}

export function calculateSponsorshipFee(amount: bigint, feePercentage: number): bigint {
  return (amount * BigInt(feePercentage)) / 100n;
}