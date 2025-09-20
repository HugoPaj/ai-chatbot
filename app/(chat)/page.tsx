import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { chatModels, getDefaultChatModelForUser } from '@/lib/ai/models';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { auth } from '../(auth)/auth';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  // Validate that the cookie contains a valid model ID and user has access
  const validModelIds = chatModels.map((m) => m.id);
  const userType = session?.user?.type || 'guest';
  const userAvailableModels =
    entitlementsByUserType[userType]?.availableChatModelIds || [];
  const isValidModelId =
    modelIdFromCookie?.value &&
    validModelIds.includes(modelIdFromCookie.value) &&
    userAvailableModels.includes(modelIdFromCookie.value);

  const defaultModelForUser = getDefaultChatModelForUser(
    userType,
    entitlementsByUserType,
  );

  if (!modelIdFromCookie || !isValidModelId) {
    return (
      <>
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          initialChatModel={defaultModelForUser}
          initialVisibilityType="private"
          isReadonly={false}
          session={session}
          autoResume={false}
        />
        <DataStreamHandler id={id} />
      </>
    );
  }

  return (
    <>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        initialChatModel={modelIdFromCookie.value}
        initialVisibilityType="private"
        isReadonly={false}
        session={session}
        autoResume={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
