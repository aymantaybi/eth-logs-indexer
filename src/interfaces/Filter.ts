import { AbiItem, AbiInput } from "web3-utils";

interface Filter {
  address: string;
  jsonInterface: {
    event: AbiItem;
  };
}

export default Filter;