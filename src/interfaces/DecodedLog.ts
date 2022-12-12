import { BlockTransactionString } from 'web3-eth';

interface DecodedLog {
  filterId: string;
  address: string;
  event: {
    signature: string;
    name: string | undefined;
    inputs: { [key: string]: any };
  };
  function?: {
    signature: string;
    name: string | undefined | null;
    inputs: { [key: string]: any };
  };
  transaction?: {
    hash?: string;
    nonce?: number;
    blockHash?: string;
    blockNumber?: number;
    transactionIndex?: number;
    from?: string;
    to?: string | null;
    value?: string;
    gasPrice?: string;
    maxPriorityFeePerGas?: number | string;
    maxFeePerGas?: number | string;
    gas?: number;
    input?: string;
  };
  block?: Partial<BlockTransactionString>;
  logIndex: number;
}

export default DecodedLog;
