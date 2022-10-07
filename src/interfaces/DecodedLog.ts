interface DecodedLog {
  address: string;
  logIndex: number;
  filter: {
    tag?: string;
  };
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
}

export default DecodedLog;