import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { HttpProvider } from 'web3-providers-http';
import { decodeLog } from 'eth-logs-decoder';
import EventEmitter from 'events';
import { BlockTransactionString } from 'web3-eth';
import { Filter, BaseLog, Log, Save, Load, Options, IndexerConstructor, EventsListenersArguments } from './interfaces';
import logger from './helpers/logger';
import { executeAsync } from './helpers/asyncBatch';
import {
  formatFilters,
  getAddressAndTopicsOptions,
  sleep,
  logFunctionObject,
  logTransactionObject,
  waitForEvent,
  logBlockObject,
} from './utils';

const defaultIndexerOptions = {
  delay: 10000,
  maxBlocks: 10,
  confirmationBlocks: 12,
  autoStart: false,
};

export class Indexer extends EventEmitter {
  httpProvider: HttpProvider;
  web3: Web3;
  filters: Filter[];
  save: Save;
  load: Load;
  options: Options = defaultIndexerOptions;
  chainId = 0;
  private onProcessing: ((data: EventsListenersArguments.processing) => Promise<void>) | undefined;
  private latestBlockNumber = 0;

  constructor({ host, save, load, filters = [], options = {} }: IndexerConstructor) {
    super();
    this.httpProvider = new Web3.providers.HttpProvider(host) as HttpProvider;
    this.web3 = new Web3(this.httpProvider);
    this.save = save;
    this.load = load;
    this.filters = filters;
    this.options = { ...this.options, ...options };
  }

  async initialize() {
    this.chainId = await this.web3.eth.getChainId();
    this.filters = await this.load.filters();
    this.options = await this.load.options();
    this.latestBlockNumber = await this.load.blockNumber();
    logger.info(`Chain id: ${this.chainId}`);
    logger.info(`Loaded filters: ${this.filters.length}`);
    logger.info(`Loaded latest block number: ${this.latestBlockNumber}`);
    if (this.options.autoStart) {
      this.start();
    }
  }

  async setFilters(filters: Filter[]) {
    await this.save.filters(filters);
    this.filters = filters;
  }

  async setOptions(options: Partial<Options>) {
    await this.save.options(options);
    this.options = { ...this.options, ...options };
  }

