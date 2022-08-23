import Web3 from "web3";
import {
  Filter,
  FormattedFilter,
  EventJsonInterface,
  FunctionJsonInterface,
  DecodedLog,
} from "./interfaces";
import {
  formatFilters,
  getAddressAndTopicsOptions,
  formatDecodedLogs,
  getEventLabel,
  sleep,
} from "./utils";
import logger from "./logger";

interface Constructor {
  host: string;
  filters: Filter[];
  save: (logs: DecodedLog[]) => Promise<void>;
  latestBlockNumber: LatestBlockNumber;
  options: {
    delay: number;
    maxBlocks: number;
    confirmationBlocks: number;
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
  options: { delay: number; maxBlocks: number; confirmationBlocks: number };
  ignoreDelay: boolean;

  constructor({
    host,
    filters,
    save,
    latestBlockNumber,
    options,
  }: Constructor) {
    this.websocketProvider = new Web3.providers.WebsocketProvider(host);
    this.web3 = new Web3(this.websocketProvider);
    this.filters = filters;
    this.save = save;
    this.latestBlockNumber = latestBlockNumber;
    this.options = options;
    this.block = {
      from: -1,
      to: -1,
    };
    this.ignoreDelay = false;
  }

  async main(blockNumber?: number) {
    let formattedFilters = formatFilters(this.filters);

    let { address, topics } = getAddressAndTopicsOptions(formattedFilters);

    this.ignoreDelay = false;

    if (blockNumber) {
      this.block.to = blockNumber;
      this.block.from = this.block.to - this.options.maxBlocks;
    } else {
      this.block.to =
        (await this.web3.eth.getBlockNumber()) -
        this.options.confirmationBlocks;
      this.block.from = (await this.latestBlockNumber.load()) + 1;
      if (this.block.to - this.block.from > this.options.maxBlocks) {
        logger.warn(
          `Max Blocks Number Exceeded (${
            this.block.to - this.block.from
          } Block), Iteration Delay Is Ignored`
        );
        this.ignoreDelay = true;
        this.block.to = this.block.from + this.options.maxBlocks;
      } else if (this.block.to - this.block.from < 0) {
        return;
      }
    }

    logger.info(
      `Processing Logs From Block ${this.block.from} To Block ${this.block.to}`
    );

    let pastLogs = await this.web3.eth.getPastLogs({
      address,
      topics,
      fromBlock: this.block.from,
      toBlock: this.block.to,
    });

    let logs: DecodedLog[] = [];

    for (let pastLog of pastLogs) {
      let formattedFilter = formattedFilters.find(
        (formattedFilter) =>
          formattedFilter.address == pastLog.address &&
          formattedFilter.eventSignature == pastLog.topics[0]
      )!;
      let jsonInterfaceInputsArray = formattedFilter.jsonInterface.event.inputs;
      let eventLabel = getEventLabel(formattedFilter.jsonInterface.event);
      let rawDecodedData =
        pastLog.data == "0x"
          ? {}
          : this.web3.eth.abi.decodeLog(
              jsonInterfaceInputsArray,
              pastLog.data,
              pastLog.topics
            );

      let decodedData = formatDecodedLogs(rawDecodedData);

      let log: DecodedLog = {
        ...pastLog,
        decodedData,
        event: eventLabel,
      };

      logs.push(log);
    }

    await this.save(logs);
    logger.info(`${logs.length} Logs Saved`);
    await this.latestBlockNumber.save(this.block.to);
    logger.info(`Last Processed Block Number (${this.block.to}) Saved`);
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

export { Filter, FormattedFilter, EventJsonInterface, FunctionJsonInterface };
