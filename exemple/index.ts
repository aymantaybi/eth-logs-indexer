import * as dotenv from 'dotenv';
dotenv.config();
import { AbiItem } from 'web3-utils';
import { MongoClient } from 'mongodb';
import Indexer from '../src';
import { Filter } from '../src/interfaces';
import { Log, Load, Options, Save } from '../src/interfaces';

const { HTTP_PROVIDER_HOST, MONGODB_URI } = process.env;

const host = HTTP_PROVIDER_HOST!;

const mongoClient = new MongoClient(MONGODB_URI!);

const indexerDatabase = mongoClient.db('eth-logs-indexer');

const logsCollection = indexerDatabase.collection<Log>('logs');
const filtersCollection = indexerDatabase.collection<any>('filters');
const optionsCollection = indexerDatabase.collection<{ chainId: number; options: Options }>('options');
const blockNumberCollection = indexerDatabase.collection<{ chainId: number; blockNumber: number }>('blockNumber');

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

const filters: Filter[] = [
  {
    id: '1',
    address: '0xfff9ce5f71ca6178d3beecedb61e7eff1602950e',
    jsonInterface: {
      event: eventsJsonInterfaces.OrderMatched,
      function: functionsJsonInterfaces.interactWith,
    },
  },
  {
    id: '2',
    address: '0x32950db2a7164ae833121501c797d79e7b79d74c',
    jsonInterface: {
      event: eventsJsonInterfaces.AxieBreedCountUpdated,
    },
  },
];

const save: Save = {
  async logs(logs: Log[]) {
    await logsCollection.insertMany(logs);
  },
  async filters(filters: Filter[]) {
    const chainId = indexer.chainId;
    const oldFilters = indexer.filters;
    const newFilters = filters.map((item) => ({ ...item, chainId }));
    if (oldFilters.length > newFilters.length) {
      const newFiltersIds = newFilters.map((newFilter) => newFilter.id);
      const removedFilters = oldFilters.filter((oldFilter) => !newFiltersIds.includes(oldFilter.id));
      const removedFiltersIds = removedFilters.map((removedFilter) => removedFilter.id);
      await filtersCollection.deleteMany({ id: { $in: removedFiltersIds } });
    } else if (oldFilters.length < newFilters.length) {
      const oldFiltersIds = oldFilters.map((oldFilter) => oldFilter.id);
      const addedFilters = newFilters.filter((newFilter) => !oldFiltersIds.includes(newFilter.id));
      await filtersCollection.insertMany(addedFilters);
    }
  },
  async options(options: Partial<Options>) {
    const chainId = indexer.chainId;
    await optionsCollection.updateOne(
      { chainId },
      { $set: { chainId, options: { ...indexer.options, ...options } } },
      { upsert: true },
    );
  },
  async blockNumber(blockNumber: number) {
    const chainId = indexer.chainId;
    await blockNumberCollection.updateOne({ chainId }, { $set: { chainId, blockNumber } }, { upsert: true });
  },
};

const load: Load = {
  async filters() {
    const chainId = indexer.chainId;
    const documents = await filtersCollection.find({ chainId }).toArray();
    return documents;
  },
  async options() {
    const chainId = indexer.chainId;
    const document = await optionsCollection.findOne({ chainId });
    return document?.options || indexer.options;
  },
  async blockNumber() {
    const chainId = indexer.chainId;
    const document = await blockNumberCollection.findOne({ chainId });
    return document?.blockNumber || 0;
  },
};

const indexer = new Indexer({ host, load, save });

(async () => {
  await mongoClient.connect();
  await indexer.initialize();
  await indexer.start();
})();
