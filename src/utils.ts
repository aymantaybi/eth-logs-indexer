import Utils from 'web3-utils';
import ABICoder from 'web3-eth-abi';
import { Filter, FormattedFilter } from './interfaces';

function formatFilters(filters: Filter[]): FormattedFilter[] {
  return filters.map((filter) => {
    return {
      ...filter,
      address: Utils.toChecksumAddress(filter.address),
      eventSignature: ABICoder.encodeEventSignature(
        filter.jsonInterface.event as any,
      ),
    };
  });
}

function getAddressAndTopicsOptions(formattedFilters: FormattedFilter[]) {
  const address: string[] = [];
  const topics: string[][] = [[]];

  for (const filter of formattedFilters) {
    if (!address.includes(filter.address)) {
      address.push(filter.address);
    }
    if (!topics[0].includes(filter.eventSignature)) {
      topics[0].push(filter.eventSignature);
    }
  }

  return { address, topics };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withFields(object: { [key: string]: any }, keys: string[]) {
  const objectWithFields: { [key: string]: any } = {};
  for (const key of keys) {
    objectWithFields[key] = object[key];
  }
  return objectWithFields;
}

function getFunctionInputWithoutSelector(input: string) {
  return '0x' + input.slice(10);
}

export {
  formatFilters,
  getAddressAndTopicsOptions,
  sleep,
  withFields,
  getFunctionInputWithoutSelector,
};
