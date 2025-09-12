import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getUserSubscription } from '@/lib/db/queries';
import { createCustomerPortalSession } from '@/lib/stripe/subscription';
import { ChatSDKError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:api').toResponse();
    }

    // Get user's subscription to find their Stripe customer ID
    const subscription = await getUserSubscription(session.user.id);

    if (!subscription?.stripeCustomerId) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const portalSession = await createCustomerPortalSession(
      subscription.stripeCustomerId,
      `${baseUrl}/dashboard`,
    );

    return NextResponse.json({
      url: portalSession.url,
    });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    return new ChatSDKError('offline:api').toResponse();
  }
}
