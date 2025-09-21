import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { isAdmin } from '@/lib/auth/admin';
import { getOrgAdmins, createOrgAdmin } from '@/lib/db/queries';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgAdmins = await getOrgAdmins();

    // Format the data for the frontend
    const formattedAdmins = orgAdmins.map((admin) => ({
      id: admin.id,
      email: admin.email,
      canManageUsers: admin.canManageUsers,
      canViewAnalytics: admin.canViewAnalytics,
      createdAt: admin.createdAt.toISOString().split('T')[0],
      isCurrentUser: admin.email === session.user.email,
    }));

    return NextResponse.json(formattedAdmins);
  } catch (error) {
    console.error('Error fetching org admins:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user || !isAdmin(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, canManageUsers, canViewAnalytics } = await request.json();

    if (!email || typeof canManageUsers !== 'boolean' || typeof canViewAnalytics !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    await createOrgAdmin({
      userEmail: email,
      canManageUsers,
      canViewAnalytics,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating org admin:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}