'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Mail, Shield, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/components/toast';

// Mock admin data - replace with real data from your admin system
const mockAdmins = [
  { id: '1', email: 'hugo.paja05@gmail.com', role: 'Super Admin' },
];

export function AdminManagement() {
  const [admins, setAdmins] = useState(mockAdmins);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) {
      toast({
        type: 'error',
        description: 'Please enter an email address',
      });
      return;
    }

    if (!newAdminEmail.includes('@')) {
      toast({
        type: 'error',
        description: 'Please enter a valid email address',
      });
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Implement actual admin addition API call
      // const response = await fetch('/api/admin/add', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email: newAdminEmail }),
      // });

      // For now, just add to local state
      const newAdmin = {
        id: Date.now().toString(),
        email: newAdminEmail,
        role: 'Admin',
      };

      setAdmins([...admins, newAdmin]);
      setNewAdminEmail('');

      toast({
        type: 'success',
        description: `Added ${newAdminEmail} as admin`,
      });
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to add admin',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async (adminId: string, email: string) => {
    if (email === 'hugo.paja05@gmail.com') {
      toast({
        type: 'error',
        description: 'Cannot remove the super admin',
      });
      return;
    }

    try {
      // TODO: Implement actual admin removal API call
      setAdmins(admins.filter(admin => admin.id !== adminId));

      toast({
        type: 'success',
        description: `Removed ${email} as admin`,
      });
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to remove admin',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Admin Management
        </CardTitle>
        <CardDescription>
          Manage platform administrators who can access this dashboard and upload documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Admin */}
        <div className="space-y-3">
          <Label htmlFor="admin-email">Add New Admin</Label>
          <div className="flex gap-2">
            <Input
              id="admin-email"
              type="email"
              placeholder="admin@example.com"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddAdmin()}
            />
            <Button
              onClick={handleAddAdmin}
              disabled={isLoading}
              size="sm"
            >
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Admin users can access this dashboard and manage documents
          </p>
        </div>

        {/* Current Admins */}
        <div className="space-y-3">
          <Label>Current Administrators</Label>
          <div className="space-y-2">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{admin.email}</p>
                    <Badge variant="secondary" className="text-xs">
                      {admin.role}
                    </Badge>
                  </div>
                </div>
                {admin.email !== 'hugo.paja05@gmail.com' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-xs text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> Admin users need to be added to the admin configuration file
            (<code>lib/auth/admin.ts</code>) to gain full admin privileges.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}