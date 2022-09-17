import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { decodeInputs, decodeLog } from 'eth-logs-decoder';
import { Filter, FormattedFilter, DecodedLog } from './interfaces';
import { formatFilters, getAddressAndTopicsOptions, sleep, withFields, getFunctionInputWithoutSelector } from './utils';
import logger from './helpers/logger';
import { executeAsync } from './helpers/asyncBatch';
import { Transaction } from 'web3-core';

interface Constructor {
  host: string;
  filters: Filter[];
  save: (logs: DecodedLog[]) => Promise<void>;
  latestBlockNumber: LatestBlockNumber;
  options?: {
    delay?: number;
    maxBlocks?: number;
    confirmationBlocks?: number;
    include?: { transaction?: boolean | string[] };
  };
}

interface LatestBlockNumber {
  load: () => Promise<number>;
  save: (blockNumber: number) => Promise<void>;
}

class Indexer {
  websocketProvider: any;
  web3: Web3;
  filters: Filter[];
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

  constructor({ host, filters, save, latestBlockNumber, options }: Constructor) {
    this.websocketProvider = new Web3.providers.WebsocketProvider(host);
    this.web3 = new Web3(this.websocketProvider);
    this.filters = filters;
    this.save = save;
    this.latestBlockNumber = latestBlockNumber;
    this.options = { ...this.options, ...options } as any;
    this.block = {
      from: -1,
      to: -1,
    };
  }

  async main(blockNumber?: number) {
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
        )!;

        const { transactionHash } = pastLog;

        const eventJsonInterface = formattedFilter.jsonInterface.event;

        const functionJsonInterface = formattedFilter.jsonInterface.function;

        const baseLog = decodeLog(pastLog, [eventJsonInterface]);

        let log: DecodedLog = baseLog;

        const transaction: Transaction = transactions.find((transaction) => transaction.hash == transactionHash)!;

        if (functionJsonInterface?.inputs) {
          const functionSignature = ABICoder.encodeFunctionSignature(functionJsonInterface);

          const functionInputWithoutSelector = getFunctionInputWithoutSelector(transaction.input);

          const inputs: any = transaction.input.startsWith(functionSignature)
            ? decodeInputs(functionInputWithoutSelector, functionJsonInterface.inputs)
            : {};

          log = {
            ...log,
            function: {
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
    await this.main(blockNumber);
    if (!this.ignoreDelay) {
      await sleep(this.options.delay);
    }
    this.start();
  }
}

export default Indexer;

export { Filter, FormattedFilter };
