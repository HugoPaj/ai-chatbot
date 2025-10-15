'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Mail, Lock, AlertCircle } from 'lucide-react';
import { normalizeEmail } from '@/lib/db/utils';

interface OrgSignInFormProps {
  redirectUrl?: string;
}

export function OrgSignInForm({ redirectUrl }: OrgSignInFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Validate organization email format
    const normalizedEmail = normalizeEmail(email);
    const domain = normalizedEmail.split('@')[1];
    if (!domain || !email.includes('@')) {
      setError('Please enter a valid organization email address');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid credentials or unverified organization email');
      } else {
        // Redirect to intended page or home
        window.location.href = redirectUrl || '/';
      }
    } catch (error) {
      setError('An error occurred during sign in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center my-4">
          <CardTitle>Sign in to your organization</CardTitle>
          <CardDescription className="pt-2">
            Access is limited to verified email addresses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {process.env.NEXT_PUBLIC_MICROSOFT_SSO_ENABLED === 'true' && (
            <>
              <Button
                type="button"
                onClick={() =>
                  signIn('microsoft-entra-id', { callbackUrl: redirectUrl || '/' })
                }
                className="w-full"
                variant="outline"
              >
                <svg className="mr-2 size-4" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
                Sign in with Microsoft
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with email
                  </span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="size-4" />
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder=""
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="size-4" />
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                placeholder=""
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                <AlertCircle className="size-4" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Need an account? Reach out to your IT team for assistance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
