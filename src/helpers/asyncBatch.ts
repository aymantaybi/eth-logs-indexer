import { errors } from 'web3-core-helpers';
import Jsonrpc from 'web3-core-requestmanager/src/jsonrpc';

export function executeAsync(batch: any): any {
  return new Promise((resolve) => {
    const requests = batch.requests;
    const sortResponses = batch._sortResponses.bind(batch);
    const formattedResults: unknown[] = [];
    batch.requestManager.sendBatch(requests, async function (err, results) {
      results = sortResponses(results);
      requests
        .map(function (request, index) {
          return results[index] || {};
        })
        .forEach(function (result, index) {
          if (requests[index].callback) {
            if (result && result.error) {
              return requests[index].callback(errors.ErrorResponse(result));
            }
            if (!Jsonrpc.isValidResponse(result)) {
              return requests[index].callback(errors.InvalidResponse(result));
            }
            try {
              requests[index].callback(
                null,
                requests[index].format ? requests[index].format(result.result) : result.result,
              );
            } catch (err) {
              requests[index].callback(err);
            }
          }
          if (Jsonrpc.isValidResponse(result)) {
            return formattedResults.push(
              requests[index].format ? requests[index].format(result.result) : result.result,
            );
          }
        });
      resolve(formattedResults);
    });
  });
}
