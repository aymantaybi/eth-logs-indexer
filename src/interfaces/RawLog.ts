interface RawLog {
  address: string;
  event: {
    signature: string;
    name: string | undefined;
    inputs: { [key: string]: string | number | object | string[] | object[] };
  };
}

export default RawLog;
