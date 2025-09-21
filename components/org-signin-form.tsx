'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Mail, Lock, AlertCircle } from 'lucide-react';

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
    const domain = email.split('@')[1];
    if (!domain || !email.includes('@')) {
      setError('Please enter a valid organization email address');
      setIsLoading(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        email,
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
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Building2 className="size-8 text-blue-600" />
            <h1 className="text-2xl font-bold">Organization Access</h1>
          </div>
          <CardTitle>Sign in with your organization account</CardTitle>
          <CardDescription>
            Access is limited to verified university and company email addresses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="size-4" />
                Organization Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.name@university.edu"
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

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <h3 className="font-medium mb-2">Verified Organizations Include:</h3>
              <ul className="space-y-1 text-xs">
                <li>• University email addresses (.edu)</li>
                <li>• Verified company domains</li>
                <li>• Research institution emails</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Access is restricted to users with verified organization accounts.
              Contact your administrator if you need access.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}