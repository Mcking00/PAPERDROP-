import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Section: a.model({
    name: a.string().required(),
    description: a.string(),
    sortOrder: a.integer().required(),
    parentId: a.id(),
  })
  .secondaryIndexes((index) => [index("parentId").sortKeys(["sortOrder"])])
  .authorization((allow) => [
    allow.guest().to(["read"]),
    allow.groups(["ADMINS"]).to(["create", "read", "update", "delete"]),
  ]),

  Submission: a.model({
    originalName: a.string().required(),
    storagePath: a.string().required(),
    size: a.integer().required(),
    sectionId: a.id().required(),
    status: a.string().required(),
    pageCount: a.integer(),
    title: a.string(),
    author: a.string(),
    thumbnailPath: a.string(),
    fileHash: a.string(),
    processingStatus: a.string(),
    processingError: a.string(),
    duplicateOfDocumentId: a.id(),
  })
  .secondaryIndexes((index) => [
    index("sectionId"),
    index("fileHash"),
    index("status"),
  ])
  .authorization((allow) => [
    allow.guest().to(["create"]),
    allow.groups(["ADMINS"]).to(["read", "update", "delete"]),
  ]),

  Document: a.model({
    originalName: a.string().required(),
    storagePath: a.string().required(),
    size: a.integer().required(),
    sectionId: a.id().required(),
    status: a.string(),
    pageCount: a.integer(),
    title: a.string(),
    author: a.string(),
    thumbnailPath: a.string(),
    fileHash: a.string(),
    processingStatus: a.string(),
    processingError: a.string(),
    publishedAt: a.datetime(),
    trashedAt: a.datetime(),
    trashedFromPath: a.string(),
    currentVersion: a.integer(),
  })
  .secondaryIndexes((index) => [
    index("sectionId"),
    index("fileHash"),
    index("status"),
  ])
  .authorization((allow) => [
    allow.guest().to(["read"]),
    allow.groups(["ADMINS"]).to(["create", "read", "update", "delete"]),
  ]),

  DocumentVersion: a.model({
    documentId: a.id().required(),
    versionNumber: a.integer().required(),
    originalName: a.string().required(),
    storagePath: a.string().required(),
    size: a.integer().required(),
    pageCount: a.integer(),
    title: a.string(),
    author: a.string(),
    fileHash: a.string(),
    createdBy: a.string(),
  })
  .secondaryIndexes((index) => [index("documentId").sortKeys(["versionNumber"])])
  .authorization((allow) => [
    allow.groups(["ADMINS"]).to(["create", "read", "update", "delete"]),
  ]),

  Report: a.model({
    documentId: a.id().required(),
    reason: a.string().required(),
    description: a.string(),
    status: a.string().required(),
    reviewedAt: a.datetime(),
    reviewedBy: a.string(),
  })
  .secondaryIndexes((index) => [
    index("documentId"),
    index("status"),
  ])
  .authorization((allow) => [
    allow.guest().to(["create"]),
    allow.groups(["ADMINS"]).to(["read", "update", "delete"]),
  ]),

  ActivityLog: a.model({
    action: a.string().required(),
    entityType: a.string().required(),
    entityId: a.id(),
    summary: a.string().required(),
    actor: a.string(),
    metadata: a.string(),
  })
  .secondaryIndexes((index) => [
    index("entityId"),
    index("action"),
  ])
  .authorization((allow) => [
    allow.groups(["ADMINS"]).to(["create", "read", "update", "delete"]),
  ]),
});

export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "identityPool",
  },
});
