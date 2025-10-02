import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { chatModels, getDefaultChatModelForUser } from '@/lib/ai/models';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import type { DBMessage } from '@/lib/db/schema';
import type { UIMessage } from 'ai';
import type { Attachment } from '@/lib/types';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (chat.visibility === 'private') {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  // Determine if auto-resume should be enabled
  // Only enable if the last message is from user AND there's no corresponding assistant response
  const shouldAutoResume =
    messagesFromDb.length > 0 &&
    messagesFromDb[messagesFromDb.length - 1]?.role === 'user';

  function convertToUIMessages(messages: Array<DBMessage>): Array<any> {
    return messages.map((message) => {
      // Extract text content from parts array for AI SDK v5 compatibility
      const textContent =
        (message.parts as Array<{ type: string; text?: string }>)
          ?.filter((part) => part.type === 'text' && part.text)
          .map((part) => part.text || '')
          .join('\n') || '';

      // Ensure parts array has valid structure - only add text to text parts
      const validParts =
        (message.parts as Array<any>)?.map((part) => {
          if (part.type === 'text') {
            return {
              ...part,
              text: part.text || '', // Ensure text is always a string
            };
          }
          // Keep data parts and other part types as-is
          return part;
        }) || [];

      const result: any = {
        id: message.id,
        parts: validParts,
        role: message.role as UIMessage['role'],
        createdAt: message.createdAt,
      };

      // Add content for backward compatibility where needed
      if (textContent) {
        result.content = textContent;
      }

      // Add experimental_attachments if attachments exist (for v5 compatibility)
      if (
        message.attachments &&
        Array.isArray(message.attachments) &&
        message.attachments.length > 0
      ) {
        (result as any).experimental_attachments =
          message.attachments as Array<Attachment>;
      }

      return result;
    });
  }

  // Extract citations from messages for initial load
  // Keep ungrouped to match inline citation numbers [1], [2], etc. in the text
  const initialCitations = messagesFromDb
    .filter((msg) => msg.role === 'assistant')
    .flatMap((msg) => {
      const parts = msg.parts as Array<any>;
      const citationPart = parts?.find(
        (part) =>
          part.type === 'data' &&
          part.data?.type === 'citations' &&
          Array.isArray(part.data?.citations)
      );
      return citationPart?.data?.citations || [];
    });

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');

  // Validate that the cookie contains a valid model ID and user has access
  const validModelIds = chatModels.map((m) => m.id);
  const userType = session?.user?.type || 'guest';
  const userAvailableModels =
    entitlementsByUserType[userType]?.availableChatModelIds || [];
  const isValidModelId =
    chatModelFromCookie?.value &&
    validModelIds.includes(chatModelFromCookie.value) &&
    userAvailableModels.includes(chatModelFromCookie.value);

  const defaultModelForUser = getDefaultChatModelForUser(
    userType,
    entitlementsByUserType,
  );

  if (!chatModelFromCookie || !isValidModelId) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={convertToUIMessages(messagesFromDb)}
          initialChatModel={defaultModelForUser}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
          session={session}
          autoResume={shouldAutoResume}
        />
        <DataStreamHandler id={id} initialCitations={initialCitations} />
      </>
    );
  }

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={convertToUIMessages(messagesFromDb)}
        initialChatModel={chatModelFromCookie.value}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        session={session}
        autoResume={shouldAutoResume}
      />
      <DataStreamHandler id={id} initialCitations={initialCitations} />
    </>
  );
}
