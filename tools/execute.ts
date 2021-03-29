/* tslint:disable:no-console */
process.env.JUPITERONE_RUNTIME_ENVIRONMENT = 'LOCAL';
process.env.AWS_SDK_LOAD_CONFIG = '1';

process.env.LOCAL = 'true';
process.env.USING_LOCAL_STACK = process.env.USING_LOCAL_STACK || 'true';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.GRAPH_DB_PORT = process.env.GRAPH_DB_PORT || '8182';
process.env.GRAPH_DB_CONNECTION_POOL_SIZE =
  process.env.GRAPH_DB_CONNECTION_POOL_SIZE || '1';
process.env.JUPITERONE_MAX_OPERATION_CONCURRENCY =
  process.env.JUPITERONE_MAX_OPERATION_CONCURRENCY || '10';
process.env.AWS_XRAY_ENABLED = 'false';
process.env.RETRY_QUEUE_SQS_URL = 'fake-queue-url';
process.env.JUPITERONE_SDK_USE_DYNAMODB = 'true';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.RAW_DATA_PERSISTER_ENABLED =
  process.env.RAW_DATA_PERSISTER_ENABLED || 'true';
//process.env.INTEGRATION_DEFINITION_ID =
// '7a669809-6e55-45b9-bf23-aa27613118e9';
const awsProfile =
  process.env.AWS_DEFAULT_PROFILE ||
  process.env.AWS_PROFILE ||
  'jupiterone-dev';
process.env.AWS_DEFAULT_PROFILE = process.env.AWS_PROFILE = awsProfile;

import { executeIntegrationLocal } from '@jupiterone/jupiter-managed-integration-sdk';
import { stepFunctionsInvocationConfig } from '../src/index';

const integrationConfig = {
  oktaApiKey: process.env.OKTA_LOCAL_EXECUTION_API_KEY,
  oktaOrgUrl: process.env.OKTA_LOCAL_EXECUTION_ORG_URL,
};

const invocationArgs = {
  // providerPrivateKey: process.env.PROVIDER_LOCAL_EXECUTION_PRIVATE_KEY
};

executeIntegrationLocal(
  integrationConfig,
  stepFunctionsInvocationConfig,
  invocationArgs,
).catch((err) => {
  console.error(err);
  process.exit(1);
});
