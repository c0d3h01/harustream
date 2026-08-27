import { NextResponse } from 'next/server';
import { listProviders } from '@/providers/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    uptime: process.uptime(),
    providerCount: listProviders().length,
  });
}
