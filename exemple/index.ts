import * as dotenv from 'dotenv';

dotenv.config();

import { AbiItem } from 'web3-utils';
import { MongoClient } from 'mongodb';
import ABICoder from 'web3-eth-abi';
import { decodeInputs } from 'eth-logs-decoder';
import Indexer, { Filter } from '../src';
import { DecodedLog } from '../src/interfaces';
import { getFunctionInputWithoutSelector } from '../src/utils';

const { WEBSOCKET_PROVIDER_HOST, MONGODB_URI } = process.env;

const mongoClient = new MongoClient(MONGODB_URI!);

const eventsJsonInterfaces: { [eventName: string]: AbiItem } = {
  OrderMatched: {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'hash',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'maker',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'matcher',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'enum MarketOrder.OrderKind',
        name: 'kind',
        type: 'uint8',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'bidToken',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'bidPrice',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'paymentToken',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'settlePrice',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'sellerReceived',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'marketFeePercentage',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'marketFeeTaken',
        type: 'uint256',
      },
    ],
    name: 'OrderMatched',
    type: 'event',
  },
  AxieSpawn: {
    anonymous: false,
    inputs: [
      {
        internalType: 'uint256',
        indexed: true,
        name: '_axieId',
        type: 'uint256',
      },
    ],
    name: 'AxieSpawn',
    type: 'event',
  },
  AxieBreedCountUpdated: {
    anonymous: false,
    inputs: [
      {
        internalType: 'uint256',
        indexed: true,
        name: '_axieId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        indexed: true,
        name: '_breedCount',
        type: 'uint256',
      },
    ],
    name: 'AxieBreedCountUpdated',
    type: 'event',
  },
  AxieggSpawned: {
    anonymous: false,
    inputs: [
      {
        internalType: 'uint256',
        indexed: true,
        name: '_axieId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        indexed: true,
        name: '_sireId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        indexed: true,
        name: '_matronId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'birthDate',
        type: 'uint256',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'x',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'y',
            type: 'uint256',
          },
        ],
        internalType: 'struct AxieGenetics.Genes',
        name: 'sireGenes',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'x',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'y',
            type: 'uint256',
          },
        ],
        internalType: 'struct AxieGenetics.Genes',
        name: 'matronGenes',
        type: 'tuple',
      },
    ],
    name: 'AxieggSpawned',
    type: 'event',
  },
};

