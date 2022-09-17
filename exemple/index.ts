import * as dotenv from 'dotenv';
import Web3 from 'web3';
import Indexer, { Filter } from '../src';
import { DecodedLog } from '../src/interfaces';
import { AbiItem, AbiInput } from 'web3-utils';
import { getFunctionInputWithoutSelector } from '../src/utils';
import { decodeInputs } from 'eth-logs-decoder';

dotenv.config();

const { WEBSOCKET_PROVIDER_HOST } = process.env;

const OrderMatchedEventInterface: AbiItem = {
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
};

const AxieSpawnEventInterface: AbiItem = {
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
};

const AxieBreedCountUpdatedEventInterface: AbiItem = {
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
};

const AxieggSpawnedEventInterface: AbiItem = {
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
    address: '0xa8754b9fa15fc18bb59458815510e40a12cd2014',
    jsonInterface: {
      event: {
        anonymous: false,
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
        name: 'Transfer',
        type: 'event',
      },
      function: {
        constant: false,
        inputs: [
          {
            name: '_to',
            type: 'address',
          },
          {
            name: '_value',
            type: 'uint256',
          },
        ],
        name: 'transfer',
        outputs: [
          {
            name: '',
            type: 'bool',
          },
        ],
        payable: false,
        stateMutability: 'nonpayable',
        type: 'function',
      },
    },
  },
];

const save = async (logs: DecodedLog[]) => {
  const log = logs[0];
  console.log(JSON.stringify(log, null, 4));

  /* const functionInputWithoutSelector = getFunctionInputWithoutSelector(log.transaction!.input);

  const inputs = [
    {
      internalType: 'uint256',
      name: '_sireId',
      type: 'uint256',
    },
    {
      internalType: 'uint256',
      name: '_matronId',
      type: 'uint256',
    },
  ];

  console.log(decodeInputs(functionInputWithoutSelector, inputs)); */
};

let currentBlockNumber = 16446435;

const latestBlockNumber = {
  load: async () => currentBlockNumber,
  save: async (blockNumber: number) => {
    currentBlockNumber = blockNumber;
  },
};

const options = {
  include: {
    transaction: ['blockNumber', 'from', 'hash', 'transactionIndex', 'input'],
  },
};

const indexer = new Indexer({
  host,
  filters,
  save,
  latestBlockNumber,
  options,
});

indexer.start(currentBlockNumber);
