import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { safePath } from '../config.js';

export interface ReadFullResult {
  content: string;
  lines: string[];
  size: number;
  mtime: Date;
}

export async function readFileFull(filePath: string): Promise<ReadFullResult> {
  const fullPath = safePath(filePath, 'filePath');
  const [content, stats] = await Promise.all([fs.readFile(fullPath, 'utf-8'), fs.stat(fullPath)]);
  return {
    content,
    lines: content.split('\n'),
    size: stats.size,
    mtime: stats.mtime,
  };
}

/** Best-effort backup. Returns the backup path, or null on failure. */
export async function backupFile(fullPath: string): Promise<string | null> {
  const backupPath = `${fullPath}.backup.${Date.now()}`;
  try {
    await fs.copyFile(fullPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Write a file atomically: write to a tmp path, then rename. Ensures the
 * parent directory exists. Returns the temp path so callers can clean up
 * on validation failure.
 */
export async function atomicWriteFile(fullPath: string, content: string): Promise<string> {
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const tempPath = `${fullPath}.tmp.${Date.now()}.${process.pid}`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, fullPath);
  return tempPath;
}
