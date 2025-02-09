/* eslint-disable @typescript-eslint/no-empty-function */
import {
  IntegrationLogger,
  IntegrationProviderAuthenticationError,
  IntegrationProviderAuthorizationError,
} from '@jupiterone/integration-sdk-core';
import { IntegrationConfig } from './config';
export type ResourceIteratee<T> = (each: T) => Promise<void> | void;
import createOktaClient from './okta/createOktaClient';
import {
  OktaClient,
  OktaFactor,
  OktaUser,
  OktaUserGroup,
  OktaApplication,
  OktaApplicationGroup,
  OktaApplicationUser,
  OktaRule,
  OrgOktaSupportSettingsObj,
  OktaRole,
  OktaLogEvent,
} from './okta/types';

const NINETY_DAYS_AGO = 90 * 24 * 60 * 60 * 1000;

/**
 * An APIClient maintains authentication state and provides an interface to
 * third party data APIs.
 *
 * It is recommended that integrations wrap provider data APIs to provide a
 * place to handle error responses and implement common patterns for iterating
 * resources.
 */
export class APIClient {
  oktaClient: OktaClient;
  logger: IntegrationLogger;
  constructor(readonly config: IntegrationConfig, logger: IntegrationLogger) {
    this.oktaClient = createOktaClient(logger, config);
    this.logger = logger;
  }

  public async verifyAuthentication(): Promise<void> {
    // the most light-weight request possible to validate credentials

    try {
      //note that if you don't hit the .each, it doesn't actually attempt it
      await this.oktaClient.listUsers({ limit: '1' }).each((e) => {
        return false;
      });
    } catch (err) {
      throw new IntegrationProviderAuthenticationError({
        cause: err,
        endpoint: this.config.oktaOrgUrl + '/api/v1/users?limit=1',
        status: err.status,
        statusText: err.statusText,
      });
    }
  }

  /**
   * Iterates each user resource in the provider.
   * Then iterates each deprovisioned user resource.
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateUsers(
    iteratee: ResourceIteratee<OktaUser>,
  ): Promise<void> {
    try {
      await this.oktaClient.listUsers().each(iteratee);
      await this.oktaClient
        .listUsers({
          filter: 'status eq "DEPROVISIONED"',
        })
        .each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      }
    }
  }

  /**
   * Iterates each group resource in the provider.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateGroups(
    iteratee: ResourceIteratee<OktaUserGroup>,
  ): Promise<void> {
    try {
      await this.oktaClient.listGroups().each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      }
    }
  }

  /**
   * Iterates each user resource assigned to a given group.
   *
   * @param iteratee receives each resource to produce relationships
   */
  public async iterateUsersForGroup(
    group: OktaUserGroup,
    iteratee: ResourceIteratee<OktaUser>,
  ): Promise<void> {
    try {
      await this.oktaClient.listGroupUsers(group.id).each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else if (err.status === 404) {
        //ignore it. It's probably a group that got deleted between steps
      } else {
        throw err;
      }
    }
  }

  /**
   * Iterates each Multi-Factor Authentication device assigned to a given user.
   *
   * @param iteratee receives each resource to produce relationships
   */
  public async iterateDevicesForUser(
    userId: string,
    iteratee: ResourceIteratee<OktaFactor>,
  ): Promise<void> {
    try {
      await this.oktaClient.listFactors(userId).each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else if (err.status === 404) {
        //ignore it. It's probably a user that got deleted between steps
      } else {
        throw err;
      }
    }
  }

  /**
   * Iterates each application resource in the provider.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateApplications(
    iteratee: ResourceIteratee<OktaApplication>,
  ): Promise<void> {
    try {
      await this.oktaClient.listApplications().each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else {
        throw err;
      }
    }
  }

  /**
   * Iterates each group assigned to a given application.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateGroupsForApp(
    app: OktaApplication,
    iteratee: ResourceIteratee<OktaApplicationGroup>,
  ): Promise<void> {
    try {
      await this.oktaClient
        .listApplicationGroupAssignments(app.id)
        .each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else if (err.status === 404) {
        //ignore it. It's probably an app that got deleted between steps
      } else {
        throw err;
      }
    }
  }

  /**
   * Iterates each individual user assigned to a given application.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateUsersForApp(
    app: OktaApplication,
    iteratee: ResourceIteratee<OktaApplicationUser>,
  ): Promise<void> {
    try {
      await this.oktaClient.listApplicationUsers(app.id).each(iteratee);
    } catch (err) {
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else if (err.status === 404) {
        //ignore it. It's probably an app that got deleted between steps
      } else {
        throw err;
      }
    }
  }

  /**
   * Iterates each rule resource in the provider.
   *
   * @param iteratee receives each resource to produce entities/relationships
   */
  public async iterateRules(
    iteratee: ResourceIteratee<OktaRule>,
  ): Promise<void> {
    try {
      await this.oktaClient.listGroupRules().each(iteratee);
    } catch (err) {
      //per https://developer.okta.com/docs/reference/error-codes/
      if (/\/api\/v1\/groups\/rules/.test(err.url) && err.status === 400) {
        this.logger.info(
          'Rules not enabled for this account. Skipping processing of Okta Rules.',
        );
      } else if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else {
        throw err;
      }
    }
  }

  public async getSupportInfo(): Promise<OrgOktaSupportSettingsObj> {
    return await this.oktaClient.getOrgOktaSupportSettings();
  }

  public async iterateRolesByUser(
    userId: string,
    iteratee: ResourceIteratee<OktaRole>,
  ): Promise<void> {
    try {
      await this.oktaClient.listAssignedRolesForUser(userId).each(iteratee);
    } catch (err) {
      //per https://developer.okta.com/docs/reference/error-codes/
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else {
        throw err;
      }
    }
  }

  public async iterateRolesByGroup(
    groupId: string,
    iteratee: ResourceIteratee<OktaRole>,
  ): Promise<void> {
    try {
      await this.oktaClient.listGroupAssignedRoles(groupId).each(iteratee);
    } catch (err) {
      //per https://developer.okta.com/docs/reference/error-codes/
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else {
        throw err;
      }
    }
  }

  public async iterateAppCreatedLogs(
    iteratee: ResourceIteratee<OktaLogEvent>,
  ): Promise<void> {
    try {
      // Use filter to only find instances of a newly created application.
      // We must specify 'since' to a time far in the past, otherwise we
      // will only get the last 7 days of data.  Okta only saves the last
      // 90 days, so this is not us limiting what we're able to get.
      const daysAgo = Date.now() - NINETY_DAYS_AGO;
      const startDate = new Date(daysAgo).toISOString();
      await this.oktaClient
        .getLogs({
          filter:
            'eventType eq "application.lifecycle.update" and debugContext.debugData.requestUri ew "_new_"',
          since: startDate,
        })
        .each(iteratee);
    } catch (err) {
      //per https://developer.okta.com/docs/reference/error-codes/
      if (err.status === 403) {
        throw new IntegrationProviderAuthorizationError({
          cause: err,
          endpoint: err.url,
          status: err.status,
          statusText: err.errorSummary,
        });
      } else {
        throw err;
      }
    }
  }
}

export function createAPIClient(
  config: IntegrationConfig,
  logger: IntegrationLogger,
): APIClient {
  return new APIClient(config, logger);
}
