import * as dotenv from "dotenv";
import Web3 from "web3";
import Indexer, { Filter } from "./src";
import { DecodedLog } from "./src/interfaces";

dotenv.config();

const { WEBSOCKET_PROVIDER_HOST } = process.env;

const OrderMatchedEventInterface = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: "bytes32",
      name: "hash",
      type: "bytes32",
    },
    {
      indexed: false,
      internalType: "address",
      name: "maker",
      type: "address",
    },
    {
      indexed: false,
      internalType: "address",
      name: "matcher",
      type: "address",
    },
    {
      indexed: false,
      internalType: "enum MarketOrder.OrderKind",
      name: "kind",
      type: "uint8",
    },
    {
      indexed: false,
      internalType: "address",
      name: "bidToken",
      type: "address",
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "bidPrice",
      type: "uint256",
    },
    {
      indexed: false,
      internalType: "address",
      name: "paymentToken",
      type: "address",
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "settlePrice",
      type: "uint256",
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "sellerReceived",
      type: "uint256",
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "marketFeePercentage",
      type: "uint256",
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "marketFeeTaken",
      type: "uint256",
    },
  ],
  name: "OrderMatched",
  type: "event",
};

const AxieSpawnEventInterface = {
  anonymous: false,
  inputs: [
    {
      internalType: "uint256",
      indexed: true,
      name: "_axieId",
      type: "uint256",
    },
  ],
  name: "AxieSpawn",
  type: "event",
};

const host = WEBSOCKET_PROVIDER_HOST!;

const filters: Filter[] = [
  {
    address: "0xfff9ce5f71ca6178d3beecedb61e7eff1602950e",
    jsonInterface: {
      event: OrderMatchedEventInterface,
    },
  },
  {
    address: "0x32950db2a7164ae833121501c797d79e7b79d74c",
    jsonInterface: {
      event: AxieSpawnEventInterface,
    },
  },
];

const save = async (logs: DecodedLog[]) => {
  //console.log(decodedLogs);
};

let currentBlockNumber = 16446435;

const latestBlockNumber = {
  load: async () => currentBlockNumber,
  save: async (blockNumber: number) => {
    currentBlockNumber = blockNumber;
  },
};

const options = {
  delay: 10000,
  maxBlocks: 10,
  confirmationBlocks: 12,
};

const indexer = new Indexer({
  host,
  filters,
  save,
  latestBlockNumber,
  options,
});

indexer.start(currentBlockNumber);
