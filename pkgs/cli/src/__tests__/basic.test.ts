import { validateSponsorshipRequest } from '@dustregen/contract';

describe('DustRegen Relayer', () => {
  describe('Contract Validation', () => {
    test('validates sponsorship request correctly', () => {
      const validRequest = {
        user: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        gasAmount: 1000000n,
        userSignature: '0xsignature'
      };
      
      expect(validateSponsorshipRequest(validRequest)).toBe(true);
    });
    
    test('rejects invalid user address', () => {
      const invalidRequest = {
        user: '0x123', // Too short
        gasAmount: 1000000n,
        userSignature: '0xsignature'
      };
      
      expect(validateSponsorshipRequest(invalidRequest)).toBe(false);
    });
    
    test('rejects zero gas amount', () => {
      const invalidRequest = {
        user: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        gasAmount: 0n,
        userSignature: '0xsignature'
      };
      
      expect(validateSponsorshipRequest(invalidRequest)).toBe(false);
    });
  });
});