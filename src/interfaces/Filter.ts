import { AbiItem } from 'web3-utils';

interface Filter {
  address: string;
  jsonInterface: {
    event: AbiItem;
    function?: AbiItem;
  };
}

export default Filter;
