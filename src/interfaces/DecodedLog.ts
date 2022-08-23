import { Log } from "web3-core";

interface DecodedLog extends Log {
  decodedData: {
    [key: string]: any;
  };
  event: string;
};


export default DecodedLog;
