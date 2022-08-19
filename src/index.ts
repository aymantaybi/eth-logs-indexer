import Web3 from "web3";
import {
  Filter,
  FormattedFilter,
  EventJsonInterface,
  FunctionJsonInterface,
} from "./interfaces";
import {
  formatFilters,
  getAddressAndTopicsOptions,
  formatDecodedLogs,
  getEventLabel,
} from "./utils";

interface Constructor {
  host: string;
  filters: Filter[];
  save: ({
    decodedLogs,
    decodedParameters,
  }: {
    decodedLogs: any;
    decodedParameters: any;
  }) => any;
  latestBlockNumber: LatestBlockNumber;
}

interface LatestBlockNumber {
  load: () => number;
  save: () => number;
}

class Indexer {
  websocketProvider: any;
  web3: Web3;
  filters: Filter[];
  save: ({
    decodedLogs,
    decodedParameters,
  }: {
    decodedLogs: any;
    decodedParameters: any;
  }) => any;
  latestBlockNumber: LatestBlockNumber;

  constructor({ host, filters, save, latestBlockNumber }: Constructor) {
    this.websocketProvider = new Web3.providers.WebsocketProvider(host);
    this.web3 = new Web3(this.websocketProvider);
    this.filters = filters;
    this.save = save;
    this.latestBlockNumber = latestBlockNumber;
  }

  async main() {
    let formattedFilters = formatFilters(this.filters);

    let { address, topics } = getAddressAndTopicsOptions(formattedFilters);

    let currentblockNumber = await this.web3.eth.getBlockNumber();

    let pastLogs = await this.web3.eth.getPastLogs({
      address,
      topics,
      fromBlock: currentblockNumber - 100,
    });

    let logs: any[] = [];

    for (let pastLog of pastLogs) {
      let formattedFilter = formattedFilters.find(
        (formattedFilter) =>
          formattedFilter.address == pastLog.address &&
          formattedFilter.eventSignature == pastLog.topics[0]
      )!;
      let jsonInterfaceInputsArray = formattedFilter.jsonInterface.event.inputs;
      let eventLabel = getEventLabel(formattedFilter.jsonInterface.event);
      let decodedData =
        pastLog.data == "0x"
          ? {}
          : this.web3.eth.abi.decodeLog(
              jsonInterfaceInputsArray,
              pastLog.data,
              pastLog.topics
            );

      let log = {
        ...pastLog,
        decodedData,
        event: eventLabel,
      };

      logs.push(log);
    }

    console.log(logs);

    /* console.log(pastLogs);

    //console.log(decodedLogs);

    let formattedDecodedLogs = decodedLogs.map((decodedLog) =>
      formatDecodedLogs(decodedLog)
    );

    console.log(formattedDecodedLogs);

    await this.save({ logs }); */
  }

  start() {
    this.main();
  }
}

export default Indexer;

export { Filter, FormattedFilter, EventJsonInterface, FunctionJsonInterface };
