import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Section: a.model({
    name: a.string().required(),
    description: a.string(),
    sortOrder: a.integer().required(),
  }).authorization((allow) => [
    allow.guest().to(['read']),
    allow.groups(['ADMINS']).to(['create', 'read', 'update', 'delete']),
  ]),

  Submission: a.model({
    originalName: a.string().required(),
    storagePath: a.string().required(),
    size: a.integer().required(),
    sectionId: a.id().required(),
    status: a.string().required(),
    createdAt: a.datetime().required(),
  }).authorization((allow) => [
    allow.guest().to(['create']),
    allow.groups(['ADMINS']).to(['read', 'update', 'delete']),
  ]),

  Document: a.model({
    originalName: a.string().required(),
    storagePath: a.string().required(),
    size: a.integer().required(),
    sectionId: a.id().required(),
    createdAt: a.datetime().required(),
  }).authorization((allow) => [
    allow.guest().to(['read']),
    allow.groups(['ADMINS']).to(['create', 'read', 'update', 'delete']),
  ]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
