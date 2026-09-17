import path from 'node:path';
import fs from 'node:fs';

export const root = path.resolve(import.meta.dirname, '..');
export function runtimeConfig() {
  for (const file of [path.join(root, '.env'), path.join(root, 'server/.env')]) {
    if (fs.existsSync(file)) process.loadEnvFile(file);
  }
  return {
    root,
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '127.0.0.1',
    workspace: path.resolve(root, process.env.MANGOAI_WORKSPACE || 'workspace'),
    data: path.resolve(root, process.env.MANGO_DATA_DIR || 'server/data'),
    qa: path.resolve(root, process.env.MANGOQA_DIR || '../MangoQA'),
    qaEnabled: process.env.MANGOQA_ENABLED !== 'false',
  };
}
