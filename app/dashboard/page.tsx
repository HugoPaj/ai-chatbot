import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';
import { AdminManagement } from '@/components/admin/admin-management';
import { OrgManagement } from '@/components/admin/org-management';
import { isAdmin } from '@/lib/auth/admin';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Users,
  BarChart3,
  ArrowLeft,
  MessageSquare,
  Zap,
  TrendingUp,
  Clock,
  ChevronRight,
  Calendar,
  Activity,
} from 'lucide-react';
import Link from 'next/link';
import {
  getUserCount,
  getAdminCount,
  getDailyRequestCount,
  getUserStatistics,
  getUserDailyUsageHistory,
} from '@/lib/db/queries';
import { formatDate } from '@/lib/utils';

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const userIsAdmin = isAdmin(session);

  if (userIsAdmin) {
    // Fetch real data for admin dashboard
    const [userCount, adminCount, dailyRequests] = await Promise.all([
      getUserCount(),
      getAdminCount(),
      getDailyRequestCount(),
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
  const userId = session.user.id;
  const userEmail = session.user.email || '';

  const [userStats, usageHistory] = await Promise.all([
    getUserStatistics(userId || ''),
    getUserDailyUsageHistory(userId || '', 7),
  ]);

  // Get max value for chart scaling
  const maxUsage = Math.max(...usageHistory.map((d) => d.count), 1);

  return (
    <div className="min-h-screen">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {userEmail.split('@')[0]}
            </p>
          </div>
          <Link href="/">
            <Button>
              <MessageSquare className="size-4 mr-2" />
              New Chat
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Today&apos;s Requests
              </CardTitle>
              <Zap className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.todayUsage}</div>
              <p className="text-xs text-muted-foreground">
                AI interactions today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Weekly Activity
              </CardTitle>
              <Activity className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.weeklyUsage}</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Chats</CardTitle>
              <MessageSquare className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userStats.totalChats}</div>
              <p className="text-xs text-muted-foreground">
                All-time conversations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Messages Sent
              </CardTitle>
              <TrendingUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {userStats.totalMessages}
              </div>
              <p className="text-xs text-muted-foreground">
                Total interactions
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Usage Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Usage Overview</CardTitle>
              <CardDescription>
                Your activity over the last 7 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <div className="flex items-end justify-between h-full gap-2">
                  {usageHistory.map((day, index) => (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-2"
                    >
                      <div
                        className="w-full bg-muted rounded-t flex items-end justify-center"
                        style={{ height: '160px' }}
                      >
                        <div
                          className="w-full bg-primary rounded-t transition-all duration-300 hover:opacity-80"
                          style={{
                            height: `${maxUsage > 0 ? (day.count / maxUsage) * 100 : 0}%`,
                            minHeight: day.count > 0 ? '4px' : '0',
                          }}
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">
                          {index === 0
                            ? formatDate(day.date).split(',')[0]
                            : index === usageHistory.length - 1
                              ? 'Today'
                              : formatDate(day.date).split(',')[0]}
                        </p>
                        <p className="text-xs font-medium">{day.count}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/" className="block">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Start New Chat</p>
                      <p className="text-xs text-muted-foreground">
                        Create a new conversation
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>

              <Link href="/" className="block">
                <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <Clock className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Chat History</p>
                      <p className="text-xs text-muted-foreground">
                        View previous conversations
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>

              <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <Calendar className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Usage Reports</p>
                    <p className="text-xs text-muted-foreground">Coming soon</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Conversations */}
        {userStats.recentChats.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Recent Conversations</CardTitle>
              <CardDescription>Your latest chat sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userStats.recentChats.map((chat) => (
                  <Link key={chat.id} href={`/chat/${chat.id}`}>
                    <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium line-clamp-1">
                            {chat.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(chat.createdAt).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              },
                            )}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
              {userStats.totalChats > 5 && (
                <div className="mt-4 pt-4 border-t">
                  <Link href="/">
                    <Button variant="outline" className="w-full" size="sm">
                      View All Conversations
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Account Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Account Type
                </span>
                <div className="flex items-center gap-2">
                  <Shield className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Organization User</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Organization
                </span>
                <span className="text-sm font-medium">
                  {userEmail.split('@')[1] || 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Access Level
                </span>
                <span className="text-sm font-medium">Unlimited</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
