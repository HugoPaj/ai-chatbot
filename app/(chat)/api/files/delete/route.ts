import { del } from '@/lib/r2';
import { NextResponse } from 'next/server';

import { auth } from '@/app/(auth)/auth';

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { pathname } = await request.json();

    if (!pathname) {
      return NextResponse.json(
        { error: 'No pathname provided' },
        { status: 400 },
      );
    }

    await del(pathname);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 },
    );
  }
}