  private async process(fromBlock: number, toBlock: number) {
    if (!this.filters.length) {
      logger.error('No initialized  filters !');
      return this.stop();
    }
    if (!this.chainId) {
      logger.error(`Unknown chain id : ${this.chainId}`);
      return this.stop();
    }
    const startedAt = Date.now();
    this.emit('processing', { startedAt, fromBlock, toBlock });
    logger.info(`Processing blocks (${fromBlock}...${toBlock})`);
    const formattedFilters = formatFilters(this.filters);
    const { address, topics } = getAddressAndTopicsOptions(formattedFilters);
    const pastLogs = await this.web3.eth.getPastLogs({ address, topics, fromBlock, toBlock });
    logger.debug(JSON.stringify(pastLogs, null, 2));
    if (pastLogs.length) {
      const logs: Log[] = [];
      const transactions: Transaction[] = await this.getTransactionsFromHashes(
        pastLogs.map((pastLog) => pastLog.transactionHash),
      );
      logger.debug(JSON.stringify(transactions, null, 2));
      const blocks: BlockTransactionString[] = await this.getBlocksFromNumbers(
        pastLogs.map((pastLog) => pastLog.blockNumber),
      );
      logger.debug(JSON.stringify(blocks, null, 2));
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
          const { transactionHash, logIndex, transactionIndex, blockNumber } = pastLog;
          const baseLog = decodeLog(pastLog, [eventJsonInterface]);
          const block = blocks.find((item) => item.number == pastLog.blockNumber);
          const transaction = transactions.find((transaction) => transaction.hash == transactionHash);
          const logFunction = logFunctionObject(transaction, functionJsonInterface);
          const logBlock = logBlockObject(block, formattedFilter.options?.include?.block);
          const logTransaction = logTransactionObject(transaction, formattedFilter.options?.include?.transaction);
          const log: Log = {
            filterId,
            logIndex,
            ...baseLog,
            ...(logFunction ? { function: logFunction } : {}),
            ...(logBlock ? { block: logBlock } : {}),
            transaction: {
              ...logTransaction,
              transactionIndex,
              blockNumber,
            },
          };
          return log;
        });
        logs.push(...filterMatchingLogs);
      }
      logs.sort(
        (a, b) =>
          a.transaction.blockNumber - b.transaction.blockNumber ||
          a.transaction.transactionIndex - b.transaction.transactionIndex ||
          a.logIndex - b.logIndex,
      );
      await this.save.logs(logs);
      logger.info(`Saved logs: ${logs.length}`);
    }
    this.latestBlockNumber = toBlock;
    await this.save.blockNumber(this.latestBlockNumber);
    logger.info(`Last processed block number (${this.latestBlockNumber}) saved`);
    const endedAt = Date.now();
    this.emit('processing', { startedAt, endedAt, fromBlock, toBlock });
  }

  async start(blockNumber?: number) {
    if (this.onProcessing) return false;
    const { fromBlock, toBlock } = await this.nextProcessOptions(blockNumber);
    if (fromBlock > toBlock) {
      logger.info(`Waiting for higher block (fromBlock: ${fromBlock} > toBlock: ${toBlock})...`);
      await sleep(10000);
      return await this.start(blockNumber);
    }
    this.onProcessing = this.makeProcessingEventListener();
    this.on('processing', this.onProcessing);
    logger.info(`Indexer started !`);
    await this.process(fromBlock, toBlock);
    return true;
  }

  async stop() {
    if (!this.onProcessing) return false;
    this.removeListener('processing', this.onProcessing);
    await waitForEvent(this, 'processing', {
      timeout: 10000,
      condition: (data: EventsListenersArguments.processing) => Boolean(data.endedAt),
    });
    this.onProcessing = undefined;
    logger.info(`Indexer stopped !`);
    return true;
  }

  isRunning() {
    return Boolean(this.onProcessing);
  }

  status() {
    const chainId = this.chainId;
    const isRunning = this.isRunning();
    const blockNumber = this.latestBlockNumber;
    const filters = this.filters.length;
    const options = this.options;
    return { chainId, isRunning, blockNumber, filters, options };
  }

  async previewLogs(filter: Filter, transactionHash: string) {
    const getTransactionReceipt = this.web3.eth.getTransactionReceipt;
    const getTransaction = this.web3.eth.getTransaction;
    const getBlock = this.web3.eth.getBlock;
    const filterAddress = filter.address.toLowerCase();
    const filterEventJsonInterface = filter.jsonInterface.event;
    const filterEventSignature = ABICoder.encodeEventSignature(filterEventJsonInterface);
    const filterFunctionJsonInterface = filter.jsonInterface.function;
    const filterTransactionIncludes = filter.options?.include?.transaction;
    const filterBlockIncludes = filter.options?.include?.block;
    const functionInputsOrTransactionIncludes = filterFunctionJsonInterface?.inputs || filterTransactionIncludes;
    const transaction = functionInputsOrTransactionIncludes ? await getTransaction(transactionHash) : undefined;
    const transactionReceipt = await getTransactionReceipt(transactionHash);
    const block = filterBlockIncludes ? await getBlock(transactionReceipt.blockNumber) : undefined;
    const receiptLogs = transactionReceipt.logs.filter(
      (receiptLog) =>
        receiptLog.address.toLowerCase() === filterAddress && receiptLog.topics[0] === filterEventSignature,
    );
    if (!receiptLogs.length) throw new Error('No logs in the transaction receipt with the filter event signature');
    const previews: Log[] = [];
    for (const receiptLog of receiptLogs) {
      const baseLog: BaseLog = decodeLog(receiptLog, [filterEventJsonInterface]);
      const { logIndex, transactionIndex, blockNumber } = receiptLog;
      const logFunction = logFunctionObject(transaction, filterFunctionJsonInterface);
      const logBlock = logBlockObject(block, filterBlockIncludes);
      const logTransaction = logTransactionObject(transaction, filterTransactionIncludes);
      const log: Log = {
        filterId: '',
        logIndex,
        ...baseLog,
        ...(logFunction ? { function: logFunction } : {}),
        ...(logBlock ? { block: logBlock } : {}),
        transaction: {
          ...logTransaction,
          transactionIndex,
          blockNumber,
        },
      };
      previews.push(log);
    }
    return previews;
  }

  private makeProcessingEventListener() {
    const listener = async (data: EventsListenersArguments.processing) => {
      if (!data.endedAt) return;
      const { fromBlock, toBlock, ignoreDelay, currentBlockNumber } = await this.nextProcessOptions();
      if (fromBlock > toBlock) {
        logger.info(`Waiting for higher block (fromBlock: ${fromBlock} > toBlock: ${toBlock})...`);
        await sleep(10000);
        return await listener(data);
      }
      if (!ignoreDelay) {
        await sleep(this.options.delay);
      } else {
        logger.info(
          `Maximum number of blocks exceeded (${
            currentBlockNumber - fromBlock
          } block), Processing timeout is ignored...`,
        );
      }
      await this.process(fromBlock, toBlock);
    };
    return listener;
  }

  private async nextProcessOptions(blockNumber?: number) {
    const { maxBlocks } = this.options;
    const currentBlockNumber = await this.web3.eth.getBlockNumber();
    const fromBlock = blockNumber || this.latestBlockNumber ? this.latestBlockNumber + 1 : 0 || currentBlockNumber;
    const blocksDelta = currentBlockNumber - fromBlock;
    const ignoreDelay = blocksDelta > maxBlocks;
    const toBlock = blocksDelta > maxBlocks ? fromBlock + maxBlocks : currentBlockNumber;
    return { fromBlock, toBlock, ignoreDelay, currentBlockNumber };
  }

  private async getTransactionsFromHashes(hashes: string[]) {
    const getTransaction: any = this.web3.eth.getTransaction;
    const batch: any = new this.web3.BatchRequest();
    const uniqueHashes = Array.from(new Set(hashes));
    for (const transactionHash of uniqueHashes) {
      batch.add(getTransaction.request(transactionHash));
    }
    const transactions: Transaction[] = await executeAsync(batch);
    return transactions.some((transaction) => transaction?.hash === undefined)
      ? [
          ...transactions.filter((transaction) => transaction?.hash !== undefined),
          ...(await this.getTransactionsFromHashes(
            hashes.filter((hash) => !transactions.find((transaction) => transaction?.hash === hash)),
          )),
        ]
      : transactions;
  }

  private async getBlocksFromNumbers(numbers: number[]) {
    const getBlock: any = this.web3.eth.getBlock;
    const batch: any = new this.web3.BatchRequest();
    const uniqueNumbers = Array.from(new Set(numbers));
    for (const blockNumber of uniqueNumbers) {
      batch.add(getBlock.request(blockNumber));
    }
    const blocks: BlockTransactionString[] = await executeAsync(batch);
    return blocks.some((block) => block?.number === undefined)
      ? [
          ...blocks.filter((block) => block?.number !== undefined),
          ...(await this.getBlocksFromNumbers(
            numbers.filter((number) => !blocks.find((block) => block?.number === number)),
          )),
        ]
      : blocks;
  }
}

export declare interface Indexer {
  on(event: 'processing', listener: (data: EventsListenersArguments.processing) => void): this;
  emit(event: 'processing', data: EventsListenersArguments.processing): boolean;
}
