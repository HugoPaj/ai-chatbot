'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Plus, Users, Settings } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Organization {
  id: string;
  name: string;
  domain: string;
  type: 'university' | 'company';
  isActive: boolean;
  maxUsersPerDay: string;
  userCount?: number;
}

// Mock data for demonstration
const mockOrganizations: Organization[] = [
  {
    id: '1',
    name: 'Stanford University',
    domain: 'stanford.edu',
    type: 'university',
    isActive: true,
    maxUsersPerDay: '-1',
    userCount: 245,
  },
  {
    id: '2',
    name: 'Acme Corporation',
    domain: 'acme.com',
    type: 'company',
    isActive: true,
    maxUsersPerDay: '500',
    userCount: 78,
  },
];

export function OrgManagement() {
  const [organizations, setOrganizations] = useState(mockOrganizations);
  const [newOrg, setNewOrg] = useState({
    name: '',
    domain: '',
    type: 'university' as 'university' | 'company',
    maxUsersPerDay: '-1',
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleAddOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      const newOrgData: Organization = {
        id: Date.now().toString(),
        ...newOrg,
        isActive: true,
        userCount: 0,
      };

      setOrganizations([...organizations, newOrgData]);
      setNewOrg({ name: '', domain: '', type: 'university', maxUsersPerDay: '-1' });
    } catch (error) {
      console.error('Failed to add organization:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOrganization = async (orgId: string) => {
    try {
      setOrganizations(
        organizations.map((org) =>
          org.id === orgId ? { ...org, isActive: !org.isActive } : org
        )
      );
    } catch (error) {
      console.error('Failed to toggle organization:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5" />
          Organization Management
        </CardTitle>
        <CardDescription>
          Manage organizations that can access the platform
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Organization */}
        <form onSubmit={handleAddOrganization} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="Stanford University"
                value={newOrg.name}
                onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-domain">Email Domain</Label>
              <Input
                id="org-domain"
                placeholder="stanford.edu"
                value={newOrg.domain}
                onChange={(e) => setNewOrg({ ...newOrg, domain: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-type">Type</Label>
              <Select
                value={newOrg.type}
                onValueChange={(value: 'university' | 'company') =>
                  setNewOrg({ ...newOrg, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="university">University</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-users">Max Users/Day</Label>
              <Input
                id="max-users"
                placeholder="-1 for unlimited"
                value={newOrg.maxUsersPerDay}
                onChange={(e) => setNewOrg({ ...newOrg, maxUsersPerDay: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" disabled={isLoading} className="w-full">
            <Plus className="size-4 mr-2" />
            {isLoading ? 'Adding...' : 'Add Organization'}
          </Button>
        </form>

        {/* Organizations List */}
        <div className="space-y-4">
          <Label>Active Organizations ({organizations.length})</Label>
          <div className="space-y-3">
            {organizations.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{org.name}</h3>
                    <span className="text-xs bg-secondary px-2 py-1 rounded">
                      {org.type}
                    </span>
                    {org.isActive ? (
                      <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 px-2 py-1 rounded">
                        Active
                      </span>
                    ) : (
                      <span className="text-xs bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 px-2 py-1 rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{org.domain}</span>
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {org.userCount || 0} users
                    </span>
                    <span>
                      Limit: {org.maxUsersPerDay === '-1' ? 'Unlimited' : org.maxUsersPerDay}/day
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleOrganization(org.id)}
                  >
                    {org.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Usage Statistics */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {organizations.filter(org => org.isActive).length}
            </div>
            <div className="text-sm text-muted-foreground">Active Organizations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {organizations.reduce((sum, org) => sum + (org.userCount || 0), 0)}
            </div>
            <div className="text-sm text-muted-foreground">Total Users</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}