export { default as FormattedFilter } from './FormattedFilter';

import DecodedLog from './DecodedLog';
import Filter from './Filter';

export { DecodedLog, Filter };

export interface Options {
  delay: number;
  maxBlocks: number;
  confirmationBlocks: number;
}

export interface Save {
  logs: (logs: DecodedLog[]) => Promise<void>;
  filters: (filters: Filter[]) => Promise<void>;
  options: (options: Partial<Options>) => Promise<void>;
  blockNumber: (blockNumber: number) => Promise<void>;
}

export interface Load {
  filters: () => Promise<Filter[]>;
  options: () => Promise<Options>;
  blockNumber: () => Promise<number>;
}
