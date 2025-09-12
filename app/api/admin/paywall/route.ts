import { type NextRequest, NextResponse } from 'next/server';
import { isPaywallEnabled, setPaywallEnabled } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { isAdminFromHeaders } from '@/lib/middleware/user-info';

export async function GET(request: NextRequest) {
  try {
    // Check admin status from middleware headers (more efficient)
    if (!isAdminFromHeaders(request)) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const enabled = await isPaywallEnabled();

    return NextResponse.json({
      paywallEnabled: enabled,
      success: true,
    });
  } catch (error) {
    console.error('Error getting paywall status:', error);
    return new ChatSDKError('offline:api').toResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin status from middleware headers (more efficient)
    if (!isAdminFromHeaders(request)) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    // Get user ID from middleware headers
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const { enabled } = await request.json();

    if (typeof enabled !== 'boolean') {
      return new ChatSDKError('bad_request:api').toResponse();
    }

    await setPaywallEnabled(enabled, userId);

    return NextResponse.json({
      paywallEnabled: enabled,
      success: true,
      message: enabled
        ? 'Paywall enabled'
        : 'Paywall disabled - all users now have unlimited access',
    });
  } catch (error) {
    console.error('Error toggling paywall:', error);
    return new ChatSDKError('offline:api').toResponse();
  }
}
