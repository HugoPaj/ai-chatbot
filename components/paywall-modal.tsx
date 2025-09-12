'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Crown, Users, Zap } from 'lucide-react';

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userType: 'guest' | 'free';
  dailyUsage: number;
  maxDaily: number;
}

export function PaywallModal({
  open,
  onOpenChange,
  userType,
  dailyUsage,
  maxDaily,
}: PaywallModalProps) {
  const [loading, setLoading] = useState(false);

  const isGuest = userType === 'guest';

  const handleUpgrade = async () => {
    setLoading(true);

    if (isGuest) {
      // Redirect guests to registration
      window.location.href = '/register';
      return;
    }

    try {
      // For logged-in users, start Stripe checkout
      const priceId = process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID;

      if (!priceId) {
        console.error('Stripe price ID not configured');
        window.location.href = '/dashboard';
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
        // Fallback to dashboard
        window.location.href = '/dashboard';
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      // Fallback to dashboard where user can try again
      window.location.href = '/dashboard';
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Crown className="size-5 text-yellow-500" />
            Daily Limit Reached
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isGuest
              ? `You've used all ${maxDaily} free requests for today as a guest user.`
              : `You've used all ${maxDaily} free requests for today.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-2xl font-bold text-muted-foreground">
              {dailyUsage} / {maxDaily}
            </div>
            <div className="text-sm text-muted-foreground">
              requests used today
            </div>
          </div>

          {isGuest ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <Users className="size-5 text-blue-600" />
                <div>
                  <div className="font-medium text-sm">
                    Create a Free Account
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Get 5 requests per day
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <Crown className="size-5 text-yellow-600" />
                <div>
                  <div className="font-medium text-sm">Upgrade to Premium</div>
                  <div className="text-xs text-muted-foreground">
                    Unlimited requests
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <Zap className="size-5 text-yellow-600" />
                <div>
                  <div className="font-medium text-sm">Upgrade to Premium</div>
                  <div className="text-xs text-muted-foreground">
                    Get unlimited requests for just $9.99/month
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button onClick={handleUpgrade} disabled={loading}>
            {loading
              ? 'Loading...'
              : isGuest
                ? 'Create Account'
                : 'Upgrade Now'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
