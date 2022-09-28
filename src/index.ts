import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { WebsocketProvider } from 'web3-providers-ws';
import { decodeInputs, decodeLog } from 'eth-logs-decoder';
import { Filter, FormattedFilter, DecodedLog, LatestBlockNumber } from './interfaces';
import { formatFilters, getAddressAndTopicsOptions, sleep, withFields, getFunctionInputWithoutSelector } from './utils';
import logger from './helpers/logger';
import { executeAsync } from './helpers/asyncBatch';

interface Constructor {
  host: string;
  save: (logs: DecodedLog[]) => Promise<void>;
  latestBlockNumber: LatestBlockNumber;
  options?: {
    delay?: number;
    maxBlocks?: number;
    confirmationBlocks?: number;
    include?: { transaction?: boolean | string[] };
  };
}

class Indexer {
  websocketProvider: WebsocketProvider;
  web3: Web3;
  filters: Filter[] | undefined;
  save: (logs: DecodedLog[]) => Promise<void>;
  latestBlockNumber: LatestBlockNumber;
  block: { from: number; to: number };
  options: {
    delay: number;
    maxBlocks: number;
    confirmationBlocks: number;
    include: { transaction: boolean | string[] };
  } = {
    delay: 10000,
    maxBlocks: 10,
    confirmationBlocks: 12,
    include: { transaction: false },
  };
  ignoreDelay = false;
  stopping = false;
  chainId = -1;

  constructor({ host, save, latestBlockNumber, options }: Constructor) {
    this.websocketProvider = new Web3.providers.WebsocketProvider(host);
    this.web3 = new Web3(this.websocketProvider);
    this.save = save;
    this.latestBlockNumber = latestBlockNumber;
    this.options = { ...this.options, ...options } as any;
    this.block = {
      from: -1,
      to: -1,
    };
  }

  async initialize(filters: Filter[]) {
    this.setFilters(filters);
    this.chainId = await this.web3.eth.getChainId();
    logger.info(`Chain Id : ${this.chainId}`);
  }

  setFilters(filters: Filter[]) {
    this.filters = filters;
  }

  async main(blockNumber?: number) {
    if (!this.filters || (Array.isArray(this.filters) && !this.filters.length))
      throw new Error('No initialized  filters !');
    if (this.chainId == -1) logger.warn(`Unknow Chain Id : ${this.chainId}`);

    const formattedFilters = formatFilters(this.filters);

    const { address, topics } = getAddressAndTopicsOptions(formattedFilters);

    this.ignoreDelay = false;

    if (blockNumber) {
      this.block.to = blockNumber;
      this.block.from = this.block.to - this.options.maxBlocks;
    } else {
      this.block.to = (await this.web3.eth.getBlockNumber()) - this.options.confirmationBlocks;
      this.block.from = (await this.latestBlockNumber.load()) + 1;
      if (this.block.to - this.block.from > this.options.maxBlocks) {
        logger.warn(
          `Max blocks number exceeded (${this.block.to - this.block.from} block), Iteration delay is ignored`,
        );
        this.ignoreDelay = true;
        this.block.to = this.block.from + this.options.maxBlocks;
      } else if (this.block.to - this.block.from < 0) {
        return;
      }
    }

    logger.info(`Processing logs from block ${this.block.from} to block ${this.block.to}`);

    const pastLogs = await this.web3.eth.getPastLogs({
      address,
      topics,
      fromBlock: this.block.from,
      toBlock: this.block.to,
    });

    if (pastLogs.length) {
      const getTransaction: any = this.web3.eth.getTransaction;

      const batch: any = new this.web3.BatchRequest();
      const logs: DecodedLog[] = [];

      for (const pastLog of pastLogs) {
        const { transactionHash } = pastLog;
        const test = (request: any) => request.params[0] == transactionHash;
        if (batch.requests.some(test)) continue;
        batch.add(getTransaction.request(transactionHash));
      }

      const transactions: Transaction[] = await executeAsync(batch);

      for (const pastLog of pastLogs) {
        const formattedFilter = formattedFilters.find(
          (formattedFilter) =>
            formattedFilter.address == pastLog.address && formattedFilter.eventSignature == pastLog.topics[0],
        );

        if (!formattedFilter)
          throw new Error(
            `Unable to find the corresponding filter for address ${pastLog.address} and signature ${pastLog.topics[0]}`,
          );

        const { transactionHash } = pastLog;

        const eventJsonInterface = formattedFilter.jsonInterface.event;

        const functionJsonInterface = formattedFilter.jsonInterface.function;

        const baseLog = decodeLog(pastLog, [eventJsonInterface]);

        let log: DecodedLog = baseLog;

        const transaction = transactions.find((transaction) => transaction.hash == transactionHash);

        if (!transaction) throw new Error(`Unable to find the corresponding transaction for hash ${transactionHash}`);

        if (functionJsonInterface?.inputs) {
          const functionSignature = ABICoder.encodeFunctionSignature(functionJsonInterface);

          const functionInputWithoutSelector = getFunctionInputWithoutSelector(transaction.input);

          const inputs: any = transaction.input.startsWith(functionSignature)
            ? decodeInputs(functionInputWithoutSelector, functionJsonInterface.inputs)
            : {};

          const signature = transaction.input.startsWith(functionSignature)
            ? functionSignature
            : transaction.input.slice(0, 10);

          const name = transaction.input.startsWith(functionSignature) ? functionJsonInterface.name : null;

          log = {
            ...log,
            function: {
              signature,
              name,
              inputs,
            },
          };
        }

        if (this.options.include.transaction) {
          const fields = Array.isArray(this.options.include.transaction)
            ? this.options.include.transaction
            : Object.keys(transaction);

          log = {
            ...log,
            transaction: withFields(transaction, fields),
          };
        }

        logs.push(log);
      }

      await this.save(logs);
      logger.info(`${logs.length} log saved`);
    }
    await this.latestBlockNumber.save(this.block.to);
    logger.info(`Last processed block number (${this.block.to}) saved`);
  }

  async start(blockNumber?: number) {
    if (this.stopping) {
      this.stopping = false;
      return;
    }
    await this.main(blockNumber);
    if (!this.ignoreDelay) {
      await sleep(this.options.delay);
    }
    this.start();
  }

  stop() {
    this.stopping = true;
  }
}

export default Indexer;

export { Filter, FormattedFilter, DecodedLog };
