import Utils from 'web3-utils';
import ABICoder from 'web3-eth-abi';
import { Transaction } from 'web3-core';
import { decodeInputs } from 'eth-logs-decoder';
import { AbiItem } from 'web3-utils';
import { Log, Filter, FormattedFilter } from './interfaces';
import { EventEmitter } from 'events';
import { BlockTransactionString } from 'web3-eth';

function formatFilters(filters: Filter[]): FormattedFilter[] {
  return filters.map((filter) => {
    return {
      ...filter,
      address: Utils.toChecksumAddress(filter.address),
      eventSignature: ABICoder.encodeEventSignature(filter.jsonInterface.event as any),
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

function logFunctionObject(
  transaction: Transaction | undefined,
  functionJsonInterface: AbiItem | undefined,
): Log['function'] | undefined {
  if (!transaction || !functionJsonInterface?.inputs) return undefined;

  const functionSignature = ABICoder.encodeFunctionSignature(functionJsonInterface);

  const functionInputWithoutSelector = `0x${transaction.input.slice(10)}`;

  const inputs: any = transaction.input.startsWith(functionSignature)
    ? decodeInputs(functionInputWithoutSelector, functionJsonInterface.inputs)
    : {};

  const signature = transaction.input.startsWith(functionSignature)
    ? functionSignature
    : transaction.input.slice(0, 10);

  const name = transaction.input.startsWith(functionSignature) ? functionJsonInterface.name : undefined;

  return {
    signature,
    name,
    inputs,
  };
}

function logTransactionObject(
  transaction: Transaction | undefined,
  fields: string[] | boolean | undefined,
): Log['transaction'] | undefined {
  if (!transaction || !fields) return undefined;

  const transactionWithFileds = (
    Array.isArray(fields) ? withFields(transaction, fields) : transaction
  ) as Log['transaction'];

  return transactionWithFileds;
}

function logBlockObject(
  block: BlockTransactionString | undefined,
  fields: string[] | boolean | undefined,
): Log['block'] | undefined {
  if (!block || !fields) return undefined;

  const blockWithFields = Array.isArray(fields) ? withFields(block, fields) : block;

  return blockWithFields;
}

function waitForEvent(
  eventEmitter: EventEmitter,
  eventName: string,
  options = { timeout: 0, condition: (...args: any) => true },
) {
  return new Promise((resolve, reject) => {
    const timeoutID = options.timeout
      ? setTimeout(() => {
          listener(undefined);
        }, options.timeout)
      : 0;
    const listener = (data: any) => {
      if (options.condition && !options.condition(data)) return;
      if (options.timeout) clearTimeout(timeoutID);
      resolve(data);
    };
    eventEmitter.once(eventName, listener);
  });
}

export {
  formatFilters,
  getAddressAndTopicsOptions,
  sleep,
  withFields,
  getFunctionInputWithoutSelector,
  logTransactionObject,
  logFunctionObject,
  logBlockObject,
  waitForEvent,
};
