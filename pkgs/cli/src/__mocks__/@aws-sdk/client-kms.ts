// Mock for @aws-sdk/client-kms
const mockSend = jest.fn();

export const KMSClient = jest.fn().mockImplementation(() => ({
  send: mockSend,
}));

export const DecryptCommand = jest.fn();

export const __mockSend = mockSend;
