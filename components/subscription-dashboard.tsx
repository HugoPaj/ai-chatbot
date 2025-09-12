'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Crown,
  CreditCard,
  Calendar,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface SubscriptionInfo {
  isSubscribed: boolean;
  planName?: string;
  status?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  dailyUsage: number;
  maxDaily: number;
}

interface SubscriptionDashboardProps {
  subscription: SubscriptionInfo;
  onSubscriptionChange?: () => void;
}

export function SubscriptionDashboard({
  subscription,
  onSubscriptionChange,
}: SubscriptionDashboardProps) {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      // Get the premium price ID from environment or API
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID;

      if (!priceId) {
        toast.error(
          'Subscription configuration error. Please contact support.',
        );
        return;
      }

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
      });

      if (!response.ok) {
        throw new Error('Failed to create checkout session');
      }

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error('Failed to start subscription process. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create customer portal session');
      }

      const { url } = await response.json();

      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No portal URL received');
      }
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      toast.error('Failed to open subscription management. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = () => {
    if (!subscription.isSubscribed) {
      return <Badge variant="secondary">Free</Badge>;
    }

    switch (subscription.status) {
      case 'active':
        return (
          <Badge variant="default" className="bg-green-600">
            Active
          </Badge>
        );
      case 'trialing':
        return (
          <Badge variant="default" className="bg-blue-600">
            Trial
          </Badge>
        );
      case 'past_due':
        return <Badge variant="destructive">Past Due</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{subscription.status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>
            Manage your subscription and billing information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {subscription.isSubscribed
                  ? subscription.planName
                  : 'Free Plan'}
              </p>
              <p className="text-sm text-muted-foreground">
                {subscription.isSubscribed
                  ? 'Unlimited requests per day'
                  : `${subscription.maxDaily} requests per day`}
              </p>
            </div>
            {getStatusBadge()}
          </div>

          {subscription.isSubscribed && subscription.currentPeriodEnd && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {subscription.cancelAtPeriodEnd ? 'Expires' : 'Renews'} on{' '}
                {formatDate(subscription.currentPeriodEnd)}
              </span>
            </div>
          )}

          <Separator />

          {/* Usage Statistics */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Daily Usage</span>
              <span>
                {subscription.dailyUsage} /{' '}
                {subscription.maxDaily === -1 ? '∞' : subscription.maxDaily}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width:
                    subscription.maxDaily === -1
                      ? '0%'
                      : `${Math.min((subscription.dailyUsage / subscription.maxDaily) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          {subscription.isSubscribed ? (
            <Button
              onClick={handleManageSubscription}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Subscription
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full"
            >
              <Crown className="h-4 w-4 mr-2" />
              {loading ? 'Loading...' : 'Upgrade to Premium'}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Upgrade Benefits */}
      {!subscription.isSubscribed && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Premium Benefits
            </CardTitle>
            <CardDescription>
              Unlock unlimited access and premium features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                'Unlimited chat requests per day',
                'Priority customer support',
                'Access to advanced AI models',
                'No daily usage limits',
                'Early access to new features',
              ].map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full"
            >
              <Crown className="h-4 w-4 mr-2" />
              Start Premium - $9.99/month
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Subscription Status Warnings */}
      {subscription.isSubscribed &&
        subscription.cancelAtPeriodEnd &&
        subscription.currentPeriodEnd && (
          <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
                <AlertCircle className="h-5 w-5" />
                Subscription Ending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Your subscription will end on{' '}
                {formatDate(subscription.currentPeriodEnd)}. You will lose
                access to premium features after this date.
              </p>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleManageSubscription}
                disabled={loading}
                variant="outline"
                className="w-full"
              >
                Reactivate Subscription
              </Button>
            </CardFooter>
          </Card>
        )}
    </div>
  );
}
