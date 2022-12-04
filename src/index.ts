import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { WebsocketProvider } from 'web3-providers-ws';
import { decodeInputs, decodeLog } from 'eth-logs-decoder';
import { Filter, FormattedFilter, DecodedLog, LatestBlockNumber } from './interfaces';
import {
  formatFilters,
  getAddressAndTopicsOptions,
  sleep,
  withFields,
  getFunctionInputWithoutSelector,
  addFunctionFieldToLogObject,
  addTransactionFieldsToLogObject,
  waitForEvent,
} from './utils';
import logger from './helpers/logger';
import { executeAsync } from './helpers/asyncBatch';
import RawLog from './interfaces/RawLog';
import { EventEmitter } from 'events';

interface Constructor {
  host: string;
  save: (logs: DecodedLog[]) => Promise<void>;
  latestBlockNumber: LatestBlockNumber;
  options?: {
    delay?: number;
    maxBlocks?: number;
    confirmationBlocks?: number;
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
  } = {
    delay: 10000,
    maxBlocks: 10,
    confirmationBlocks: 12,
  };
  ignoreDelay = false;
  chainId = -1;
  private eventEmitter: EventEmitter = new EventEmitter();
  private onEnd: (() => Promise<void>) | undefined;

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
    logger.info(`Chain Id: ${this.chainId}`);
  }

  setFilters(filters: Filter[]) {
    this.filters = filters;
  }

  async main(blockNumber?: number) {
    if (!this.filters || (Array.isArray(this.filters) && !this.filters.length)) {
      logger.error('No initialized  filters !');
      return this.stop();
    }

    if (this.chainId == -1) logger.warn(`Unknown Chain Id : ${this.chainId}`);

    this.eventEmitter.emit('begin');

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
        this.eventEmitter.emit('end');
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

      for (const formattedFilter of formattedFilters) {
        const filteredPastLogs = pastLogs.filter(
          (pastLog) =>
            pastLog.address == formattedFilter.address && pastLog.topics[0] == formattedFilter.eventSignature,
        );

        if (filteredPastLogs.length == 0) continue;

        const eventJsonInterface = formattedFilter.jsonInterface.event;

        const functionJsonInterface = formattedFilter.jsonInterface.function;

        const { id: filterId } = formattedFilter;

        const filterMatchingLogs = filteredPastLogs.map((pastLog) => {
          const { transactionHash, logIndex } = pastLog;

          const baseLog = decodeLog(pastLog, [eventJsonInterface]);

          let decodedLog: DecodedLog = { ...baseLog, filterId, logIndex };

          const transaction = transactions.find((transaction) => transaction.hash == transactionHash);

          if (transaction && functionJsonInterface?.inputs) {
            const functionSignature = ABICoder.encodeFunctionSignature(functionJsonInterface);

            const functionInputWithoutSelector = getFunctionInputWithoutSelector(transaction.input);

            const inputs: any = transaction.input.startsWith(functionSignature)
              ? decodeInputs(functionInputWithoutSelector, functionJsonInterface.inputs)
              : {};

            const signature = transaction.input.startsWith(functionSignature)
              ? functionSignature
              : transaction.input.slice(0, 10);

            const name = transaction.input.startsWith(functionSignature) ? functionJsonInterface.name : null;

            decodedLog = {
              ...decodedLog,
              function: {
                signature,
                name,
                inputs,
              },
            };
          }

          if (transaction && formattedFilter.options?.include?.transaction) {
            const fields = Array.isArray(formattedFilter.options?.include?.transaction)
              ? formattedFilter.options?.include?.transaction
              : Object.keys(transaction);

            decodedLog = {
              ...decodedLog,
              transaction: withFields(transaction, fields),
            };
          }

          return decodedLog;
        });

        logs.push(...filterMatchingLogs);
      }

      if (
        logs.every(
          (log) =>
            !isNaN(log.transaction?.blockNumber as number) && !isNaN(log.transaction?.transactionIndex as number),
        )
      ) {
        logs.sort(
          (a, b) =>
            a.transaction!.blockNumber! - b.transaction!.blockNumber! ||
            a.transaction!.transactionIndex! - b.transaction!.transactionIndex! ||
            a.logIndex - b.logIndex,
        );
      }

      await this.save(logs);
      logger.info(`${logs.length} log saved`);
    }
    await this.latestBlockNumber.save(this.block.to);
    logger.info(`Last processed block number (${this.block.to}) saved`);
    this.eventEmitter.emit('end');
  }

  async start(blockNumber?: number) {
    if (this.onEnd) return false;
    this.onEnd = async () => {
      if (!this.ignoreDelay) {
        await sleep(this.options.delay);
      }
      await this.main();
    };
    this.eventEmitter.on('end', this.onEnd);
    this.main(blockNumber);
    await waitForEvent(this.eventEmitter, 'end', { timeout: 5000, condition: () => true });
    logger.info(`Indexer started !`);
    return true;
  }

  async stop() {
    if (!this.onEnd) return false;
    this.eventEmitter.removeListener('end', this.onEnd);
    await waitForEvent(this.eventEmitter, 'end', { timeout: 5000, condition: () => true });
    this.onEnd = undefined;
    logger.info(`Indexer stopped !`);
    return true;
  }

  isRunning() {
    return Boolean(this.onEnd);
  }

  status() {
    const chainId = this.chainId;
    const isRunning = this.isRunning();
    const blockNumber = this.block.from;
    const filters = this.filters?.length || 0;
    return { chainId, isRunning, blockNumber, filters };
  }

  onIterationBegin(callback: () => any) {
    this.eventEmitter.on('begin', callback);
  }

  onIterationEnd(callback: () => any) {
    this.eventEmitter.on('end', callback);
  }

  async previewLogs(filter: Filter, transactionHash: string) {
    const getTransactionReceipt = this.web3.eth.getTransactionReceipt;
    const getTransaction = this.web3.eth.getTransaction;

    const filterAddress = filter.address.toLowerCase();
    const filterEventJsonInterface = filter.jsonInterface.event;
    const filterEventSignature = ABICoder.encodeEventSignature(filterEventJsonInterface);
    const filterFunctionJsonInterface = filter.jsonInterface.function;
    const filterTransactionIncludes = filter.options?.include?.transaction;

    const functionInputsOrTransactionIncludes = filterFunctionJsonInterface?.inputs || filterTransactionIncludes;

    const transaction = functionInputsOrTransactionIncludes ? await getTransaction(transactionHash) : undefined;
    const transactionReceipt = await getTransactionReceipt(transactionHash);

    const logs = transactionReceipt.logs.filter(
      (receiptLog) =>
        receiptLog.address.toLowerCase() === filterAddress && receiptLog.topics[0] === filterEventSignature,
    );

    if (!logs.length) throw new Error('No logs in the transaction receipt with the filter event signature');

    const previews: DecodedLog[] = [];

    for (const log of logs) {
      const rawLog: RawLog = decodeLog(log, [filterEventJsonInterface]);
      const { logIndex } = log;
      const decodedLog: DecodedLog = {
        ...rawLog,
        ...addFunctionFieldToLogObject(rawLog, transaction, filterFunctionJsonInterface),
        ...addTransactionFieldsToLogObject(rawLog, transaction, filterTransactionIncludes),
        logIndex,
        filterId: '',
      };
      previews.push(decodedLog);
    }

    return previews;
  }
}

export default Indexer;

export { Filter, FormattedFilter, DecodedLog };
