/* eslint-disable @typescript-eslint/no-namespace */
import { BaseLog, Log } from './Log';
import { Filter, FormattedFilter } from './Filter';

export { Log, BaseLog, Filter, FormattedFilter };

export interface Options {
  delay: number;
  maxBlocks: number;
  confirmationBlocks: number;
  autoStart: boolean;
}

export interface Save {
  logs: (logs: Log[]) => Promise<void>;
  filters: (filters: Filter[]) => Promise<void>;
  options: (options: Partial<Options>) => Promise<void>;
  blockNumber: (blockNumber: number) => Promise<void>;
}

export interface Load {
  filters: () => Promise<Filter[]>;
  options: () => Promise<Options>;
  blockNumber: () => Promise<number>;
}

export interface IndexerConstructor {
  host: string;
  save: Save;
  load: Load;
  filters?: Filter[];
  options?: Partial<Options>;
}

export namespace EventsListenersArguments {
  export interface processing {
    startedAt: number;
    endedAt?: number;
    fromBlock: number;
    toBlock: number;
  }
}
