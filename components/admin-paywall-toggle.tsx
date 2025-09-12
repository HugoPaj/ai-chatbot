'use client';

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Shield, ShieldOff } from 'lucide-react';

interface PaywallToggleProps {
  isAdmin: boolean;
}

export function AdminPaywallToggle({ isAdmin }: PaywallToggleProps) {
  const [paywallEnabled, setPaywallEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  // Fetch current paywall status
  useEffect(() => {
    if (!isAdmin) return;

    const fetchPaywallStatus = async () => {
      try {
        const response = await fetch('/api/admin/paywall');
        if (response.ok) {
          const data = await response.json();
          setPaywallEnabled(data.paywallEnabled);
        }
      } catch (error) {
        console.error('Error fetching paywall status:', error);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchPaywallStatus();
  }, [isAdmin]);

  const togglePaywall = async (enabled: boolean) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/paywall', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        const data = await response.json();
        setPaywallEnabled(enabled);
        toast.success(data.message);
      } else {
        throw new Error('Failed to toggle paywall');
      }
    } catch (error) {
      toast.error('Failed to toggle paywall');
      console.error('Error toggling paywall:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin || initialLoading) {
    return null;
  }

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center justify-between space-x-2">
        <div className="flex items-center space-x-2">
          {paywallEnabled ? (
            <Shield className="h-4 w-4 text-green-600" />
          ) : (
            <ShieldOff className="h-4 w-4 text-orange-600" />
          )}
          <Label htmlFor="paywall-toggle" className="text-xs font-medium">
            Paywall
          </Label>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={loading}
            >
              {paywallEnabled ? 'Enabled' : 'Disabled'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {paywallEnabled ? 'Disable Paywall?' : 'Enable Paywall?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {paywallEnabled
                  ? 'This will give all users unlimited access to the chatbot. You can re-enable the paywall at any time.'
                  : 'This will enforce daily request limits for non-premium users. Free users will be limited to 5 requests per day.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => togglePaywall(!paywallEnabled)}
                disabled={loading}
              >
                {paywallEnabled ? 'Disable Paywall' : 'Enable Paywall'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="mt-1">
        <p className="text-xs text-muted-foreground">
          {paywallEnabled
            ? 'Users limited to 5 requests/day'
            : 'All users have unlimited access'}
        </p>
      </div>
    </div>
  );
}
