import { Transaction } from 'web3-core';

interface DecodedLog {
  address: string;
  event: {
    signature: string;
    name: string | undefined;
    inputs: { [key: string]: number | string | object | string[] | object[] };
  };
  function?: {
    inputs: { [key: string]: number | string | object | string[] | object[] };
  };
  transaction?: { [key: string]: any };
}

export default DecodedLog;
