'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCog, Plus, Mail, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/toast';

interface OrgAdmin {
  id: string;
  email: string;
  canManageUsers: boolean;
  canViewAnalytics: boolean;
  createdAt: string;
  isCurrentUser?: boolean;
}

export function OrgManagement() {
  const [orgAdmins, setOrgAdmins] = useState<OrgAdmin[]>([]);
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    canManageUsers: true,
    canViewAnalytics: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Fetch organization admins on component mount
  useEffect(() => {
    fetchOrgAdmins();
  }, []);

  const fetchOrgAdmins = async () => {
    try {
      setIsLoadingData(true);
      const response = await fetch('/api/admin/org-admins');
      if (response.ok) {
        const data = await response.json();
        setOrgAdmins(data);
      } else {
        toast({
          type: 'error',
          description: 'Failed to load organization admins',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to load organization admins',
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleAddOrgAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAdmin.email.trim()) {
      toast({
        type: 'error',
        description: 'Please enter an email address',
      });
      return;
    }

    if (!newAdmin.email.includes('@')) {
      toast({
        type: 'error',
        description: 'Please enter a valid email address',
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/org-admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newAdmin.email,
          canManageUsers: newAdmin.canManageUsers,
          canViewAnalytics: newAdmin.canViewAnalytics,
        }),
      });

      if (response.ok) {
        setNewAdmin({ email: '', canManageUsers: true, canViewAnalytics: true });
        await fetchOrgAdmins(); // Refresh the list

        toast({
          type: 'success',
          description: `Added ${newAdmin.email} as organization admin`,
        });
      } else {
        toast({
          type: 'error',
          description: 'Failed to add organization admin',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to add organization admin',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveOrgAdmin = async (adminId: string, email: string, isCurrentUser?: boolean) => {
    if (isCurrentUser) {
      toast({
        type: 'error',
        description: 'Cannot remove yourself as admin',
      });
      return;
    }

    try {
      const response = await fetch(`/api/admin/org-admins/${adminId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchOrgAdmins(); // Refresh the list

        toast({
          type: 'success',
          description: `Removed ${email} as organization admin`,
        });
      } else {
        toast({
          type: 'error',
          description: 'Failed to remove organization admin',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to remove organization admin',
      });
    }
  };

  const handleUpdatePermissions = async (adminId: string, canManageUsers: boolean, canViewAnalytics: boolean) => {
    try {
      const response = await fetch(`/api/admin/org-admins/${adminId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          canManageUsers,
          canViewAnalytics,
        }),
      });

      if (response.ok) {
        await fetchOrgAdmins(); // Refresh the list

        toast({
          type: 'success',
          description: 'Permissions updated successfully',
        });
      } else {
        toast({
          type: 'error',
          description: 'Failed to update permissions',
        });
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to update permissions',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="size-5" />
          Organization Admin Roles
        </CardTitle>
        <CardDescription>
          Manage admin roles and permissions within your organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Organization Admin */}
        <form onSubmit={handleAddOrgAdmin} className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <Label className="text-sm font-medium">Add Organization Administrator</Label>

          <div className="space-y-3">
            <div>
              <Label htmlFor="admin-email" className="text-xs">Email Address</Label>
              <Input
                id="admin-email"
                type="email"
                placeholder="admin@yourorg.com"
                value={newAdmin.email}
                onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Can Manage Users</Label>
                <Select
                  value={newAdmin.canManageUsers.toString()}
                  onValueChange={(value) => setNewAdmin({ ...newAdmin, canManageUsers: value === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Can View Analytics</Label>
                <Select
                  value={newAdmin.canViewAnalytics.toString()}
                  onValueChange={(value) => setNewAdmin({ ...newAdmin, canViewAnalytics: value === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} size="sm" className="w-full">
              <Plus className="size-4 mr-2" />
              {isLoading ? 'Adding...' : 'Add Organization Admin'}
            </Button>
          </div>
        </form>

        {/* Current Organization Admins */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Current Organization Admins ({orgAdmins.length})</Label>

          {isLoadingData ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-muted-foreground">Loading organization admins...</div>
            </div>
          ) : orgAdmins.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No organization admins found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orgAdmins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Mail className="size-4 text-muted-foreground" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{admin.email}</p>
                      {admin.isCurrentUser && (
                        <Badge variant="secondary" className="text-xs">You</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Added: {admin.createdAt}</span>
                      <span>•</span>
                      <div className="flex gap-1">
                        {admin.canManageUsers && (
                          <Badge variant="outline" className="text-xs">User Management</Badge>
                        )}
                        {admin.canViewAnalytics && (
                          <Badge variant="outline" className="text-xs">Analytics</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Select
                    value={admin.canManageUsers ? 'manage' : admin.canViewAnalytics ? 'view' : 'none'}
                    onValueChange={(value) => {
                      const canManage = value === 'manage';
                      const canView = value === 'view' || value === 'manage';
                      handleUpdatePermissions(admin.id, canManage, canView);
                    }}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manage">Full Access</SelectItem>
                      <SelectItem value="view">View Only</SelectItem>
                      <SelectItem value="none">Limited</SelectItem>
                    </SelectContent>
                  </Select>

                  {!admin.isCurrentUser && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOrgAdmin(admin.id, admin.email, admin.isCurrentUser)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <p className="text-xs text-blue-800 dark:text-blue-200">
            <strong>Organization Admins</strong> can manage users within your organization and access analytics.
            Platform Admins (defined in code) have full system access including this dashboard.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}