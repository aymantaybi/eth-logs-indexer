interface EventJsonInterface {
  anonymous: boolean;
  inputs: {
    indexed: boolean;
    internalType: string;
    name: string;
    type: string;
  }[];
  name: string;
  type: string;
};

export default EventJsonInterface;