interface FunctionJsonInterface {
  inputs: {
    internalType: string;
    name: string;
    type: string;
  }[];
  name: string;
  outputs: {
    internalType: string;
    name: string;
    type: string;
  }[];
  stateMutability: string;
  type: string;
}

export default FunctionJsonInterface;
