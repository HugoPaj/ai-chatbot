import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
  appSettings,
  dailyUsage,
  org,
  type Org,
  orgAdmin,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateHashedPassword, normalizeEmail } from './utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    const normalizedEmail = normalizeEmail(email);
    return await db.select().from(user).where(eq(user.email, normalizedEmail));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user by email',
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    const normalizedEmail = normalizeEmail(email);
    return await db
      .insert(user)
      .values({ email: normalizedEmail, password: hashedPassword });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function createSSOUser(email: string, orgId?: string) {
  try {
    const normalizedEmail = normalizeEmail(email);
    const [newUser] = await db
      .insert(user)
      .values({
        email: normalizedEmail,
        password: null, // SSO users don't have passwords
        orgId: orgId || null,
        isVerified: true, // SSO users are automatically verified
      })
      .returning();
    return newUser;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create SSO user');
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    // Validate messages before insertion
    const validatedMessages = messages.map((msg) => ({
      ...msg,
      parts: msg.parts || [{ type: 'text', text: '' }],
      attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
    }));

    // Check for existing messages to avoid duplicates
    const messageIds = validatedMessages.map((msg) => msg.id);
    const existingMessages = await db
      .select({ id: message.id })
      .from(message)
      .where(inArray(message.id, messageIds));

    const existingIds = new Set(existingMessages.map((msg) => msg.id));
    const newMessages = validatedMessages.filter(
      (msg) => !existingIds.has(msg.id),
    );

    if (newMessages.length === 0) {
      console.log('All messages already exist in database, skipping insert');
      return [];
    }

    // Use INSERT ... ON CONFLICT DO NOTHING for extra safety
    return await db.insert(message).values(newMessages).onConflictDoNothing();
  } catch (error) {
    console.error('Database error details:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get votes by chat id',
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save document');
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get documents by id',
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document by id',
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete documents by id after timestamp',
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save suggestions',
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get suggestions by document id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}

// Global settings functions
export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const setting = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1)
      .execute();

    return setting[0]?.value ?? null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get app setting');
  }
}

export async function setAppSetting({
  key,
  value,
  updatedBy,
}: {
  key: string;
  value: string;
  updatedBy: string;
}): Promise<void> {
  try {
    await db
      .insert(appSettings)
      .values({ key, value, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy, updatedAt: new Date() },
      })
      .execute();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to set app setting');
  }
}

// Organization functions
export async function getOrgByDomain(domain: string): Promise<Org | null> {
  try {
    const orgs = await db
      .select()
      .from(org)
      .where(eq(org.domain, domain))
      .limit(1);
    return orgs[0] ?? null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get organization by domain',
    );
  }
}

export async function isVerifiedOrgEmail(email: string): Promise<boolean> {
  const domain = email.split('@')[1];
  if (!domain) return false;

  const organization = await getOrgByDomain(domain);
  return organization?.isActive ?? false;
}

// Daily usage tracking functions
export async function getDailyUsage({
  userId,
  date,
}: {
  userId: string;
  date: string; // YYYY-MM-DD format
}): Promise<number> {
  try {
    const usage = await db
      .select({ requestCount: dailyUsage.requestCount })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)))
      .limit(1)
      .execute();

    return Number.parseInt(usage[0]?.requestCount ?? '0', 10);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get daily usage');
  }
}

export async function incrementDailyUsage({
  userId,
  date,
}: {
  userId: string;
  date: string; // YYYY-MM-DD format
}): Promise<void> {
  try {
    // First, try to get existing usage
    const existing = await db
      .select()
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)))
      .limit(1);

    if (existing.length > 0) {
      // Update existing record
      const currentCount = Number.parseInt(existing[0].requestCount, 10);
      await db
        .update(dailyUsage)
        .set({
          requestCount: (currentCount + 1).toString(),
          updatedAt: new Date(),
        })
        .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.date, date)));
    } else {
      // Insert new record
      await db.insert(dailyUsage).values({
        userId,
        date,
        requestCount: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.error('Error incrementing daily usage:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to increment daily usage',
    );
  }
}

// Admin dashboard statistics
export async function getUserCount(): Promise<number> {
  try {
    const result = await db
      .select({ count: count(user.id) })
      .from(user)
      .execute();

    return result[0]?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get user count');
  }
}

export async function getAdminCount(): Promise<number> {
  try {
    // Count platform admins from the ADMIN_EMAILS list
    // Since this is stored in code, we'll return a static count for now
    // In a real implementation, you might want to store admin status in the database
    const result = await db
      .select({ count: count(user.id) })
      .from(user)
      .where(eq(user.email, 'hugo.paja05@gmail.com')) // Your admin email
      .execute();

    return result[0]?.count ?? 1; // Return at least 1 for the super admin
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get admin count');
  }
}

export async function getDailyRequestCount(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Sum up all request counts for today
    const totalResult = await db
      .select()
      .from(dailyUsage)
      .where(eq(dailyUsage.date, today))
      .execute();

    return totalResult.reduce(
      (sum, usage) => sum + Number.parseInt(usage.requestCount, 10),
      0,
    );
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get daily request count',
    );
  }
}

// Organization admin management
export async function getOrgAdmins(): Promise<
  (typeof orgAdmin.$inferSelect & { email: string })[]
