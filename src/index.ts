import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { HttpProvider } from 'web3-providers-http';
import { decodeInputs, decodeLog } from 'eth-logs-decoder';
import { Filter, FormattedFilter, DecodedLog, Save, Load, Options } from './interfaces';
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
  save: Save;
  load: Load;
  filters?: Filter[];
  options?: Partial<Options>;
}

const defaultIndexerOptions = {
  delay: 10000,
  maxBlocks: 10,
  confirmationBlocks: 12,
};

class Indexer {
  httpProvider: HttpProvider;
  web3: Web3;
  filters: Filter[];
  save: Save;
  load: Load;
  block: { from: number; to: number };
  options: Options = defaultIndexerOptions;
  ignoreDelay = false;
  chainId = -1;
  private eventEmitter: EventEmitter = new EventEmitter();
  private onEnd: (() => Promise<void>) | undefined;

  constructor({ host, save, load, filters = [], options = {} }: Constructor) {
    this.httpProvider = new Web3.providers.HttpProvider(host) as HttpProvider;
    this.web3 = new Web3(this.httpProvider);
    this.save = save;
    this.load = load;
    this.filters = filters;
    this.options = { ...this.options, ...options };
    this.block = {
      from: -1,
      to: -1,
    };
  }

  async initialize() {
    this.chainId = await this.web3.eth.getChainId();
    this.filters = await this.load.filters();
    this.options = await this.load.options();
    logger.info(`Chain Id: ${this.chainId}`);
    logger.info(`Loaded filters: ${this.filters.length}`);
  }

  async setFilters(filters: Filter[]) {
    await this.save.filters(filters);
    this.filters = filters;
  }

  async setOptions(options: Partial<Options>) {
    await this.save.options(options);
    this.options = { ...this.options, ...options };
  }

  async main(blockNumber?: number) {
    if (!this.filters.length) {
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
      this.block.from = (await this.load.blockNumber()) + 1;
      if (this.block.to - this.block.from > this.options.maxBlocks) {
        logger.warn(
          `Max blocks number exceeded (${this.block.to - this.block.from} block), Iteration delay is ignored`,
        );
        this.ignoreDelay = true;
        this.block.to = this.block.from + this.options.maxBlocks;
      } else if (this.block.to - this.block.from < 0) {
        this.eventEmitter.emit('end');
        logger.error(`Block number "from" ${this.block.from}  is higher than Block number "to" ${this.block.to}`);
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
      const logs: DecodedLog[] = [];

      const transactions: Transaction[] = await this.getTransactionsFromHashes(
        pastLogs.map((pastLog) => pastLog.transactionHash),
      );

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

      await this.save.logs(logs);
      logger.info(`${logs.length} log saved`);
    }
    await this.save.blockNumber(this.block.to);
    logger.info(`Last processed block number (${this.block.to}) saved`);
    this.eventEmitter.emit('end');
  }

  async getTransactionsFromHashes(hashes: string[]) {
    const getTransaction: any = this.web3.eth.getTransaction;
    const batch: any = new this.web3.BatchRequest();
    const uniqueHashes = Array.from(new Set(hashes));
    for (const transactionHash of uniqueHashes) {
      batch.add(getTransaction.request(transactionHash));
    }
    const transactions: Transaction[] = await executeAsync(batch);
    return transactions;
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
    const filters = this.filters.length || 0;
    const options = this.options;
    return { chainId, isRunning, blockNumber, filters, options };
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

export { Filter, FormattedFilter, DecodedLog, defaultIndexerOptions };
