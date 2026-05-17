import { deserializeBalanced, serializeBalanced, BalancedTransaction } from './codec.js';

export interface SignableWallet {
  sign(tx: BalancedTransaction): Promise<BalancedTransaction>;
}

export async function signBalancedTx(
  wallet: SignableWallet,
  balancedTxHex: string,
): Promise<string> {
  const tx = deserializeBalanced(balancedTxHex);
  const signed = await wallet.sign(tx);
  return serializeBalanced(signed);
}
