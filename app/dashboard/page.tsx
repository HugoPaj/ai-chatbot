import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { SubscriptionDashboard } from '@/components/subscription-dashboard';
import { getUserSubscription, getDailyUsage } from '@/lib/db/queries';
import { getUserEntitlements } from '@/lib/ai/user-entitlements';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  // Await the searchParams promise
  const params = await searchParams;

  // Get user's subscription and usage data
  const subscription = await getUserSubscription(session.user.id);
  const entitlements = await getUserEntitlements(session);

  // Get today's usage
  const today = new Date().toISOString().split('T')[0];
  const dailyUsage = await getDailyUsage({
    userId: session.user.id,
    date: today,
  });

  const subscriptionInfo = {
    isSubscribed: subscription !== null,
    planName: subscription ? 'Premium' : undefined,
    status: subscription?.status,
    currentPeriodEnd: subscription?.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
    dailyUsage,
    maxDaily: entitlements.maxMessagesPerDay,
  };

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your subscription and view your usage statistics
          </p>
        </div>

        {/* Success/Cancel Messages */}
        {params.success && (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h3 className="font-medium text-green-800 dark:text-green-200">
              Subscription Activated!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-300">
              Welcome to Premium! You now have unlimited access to all features.
            </p>
          </div>
        )}

        {params.canceled && (
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <h3 className="font-medium text-orange-800 dark:text-orange-200">
              Subscription Canceled
            </h3>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Your subscription upgrade was canceled. You can try again anytime.
            </p>
          </div>
        )}

        <SubscriptionDashboard subscription={subscriptionInfo} />
      </div>
    </div>
  );
}
