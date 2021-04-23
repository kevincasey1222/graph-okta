import {
  MappedRelationship,
  RelationshipDirection,
} from '@jupiterone/integration-sdk-core';
import * as lodash from 'lodash';
import * as url from 'url';
import { OktaApplication } from '../okta/types';
import { StandardizedOktaApplication, OktaIntegrationConfig } from '../types';
import buildAppShortName from '../util/buildAppShortName';
import getOktaAccountAdminUrl from '../util/getOktaAccountAdminUrl';
import getOktaAccountInfo from '../util/getOktaAccountInfo';
import {
  getAccountName,
  getVendorName,
  isMultiInstanceApp,
} from '../util/knownVendors';

import { APPLICATION_ENTITY_TYPE } from '../okta/constants';

interface IntegrationInstance {
  id: string;
  name: string;
  config: object;
}

export function createApplicationEntity(
  instance: IntegrationInstance,
  data: OktaApplication,
): StandardizedOktaApplication {
  const webLink = url.resolve(
    getOktaAccountAdminUrl(instance.config as OktaIntegrationConfig),
    `/admin/app/${data.name}/instance/${data.id}`,
  );

  let imageUrl;
  let loginUrl;

  if (data._links?.logo) {
    imageUrl = lodash.flatten([data._links.logo])[0].href;
  }

  if (data._links?.appLinks) {
    const links = lodash.flatten([data._links.appLinks]);
    const link = links.find((l) => l.name === 'login') || links[0];
    loginUrl = link && link.href;
  }

  const oktaAccountInfo = getOktaAccountInfo(instance);
  const appShortName = buildAppShortName(oktaAccountInfo, data.name);

  const entity: StandardizedOktaApplication = {
    _key: data.id,
    _type: APPLICATION_ENTITY_TYPE,
    _class: 'Application',
    displayName: data.label || data.name || data.id,
    id: data.id,
    name: data.name || data.label,
    shortName: appShortName,
    label: data.label,
    status: data.status,
    active: data.status === 'ACTIVE',
    lastUpdated: data.lastUpdated,
    created: data.created,
    features: data.features,
    signOnMode: data.signOnMode,
    appVendorName: getVendorName(appShortName),
    appAccountType: getAccountName(appShortName),
    isMultiInstanceApp: isMultiInstanceApp(appShortName),
    isSAMLApp: !!data.signOnMode && data.signOnMode.startsWith('SAML'),
    webLink,
    imageUrl,
    loginUrl,
  };

  const appSettings = data.settings && data.settings.app;
  if (appSettings) {
    if (appSettings.awsEnvironmentType === 'aws.amazon') {
      if (appSettings.identityProviderArn) {
        const awsAccountIdMatch = /^arn:aws:iam::([0-9]+):/.exec(
          appSettings.identityProviderArn,
        );
        if (awsAccountIdMatch) {
          entity.awsAccountId = awsAccountIdMatch[1];
          entity.appAccountId = awsAccountIdMatch[1];
        }
      }

      entity.awsIdentityProviderArn = appSettings.identityProviderArn;
      entity.awsEnvironmentType = appSettings.awsEnvironmentType;
      entity.awsGroupFilter = appSettings.groupFilter;
      entity.awsRoleValuePattern = appSettings.roleValuePattern;
      entity.awsJoinAllRoles = appSettings.joinAllRoles;
      entity.awsSessionDuration = appSettings.sessionDuration;
    } else if (appSettings.githubOrg) {
      entity.githubOrg = appSettings.githubOrg;
      entity.appAccountId = appSettings.githubOrg;
    } else if (appSettings.domain) {
      // Google Cloud Platform and G Suite apps use `domain` as the account identifier
      entity.appDomain = appSettings.domain;
      entity.appAccountId = appSettings.domain;
    }
  }

  return entity;
}

/**
 * When an Okta application represents access to an AWS Account (the application
 * has an `awsAccountId`), the application user or group profile may define a
 * `role` or `samlRoles` property that identifies one or more AWS IAM roles that
 * may be assumed by the user or group. The roles are parsed to create mapped
 * relationships to the AWS IAM roles. The relationship is not created unless
 * the role is already in the graph.
 *
 * See
 * https://saml-doc.okta.com/SAML_Docs/How-to-Configure-SAML-2.0-for-Amazon-Web-Service#scenarioB,
 * bullet point #11.
 *
 * - The primary SAML roles are listed directly
 * - The secondary SAML roles are listed as `Account Name - Role Name` or
 *   `[Account Alias] - Role Name`
 *
 * @param sourceKey the `_key` of the user which has access to the
 * `awsAccountId`
 * @param role the AWS IAM role identifier provided by Okta
 * @param awsAccountId the application `awsAccountId`
 */
export function mapAWSRoleAssignment({
  sourceKey,
  role,
  relationshipType,
  awsAccountId,
}: {
  sourceKey: string;
  role: string;
  relationshipType: string;
  awsAccountId: string;
}): MappedRelationship | undefined {
  const regex = /\[?([a-zA-Z0-9_-]+)\]? -- ([a-zA-Z0-9_-]+)/;
  const match = role && regex.exec(role);
  if (match) {
    const awsAccountName = match[1];
    const roleName = match[2];
    return {
      _key: `${sourceKey}|assigned|${awsAccountName}|${roleName}`,
      _type: relationshipType,
      _class: 'ASSIGNED',
      _mapping: {
        sourceEntityKey: sourceKey,
        relationshipDirection: RelationshipDirection.REVERSE,
        targetFilterKeys: [['_type', 'roleName', 'tag.AccountName']],
        targetEntity: {
          _class: 'AccessRole',
          _type: 'aws_iam_role',
          roleName,
          name: roleName,
          displayName: roleName,
          'tag.AccountName': awsAccountName,
        },
        skipTargetCreation: true,
      },
      displayName: 'ASSIGNED',
    };
  } else if (role) {
    const roleArn = `arn:aws:iam::${awsAccountId}:role/${role}`;
    return {
      _key: `${sourceKey}|assigned|${roleArn}`,
      _type: relationshipType,
      _class: 'ASSIGNED',
      _mapping: {
        sourceEntityKey: sourceKey,
        relationshipDirection: RelationshipDirection.REVERSE,
        targetFilterKeys: [['_type', '_key']],
        targetEntity: {
          _class: 'AccessRole',
          _type: 'aws_iam_role',
          _key: roleArn,
          roleName: role,
          name: role,
          displayName: role,
        },
        skipTargetCreation: true,
      },
      displayName: 'ASSIGNED',
    };
  }
}
