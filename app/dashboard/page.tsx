import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { AdminManagement } from '@/components/admin/admin-management';
import { OrgManagement } from '@/components/admin/org-management';
import { getUserEntitlements } from '@/lib/ai/user-entitlements';
import { isAdmin } from '@/lib/auth/admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Users, BarChart3, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getUserCount, getAdminCount, getDailyRequestCount } from '@/lib/db/queries';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const entitlements = await getUserEntitlements(session);
  const userIsAdmin = isAdmin(session);

  if (userIsAdmin) {
    // Fetch real data for admin dashboard
    const [userCount, adminCount, dailyRequests] = await Promise.all([
      getUserCount(),
      getAdminCount(),
      getDailyRequestCount()
    ]);
    return (
      <div className="container max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">
                Manage platform settings and user administration
              </p>
            </div>
            <Link href="/">
              <Button variant="outline" className="flex items-center gap-2">
                <ArrowLeft className="size-4" />
                Back to Chat
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Admin Users
                </CardTitle>
                <Shield className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{adminCount}</div>
                <p className="text-xs text-muted-foreground">
                  Platform administrators
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Users
                </CardTitle>
                <Users className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userCount}</div>
                <p className="text-xs text-muted-foreground">
                  Organization members
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Daily Requests
                </CardTitle>
                <BarChart3 className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dailyRequests}</div>
                <p className="text-xs text-muted-foreground">
                  AI chat requests today
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <AdminManagement />
            <OrgManagement />
          </div>
        </div>
      </div>
    );
  }

  // Regular user dashboard
  return (
    <div className="container max-w-4xl mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your organization dashboard
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>
              Your current access level and organization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Access Level:</span>
              <span className="text-sm bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 rounded-full">
                Organization User
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Daily Requests:</span>
              <span className="text-sm">Unlimited</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Organization:</span>
              <span className="text-sm">{session.user.email?.split('@')[1]}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Start using the AI chatbot with your organization account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              You now have unlimited access to all AI models and features.
              Click below to start your first conversation.
            </p>
            <a
              href="/"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            >
              Start Chatting
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
