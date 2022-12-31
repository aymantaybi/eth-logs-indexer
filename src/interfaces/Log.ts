import { BlockTransactionString } from 'web3-eth';
import { Transaction } from 'web3-core';

export interface BaseLog {
  address: string;
  event: {
    signature: string;
    name: string | undefined;
    inputs: { [key: string]: unknown };
  };
}

export interface Log extends BaseLog {
  function?: BaseLog['event'];
  transaction?: Partial<Transaction>;
  block?: Partial<BlockTransactionString>;
  filterId: string;
  logIndex: number;
}
