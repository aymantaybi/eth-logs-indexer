import Web3 from 'web3';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { WebsocketProvider } from 'web3-providers-ws';
import { decodeInputs, decodeLog } from 'eth-logs-decoder';
import { Filter, FormattedFilter, DecodedLog, LatestBlockNumber } from './interfaces';
import { formatFilters, getAddressAndTopicsOptions, sleep, withFields, getFunctionInputWithoutSelector } from './utils';
import logger from './helpers/logger';
import { executeAsync } from './helpers/asyncBatch';
import { createControlledAsync } from 'controlled-async';

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
  chainId = -1;
  private mainFunctionController: any;
  private controlledFunction: ((...params: any[]) => Promise<void | { queueTaskCanceled: boolean }>) | undefined;

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
      this.stop();
      return;
    }

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

      for (const formattedFilter of formattedFilters) {
        const filteredPastLogs = pastLogs.filter(
          (pastLog) =>
            pastLog.address == formattedFilter.address && pastLog.topics[0] == formattedFilter.eventSignature,
        );

        if (filteredPastLogs.length == 0) continue;

        const eventJsonInterface = formattedFilter.jsonInterface.event;

        const functionJsonInterface = formattedFilter.jsonInterface.function;

        const { tag } = formattedFilter;

        const filterMatchingLogs = filteredPastLogs.map((pastLog) => {
          const { transactionHash, logIndex } = pastLog;

          const baseLog = decodeLog(pastLog, [eventJsonInterface]);

          let decodedLog: DecodedLog = { ...baseLog, filter: { tag }, logIndex };

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

          if (transaction && this.options.include.transaction) {
            const fields = Array.isArray(this.options.include.transaction)
              ? this.options.include.transaction
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
  }

  async start(blockNumber?: number) {
    if (!this.mainFunctionController) {
      const [controlledFunction, functionController] = createControlledAsync(async (blockNumber?: number) => {
        if (!this.ignoreDelay) {
          await sleep(this.options.delay);
        }
        await this.main(blockNumber);
      });
      this.controlledFunction = controlledFunction;
      this.mainFunctionController = functionController;
      this.ignoreDelay = true;
      this.mainFunctionController.eventEmitter.setMaxListeners(1);
    }
    if (!this.controlledFunction) return;
    const result = await this.controlledFunction(blockNumber);
    if (result?.queueTaskCanceled) return;
    this.start();
  }

  stop() {
    this.mainFunctionController?.resolve({ queueTaskCanceled: true });
    this.controlledFunction = undefined;
    this.mainFunctionController = undefined;
  }

  isRunning() {
    return this.mainFunctionController && this.controlledFunction;
  }
}

export default Indexer;

export { Filter, FormattedFilter, DecodedLog };
