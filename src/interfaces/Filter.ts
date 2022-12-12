import { AbiItem } from 'web3-utils';

export interface Filter {
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
      block?: boolean | string[];
    };
  };
}

export interface FormattedFilter extends Filter {
  eventSignature: string;
}
