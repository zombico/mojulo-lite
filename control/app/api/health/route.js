import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const templatePath =
    process.env.LITE_TEMPLATE_PATH || path.resolve(process.cwd(), '..', 'lite-template');
  return NextResponse.json({
    ok: true,
    templateReady: fs.existsSync(templatePath),
    templatePath,
    ts: Date.now(),
  });
}
