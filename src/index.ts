import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { HttpProvider } from 'web3-providers-http';
import { decodeLog } from 'eth-logs-decoder';
import { EventEmitter } from 'events';
import { BlockTransactionString } from 'web3-eth';
import { Filter, BaseLog, Log, Save, Load, Options, IndexerConstructor } from './interfaces';
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

class Indexer {
  httpProvider: HttpProvider;
  web3: Web3;
  filters: Filter[];
  save: Save;
  load: Load;
  block: { from: number; to: number };
  options: Options = defaultIndexerOptions;
  ignoreDelay = false;
  chainId = 0;
  private eventEmitter: EventEmitter = new EventEmitter();
  private onEnd: (() => Promise<void>) | undefined;
  private latestBlockNumber = 0;

  constructor({ host, save, load, filters = [], options = {} }: IndexerConstructor) {
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

  private async main(blockNumber?: number) {
    if (!this.filters.length) {
      logger.error('No initialized  filters !');
      return this.stop();
    }

    if (!this.chainId) {
      logger.error(`Unknown chain id : ${this.chainId}`);
      return this.stop();
    }

    this.eventEmitter.emit('begin');

    const formattedFilters = formatFilters(this.filters);

    const { address, topics } = getAddressAndTopicsOptions(formattedFilters);

    this.ignoreDelay = false;

    const currentBlockNumber = await this.web3.eth.getBlockNumber();

    if (blockNumber) {
      this.block.from = blockNumber;
      this.block.to = Math.min(currentBlockNumber, this.block.from + this.options.maxBlocks);
    } else {
      this.block.from = this.latestBlockNumber + 1;
      this.block.to = currentBlockNumber - this.options.confirmationBlocks;
    }

    const blocksDelta = this.block.to - this.block.from;

    if (blocksDelta > this.options.maxBlocks) {
      logger.warn(`Max blocks number exceeded (${blocksDelta} block), Iteration delay is ignored`);
      this.ignoreDelay = true;
      this.block.to = this.block.from + this.options.maxBlocks;
    } else if (blocksDelta < 0) {
      logger.warn(`Block number "from" ${this.block.from} > block number "to" ${this.block.to}`);
      this.latestBlockNumber = this.block.from - 1;
      logger.warn(`Waiting for new blocks ...`);
      this.eventEmitter.emit('end');
      return;
    }

    logger.info(`Processing logs from block ${this.block.from} to block ${this.block.to}`);

    const pastLogs = await this.web3.eth.getPastLogs({
      address,
      topics,
      fromBlock: this.block.from,
      toBlock: this.block.to,
    });

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

      if (
        logs.every(
          (log) =>
            !isNaN(log.transaction?.blockNumber as number) && !isNaN(log.transaction?.transactionIndex as number),
        )
      ) {
        logs.sort(
          (a, b) =>
            a.transaction.blockNumber - b.transaction.blockNumber ||
            a.transaction.transactionIndex - b.transaction.transactionIndex ||
            a.logIndex - b.logIndex,
        );
      }

      await this.save.logs(logs);
      logger.info(`${logs.length} log saved`);
    }

    this.latestBlockNumber = this.block.to;
    await this.save.blockNumber(this.latestBlockNumber);
    logger.info(`Last processed block number (${this.latestBlockNumber}) saved`);
    this.eventEmitter.emit('end');
  }

  private async getTransactionsFromHashes(hashes: string[]) {
    const getTransaction: any = this.web3.eth.getTransaction;
    const batch: any = new this.web3.BatchRequest();
    const uniqueHashes = Array.from(new Set(hashes));
    for (const transactionHash of uniqueHashes) {
      batch.add(getTransaction.request(transactionHash));
    }
    const transactions: Transaction[] = await executeAsync(batch);
    return transactions;
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
          ...blocks,
          ...(await this.getBlocksFromNumbers(numbers.filter((_, index) => blocks[index]?.number === undefined))),
        ]
      : blocks;
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
    const blockNumber = this.latestBlockNumber;
    const filters = this.filters.length || 0;
    const options = this.options;
    return { chainId, isRunning, blockNumber, filters, options };
  }

  onIterationBegin(callback: () => void) {
    this.eventEmitter.on('begin', callback);
  }

  onIterationEnd(callback: () => void) {
    this.eventEmitter.on('end', callback);
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
}

export default Indexer;

export { defaultIndexerOptions };
