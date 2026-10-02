import type { NextRequest } from 'next/server';
import { app } from '@/server/app';

// Node is Vercel's default; the export is explicit so the runtime is not implicit.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = (req: NextRequest) => app.fetch(req);
export const POST = (req: NextRequest) => app.fetch(req);
