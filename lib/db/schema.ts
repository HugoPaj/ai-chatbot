import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
  unique,
} from 'drizzle-orm/pg-core';

// Organizations (Universities/Companies) - defined first for references
export const org = pgTable('Org', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  name: varchar('name', { length: 256 }).notNull(),
  domain: varchar('domain', { length: 128 }).notNull().unique(), // e.g., "stanford.edu", "company.com"
  type: varchar('type', { enum: ['university', 'company'] }).notNull().default('university'),
  isActive: boolean('isActive').notNull().default(true),
  maxUsersPerDay: varchar('maxUsersPerDay', { length: 16 }).notNull().default('-1'), // -1 for unlimited
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export type Org = InferSelectModel<typeof org>;

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
  orgId: uuid('orgId').references(() => org.id),
  isVerified: boolean('isVerified').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet', 'latex'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  'Stream',
  {
    id: uuid('id').notNull().defaultRandom(),
    chatId: uuid('chatId').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;

// Global application settings
export const appSettings = pgTable('AppSettings', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  key: varchar('key', { length: 64 }).notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  updatedBy: uuid('updatedBy')
    .notNull()
    .references(() => user.id),
});

export type AppSettings = InferSelectModel<typeof appSettings>;


// Organization admins
export const orgAdmin = pgTable('OrgAdmin', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  orgId: uuid('orgId')
    .notNull()
    .references(() => org.id),
  canManageUsers: boolean('canManageUsers').notNull().default(true),
  canViewAnalytics: boolean('canViewAnalytics').notNull().default(true),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export type OrgAdmin = InferSelectModel<typeof orgAdmin>;

// Daily usage tracking
export const dailyUsage = pgTable(
  'DailyUsage',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD format
    requestCount: varchar('requestCount', { length: 16 })
      .notNull()
      .default('0'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserDate: unique().on(table.userId, table.date),
  }),
);

export type DailyUsage = InferSelectModel<typeof dailyUsage>;

// Document processing jobs for async RAG document uploads
export const documentProcessingJob = pgTable('DocumentProcessingJob', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  filename: varchar('filename', { length: 256 }).notNull(),
  fileSize: varchar('fileSize', { length: 16 }).notNull(), // Store as string to avoid int overflow
  fileType: varchar('fileType', { length: 64 }).notNull(),
  status: varchar('status', {
    enum: ['queued', 'processing', 'completed', 'failed'],
  })
    .notNull()
    .default('queued'),
  progress: varchar('progress', { length: 8 }).notNull().default('0'), // 0-100
  message: text('message'),
  errorMessage: text('errorMessage'),
  // File storage info
  r2Url: text('r2Url'), // R2 URL for the uploaded file
  contentHash: varchar('contentHash', { length: 64 }), // SHA-256 hash
  // Processing results
  totalPages: varchar('totalPages', { length: 8 }),
  chunksCount: varchar('chunksCount', { length: 8 }),
  processingTimeMs: varchar('processingTimeMs', { length: 16 }),
  // Timestamps
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  startedAt: timestamp('startedAt'),
  completedAt: timestamp('completedAt'),
});

export type DocumentProcessingJob = InferSelectModel<
  typeof documentProcessingJob
>;
