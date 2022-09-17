const Jsonrpc = require('web3-core-requestmanager/src/jsonrpc');

var { errors } = require('web3-core-helpers');

function executeAsync(batch: any): any {
  return new Promise((resolve, reject) => {
    var requests = batch.requests;

    batch.requestManager.sendBatch(requests, (err: any, results: never[]) => {
      results = results || [];

      var response = requests
        .map((request: any, index: number) => {
          return results[index] || {};
        })
        .map((result: { error: any; result: any }, index: number) => {
          if (result && result.error) {
            return errors.ErrorResponse(result);
          }

          if (!Jsonrpc.isValidResponse(result)) {
            return errors.InvalidResponse(result);
          }

          return requests[index].format ? requests[index].format(result.result) : result.result;
        });

      resolve(response);
    });
  });
}

export { executeAsync };
