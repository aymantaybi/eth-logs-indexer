import { BlockTransactionString } from 'web3-eth';
import { Transaction } from 'web3-core';

export interface RawLog {
  address: string;
  event: {
    signature: string;
    name: string | undefined;
    inputs: { [key: string]: unknown };
  };
}

export interface DecodedLog extends RawLog {
  function?: RawLog['event'];
  transaction?: Partial<Transaction>;
  block?: Partial<BlockTransactionString>;
  filterId: string;
  logIndex: number;
}