const functionsJsonInterfaces: { [functionName: string]: AbiItem } = {
  interactWith: {
    inputs: [
      {
        internalType: 'string',
        name: '_interface',
        type: 'string',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'interactWith',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  settleOrder: {
    inputs: [
      {
        internalType: 'uint256',
        name: '_expectedState',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_settlePrice',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: '_referralAddr',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: '_signature',
        type: 'bytes',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'maker',
            type: 'address',
          },
          {
            internalType: 'enum MarketOrder.OrderKind',
            name: 'kind',
            type: 'uint8',
          },
          {
            components: [
              {
                internalType: 'enum MarketAsset.TokenStandard',
                name: 'erc',
                type: 'uint8',
              },
              {
                internalType: 'address',
                name: 'addr',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'id',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'quantity',
                type: 'uint256',
              },
            ],
            internalType: 'struct MarketAsset.Asset[]',
            name: 'assets',
            type: 'tuple[]',
          },
          {
            internalType: 'uint256',
            name: 'expiredAt',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'paymentToken',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'startedAt',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'basePrice',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'endedAt',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'endedPrice',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'expectedState',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'nonce',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'marketFeePercentage',
            type: 'uint256',
          },
        ],
        internalType: 'struct MarketOrder.Order',
        name: '_order',
        type: 'tuple',
      },
    ],
    name: 'settleOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
};

const host = WEBSOCKET_PROVIDER_HOST!;

/*   {
    address: "0xfff9ce5f71ca6178d3beecedb61e7eff1602950e",
    jsonInterface: {
      event: OrderMatchedEventInterface,
    },
  }, 
  {
    address: '0x32950db2a7164ae833121501c797d79e7b79d74c',
    jsonInterface: {
      event: AxieggSpawnedEventInterface,
    },
  },
  {
    address: '0x32950db2a7164ae833121501c797d79e7b79d74c',
    jsonInterface: {
      event: AxieSpawnEventInterface,
    },
  },
  {
    address: '0x32950db2a7164ae833121501c797d79e7b79d74c',
    jsonInterface: {
      event: AxieBreedCountUpdatedEventInterface,
    },
  },
  */

const filters: Filter[] = [
  {
    address: '0xfff9ce5f71ca6178d3beecedb61e7eff1602950e',
    jsonInterface: {
      event: eventsJsonInterfaces.OrderMatched,
      function: functionsJsonInterfaces.interactWith,
    },
  },
  {
    tag: '#####',
    address: '0x32950db2a7164ae833121501c797d79e7b79d74c',
    jsonInterface: {
      event: eventsJsonInterfaces.AxieBreedCountUpdated,
    },
  },
];

const save = async (logs: DecodedLog[]) => {
  //console.log(JSON.stringify(logs, null, 4));
  const settleOrderFunctionSignature = ABICoder.encodeFunctionSignature(functionsJsonInterfaces.settleOrder);
  for (const log of logs) {
    if (log.function?.name == 'interactWith') {
      const { _interface, _data } = log.function?.inputs as { _interface: string; _data: string };
      if (_interface == 'ORDER_EXCHANGE' && _data.startsWith(settleOrderFunctionSignature)) {
        const functionInputWithoutSelector = getFunctionInputWithoutSelector(_data);
        const decodedInputs = decodeInputs(functionInputWithoutSelector, functionsJsonInterfaces.settleOrder.inputs!);
        //console.log(JSON.stringify(decodedInputs, null, 4));
      }
    }
  }
  await mongoClient.db('SmartLogs').collection('chainId:2020').insertMany(logs);
};

const latestBlockNumber = {
  load: async () => {
    const document = await mongoClient
      .db('SmartLogs')
      .collection('latestBlockNumber')
      .findOne({ chainId: 2020 } as { chainId: number; blockNumber: number });
    const blockNumber = document?.blockNumber ?? 0;
    return blockNumber;
  },
  save: async (blockNumber: number) => {
    await mongoClient
      .db('SmartLogs')
      .collection('latestBlockNumber')
      .updateOne({ chainId: 2020 }, { $set: { blockNumber: blockNumber } });
  },
};

const options = {
  include: {
    transaction: ['blockNumber', 'from', 'hash', 'transactionIndex'],
  },
};

const indexer = new Indexer({
  host,
  save,
  latestBlockNumber,
});

(async () => {
  await mongoClient.connect();
  await indexer.initialize(filters);

  const filter: Filter = {
    address: '0xa8754b9fa15fc18bb59458815510e40a12cd2014',
    jsonInterface: {
      event: {
        anonymous: false,
        name: 'Transfer',
        type: 'event',
        inputs: [
          {
            indexed: true,
            name: 'from',
            type: 'address',
          },
          {
            indexed: true,
            name: 'to',
            type: 'address',
          },
          {
            indexed: false,
            name: 'value',
            type: 'uint256',
          },
        ],
      },
      function: {
        anonymous: false,
        name: 'withdraw',
        type: 'function',
        inputs: [
          {
            indexed: false,
            name: '_withdrawal',
            type: 'tuple',
            components: [
              {
                name: 'owner',
                type: 'address',
              },
              {
                name: 'nonce',
                type: 'uint256',
              },
              {
                name: 'expiredAt',
                type: 'uint256',
              },
              {
                name: 'assets',
                type: 'tuple[]',
                components: [
                  {
                    name: 'erc',
                    type: 'uint8',
                  },
                  {
                    name: 'addr',
                    type: 'address',
                  },
                  {
                    name: 'id',
                    type: 'uint256',
                  },
                  {
                    name: 'quantity',
                    type: 'uint256',
                  },
                  {
                    name: 'rarity',
                    type: 'uint8',
                  },
                ],
              },
              {
                name: 'extraData',
                type: 'bytes',
              },
            ],
          },
          {
            indexed: false,
            name: '_signature',
            type: 'bytes',
          },
          {
            indexed: false,
            name: '_path',
            type: 'address[]',
          },
        ],
      },
    },
    chainId: 2020,
    options: {
      include: {
        transaction: ['hash', 'from', 'transactionIndex', 'blockNumber'],
      },
    },
  };

  const preview = await indexer.previewLogs(
    filter,
    '0xa4b9bb8eb15d2de5d3f3657703065544fc20c758f1f37d4949e4aef35908ae33',
  );

  console.log(JSON.stringify(preview, null, 4));

  //indexer.start(17610652);
})();
