import { AbiItem } from 'web3-utils';

interface Filter {
  id: string;
  tag?: string;
  chainId?: number;
  address: string;
  jsonInterface: {
    event: AbiItem;
    function?: AbiItem;
  };
  options?: {
    include?: {
      transaction?: boolean | string[];
    };
  };
}

export default Filter;
