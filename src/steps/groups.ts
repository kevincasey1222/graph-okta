import * as url from 'url';

import {
  createDirectRelationship,
  createIntegrationEntity,
  Entity,
  IntegrationStep,
  IntegrationStepExecutionContext,
  RelationshipClass,
  parseTimePropertyValue,
  IntegrationMissingKeyError,
} from '@jupiterone/integration-sdk-core';

import { createAPIClient } from '../client';
import { IntegrationConfig } from '../config';
import {
  DATA_ACCOUNT_ENTITY,
  USER_GROUP_ENTITY_TYPE,
  APP_USER_GROUP_ENTITY_TYPE,
} from '../okta/constants';
import getOktaAccountAdminUrl from '../util/getOktaAccountAdminUrl';

export async function fetchGroups({
  instance,
  jobState,
  logger,
}: IntegrationStepExecutionContext<IntegrationConfig>) {
  const apiClient = createAPIClient(instance.config, logger);

  const accountEntity = (await jobState.getData(DATA_ACCOUNT_ENTITY)) as Entity;

  await apiClient.iterateGroups(async (group) => {
    const webLink = url.resolve(
      getOktaAccountAdminUrl(instance.config),
      `/admin/group/${group.id}`,
    );
    const entityType =
      group.type === 'APP_GROUP'
        ? APP_USER_GROUP_ENTITY_TYPE
        : USER_GROUP_ENTITY_TYPE;

    const groupEntity = await jobState.addEntity(
      createIntegrationEntity({
        entityData: {
          source: group,
          assign: {
            _key: group.id,
            _type: entityType,
            _class: 'UserGroup',
            id: group.id,
            webLink: webLink,
            name: group.profile.name,
            displayName: group.profile.name,
            created: parseTimePropertyValue(group.created)!,
            createdOn: parseTimePropertyValue(group.created)!,
            lastUpdated: parseTimePropertyValue(group.lastUpdated)!,
            lastUpdatedOn: parseTimePropertyValue(group.lastUpdated)!,
            lastMembershipUpdated: parseTimePropertyValue(
              group.lastMembershipUpdated,
            )!,
            lastMembershipUpdatedOn: parseTimePropertyValue(
              group.lastMembershipUpdated,
            )!,
            objectClass: group.objectClass,
            type: group.type,
            description: group.profile.description,
          },
        },
      }),
    );

    await jobState.addRelationship(
      createDirectRelationship({
        _class: RelationshipClass.HAS,
        from: accountEntity,
        to: groupEntity,
      }),
    );

    //add relationships for all users in this group
    await apiClient.iterateUsersForGroup(group, async (user) => {
      const userEntity = await jobState.findEntity(user.id);

      if (!userEntity) {
        throw new IntegrationMissingKeyError(
          `Expected user with key to exist (key=${user.id})`,
        );
      }

      await jobState.addRelationship(
        createDirectRelationship({
          _class: RelationshipClass.HAS,
          from: groupEntity,
          to: userEntity,
        }),
      );
    });
  });
}

export const groupSteps: IntegrationStep<IntegrationConfig>[] = [
  {
    id: 'fetch-groups',
    name: 'Fetch Groups',
    entities: [
      {
        resourceName: 'Okta UserGroup',
        _type: USER_GROUP_ENTITY_TYPE,
        _class: 'UserGroup',
      },
      {
        resourceName: 'Okta App UserGroup',
        _type: APP_USER_GROUP_ENTITY_TYPE,
        _class: 'UserGroup',
      },
    ],
    relationships: [
      {
        _type: 'okta_account_has_user_group',
        _class: RelationshipClass.HAS,
        sourceType: 'okta_account',
        targetType: USER_GROUP_ENTITY_TYPE,
      },
      {
        _type: 'okta_account_has_app_user_group',
        _class: RelationshipClass.HAS,
        sourceType: 'okta_account',
        targetType: APP_USER_GROUP_ENTITY_TYPE,
      },
      {
        _type: 'okta_user_group_has_user',
        _class: RelationshipClass.HAS,
        sourceType: USER_GROUP_ENTITY_TYPE,
        targetType: 'okta_user',
      },
      {
        _type: 'okta_app_user_group_has_user',
        _class: RelationshipClass.HAS,
        sourceType: APP_USER_GROUP_ENTITY_TYPE,
        targetType: 'okta_user',
      },
    ],
    dependsOn: ['fetch-users'],
    executionHandler: fetchGroups,
  },
];
