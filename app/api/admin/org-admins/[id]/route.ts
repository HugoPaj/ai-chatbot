import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { isAdmin } from '@/lib/auth/admin';
import { removeOrgAdmin, updateOrgAdminPermissions } from '@/lib/db/queries';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await removeOrgAdmin(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing org admin:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();

    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { canManageUsers, canViewAnalytics } = await request.json();

    const { id } = await params;
    await updateOrgAdminPermissions({
      orgAdminId: id,
      canManageUsers,
      canViewAnalytics,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating org admin permissions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