> {
  try {
    const result = await db
      .select({
        id: orgAdmin.id,
        userId: orgAdmin.userId,
        orgId: orgAdmin.orgId,
        canManageUsers: orgAdmin.canManageUsers,
        canViewAnalytics: orgAdmin.canViewAnalytics,
        createdAt: orgAdmin.createdAt,
        email: user.email,
      })
      .from(orgAdmin)
      .innerJoin(user, eq(orgAdmin.userId, user.id))
      .execute();

    return result;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get organization admins',
    );
  }
}

export async function createOrgAdmin({
  userEmail,
  canManageUsers,
  canViewAnalytics,
}: {
  userEmail: string;
  canManageUsers: boolean;
  canViewAnalytics: boolean;
}): Promise<void> {
  try {
    // First, find or create the user
    let targetUser = await db
      .select()
      .from(user)
      .where(eq(user.email, userEmail))
      .limit(1)
      .execute();

    if (targetUser.length === 0) {
      // Create the user if they don't exist
      const newUsers = await db
        .insert(user)
        .values({
          email: userEmail,
          isVerified: true, // Assume org admins are verified
        })
        .returning({ id: user.id })
        .execute();

      targetUser = [{ id: newUsers[0].id, email: userEmail }] as any;
    }

    // Get the organization (assuming single org setup)
    const organizations = await db
      .select({ id: org.id })
      .from(org)
      .limit(1)
      .execute();

    if (organizations.length === 0) {
      throw new Error('No organization found');
    }

    // Create the org admin relationship
    await db
      .insert(orgAdmin)
      .values({
        userId: targetUser[0].id,
        orgId: organizations[0].id,
        canManageUsers,
        canViewAnalytics,
      })
      .execute();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create organization admin',
    );
  }
}

export async function removeOrgAdmin(orgAdminId: string): Promise<void> {
  try {
    await db.delete(orgAdmin).where(eq(orgAdmin.id, orgAdminId)).execute();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to remove organization admin',
    );
  }
}

export async function updateOrgAdminPermissions({
  orgAdminId,
  canManageUsers,
  canViewAnalytics,
}: {
  orgAdminId: string;
  canManageUsers?: boolean;
  canViewAnalytics?: boolean;
}): Promise<void> {
  try {
    const updateData: Partial<typeof orgAdmin.$inferInsert> = {};

    if (canManageUsers !== undefined) {
      updateData.canManageUsers = canManageUsers;
    }

    if (canViewAnalytics !== undefined) {
      updateData.canViewAnalytics = canViewAnalytics;
    }

    await db
      .update(orgAdmin)
      .set(updateData)
      .where(eq(orgAdmin.id, orgAdminId))
      .execute();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update organization admin permissions',
    );
  }
}

// User dashboard statistics
export async function getUserStatistics(userId: string) {
  try {
    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Get total chat count
    const chatCount = await db
      .select({ count: count(chat.id) })
      .from(chat)
      .where(eq(chat.userId, userId))
      .execute();

    // Get total message count
    const messageCount = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(and(eq(chat.userId, userId), eq(message.role, 'user')))
      .execute();

    // Get today's usage
    const todayUsage = await getDailyUsage({ userId, date: today });

    // Get this week's usage (last 7 days)
    const weeklyUsage = await getWeeklyUsage(userId);

    // Get this month's usage
    const monthlyUsage = await getMonthlyUsage(userId);

    // Get recent chats
    const recentChatsResult = await getChatsByUserId({
      id: userId,
      limit: 5,
      startingAfter: null,
      endingBefore: null
    });

    return {
      totalChats: chatCount[0]?.count ?? 0,
      totalMessages: messageCount[0]?.count ?? 0,
      todayUsage,
      weeklyUsage,
      monthlyUsage,
      recentChats: recentChatsResult.chats,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user statistics',
    );
  }
}

// Helper function for getting usage over a period of days
async function getUsageForPeriod(
  userId: string,
  days: number
): Promise<number> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateString = startDate.toISOString().split('T')[0];

  const usage = await db
    .select()
    .from(dailyUsage)
    .where(
      and(
        eq(dailyUsage.userId, userId),
        gte(dailyUsage.date, startDateString)
      )
    )
    .execute();

  return usage.reduce(
    (sum, day) => sum + Number.parseInt(day.requestCount, 10),
    0,
  );
}

export async function getWeeklyUsage(userId: string): Promise<number> {
  try {
    return await getUsageForPeriod(userId, 7);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get weekly usage',
    );
  }
}

export async function getMonthlyUsage(userId: string): Promise<number> {
  try {
    return await getUsageForPeriod(userId, 30);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get monthly usage',
    );
  }
}

export async function getUserDailyUsageHistory(
  userId: string,
  days = 7
): Promise<Array<{ date: string; count: number }>> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateString = startDate.toISOString().split('T')[0];

    const usage = await db
      .select({
        date: dailyUsage.date,
        requestCount: dailyUsage.requestCount,
      })
      .from(dailyUsage)
      .where(
        and(
          eq(dailyUsage.userId, userId),
          gte(dailyUsage.date, startDateString)
        )
      )
      .orderBy(asc(dailyUsage.date))
      .execute();

    // Fill in missing days with 0
    const usageMap = new Map(
      usage.map((u) => [u.date, Number.parseInt(u.requestCount, 10)])
    );

    const result: Array<{ date: string; count: number }> = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      result.push({
        date: dateString,
        count: usageMap.get(dateString) ?? 0,
      });
    }

    return result;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user daily usage history',
    );
  }
}
