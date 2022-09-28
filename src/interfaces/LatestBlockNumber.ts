interface LatestBlockNumber {
  load: () => Promise<number>;
  save: (blockNumber: number) => Promise<void>;
}

export default LatestBlockNumber;
