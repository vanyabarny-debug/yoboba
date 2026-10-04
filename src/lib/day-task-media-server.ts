import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dir = join(process.cwd(), 'data', 'day-task-media');

const types: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export function media_content_type(ext: string) {
  return types[ext] || 'application/octet-stream';
}

export function ext_for_mime(mime: string, name: string): string | null {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  if (map[mime]) return map[mime];
  const from_name = name.split('.').pop()?.toLowerCase() || '';
  if (from_name === 'jpeg') return 'jpg';
  if (types[from_name]) return from_name;
  return null;
}

function safe_id(id: string) {
  return /^[a-zA-Z0-9-]{8,80}$/.test(id);
}

export function save_day_task_media(id: string, ext: string, bytes: Buffer) {
  if (!safe_id(id) || !types[ext]) throw new Error('неверный файл');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.${ext}`), bytes);
}

export function read_day_task_media(id: string): { bytes: Buffer; ext: string } | null {
  if (!safe_id(id) || !existsSync(dir)) return null;
  const name = readdirSync(dir).find((file) => file.startsWith(`${id}.`));
  if (!name) return null;
  const ext = name.slice(id.length + 1);
  if (!types[ext]) return null;
  return { bytes: readFileSync(join(dir, name)), ext };
}
