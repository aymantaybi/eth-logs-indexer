import Utils from "web3-utils";
import ABICoder from "web3-eth-abi";
import { Filter, FormattedFilter, EventJsonInterface } from "./interfaces";

function formatFilters(filters: Filter[]): FormattedFilter[] {
  return filters.map((filter) => {
    return {
      ...filter,
      address: Utils.toChecksumAddress(filter.address),
      eventSignature: ABICoder.encodeEventSignature(
        filter.jsonInterface.event as any
      ),
    };
  });
}

function getAddressAndTopicsOptions(formattedFilters: FormattedFilter[]) {
  let address: string[] = [];
  let topics: string[][] = [[]];

  for (let filter of formattedFilters) {
    if (!address.includes(filter.address)) {
      address.push(filter.address);
    }
    if (!topics[0].includes(filter.eventSignature)) {
      topics[0].push(filter.eventSignature);
    }
  }

  return { address, topics };
}

function formatDecodedLogs(decodedLog: any) {
  let formatedDecodedLogs: { [key: string]: any } = {};
  let ObjectKeys = Object.keys(decodedLog);
  let filtredObjectKeys = ObjectKeys.filter(
    (key: any) => isNaN(key) && key != "__length__"
  );
  for (let key of filtredObjectKeys) {
    formatedDecodedLogs[key] = decodedLog[key];
  }
  return formatedDecodedLogs;
}

function getEventLabel(jsonInterface: EventJsonInterface) {
  let eventLabel = `${jsonInterface.name}(`;

  jsonInterface.inputs.forEach((input, index) => {
    let inputLabel = `${input.indexed ? "indexed " : ""}${input.type} ${
      input.name
    }`;
    let commaOrParenthesis =
      index == jsonInterface.inputs.length - 1 ? " )" : ",";
    eventLabel = `${eventLabel} ${inputLabel}${commaOrParenthesis}`;
  });

  return eventLabel;
}

export {
  formatFilters,
  getAddressAndTopicsOptions,
  formatDecodedLogs,
  getEventLabel,
};
