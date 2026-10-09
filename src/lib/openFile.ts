import { useOS } from '../store/useOS';
import { fsapi } from './fsapi';
import { extname } from './vfs';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'img']);
const WRITER_EXT = new Set(['doc', 'opdoc']);
const CODE_EXT = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'json', 'css', 'scss', 'html', 'htm', 'xml', 'md', 'py', 'sh', 'bash', 'zsh',
  'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'csv', 'tsv', 'm3u', 'txt', 'log', 'c', 'h', 'cpp', 'hpp', 'rs', 'go',
  'java', 'kt', 'rb', 'php', 'lua', 'sql', 'env', 'gitignore', 'desktop', 'service',
]);
/** Audio files would go to Music if it accepted a `path` param; it currently does not, so they fall through. */
const MUSIC_ACCEPTS_PATH = false;
const AUDIO_EXT = new Set(['mp3', 'ogg', 'flac', 'wav', 'm4a']);

function openExternally(path: string) {
  fsapi.openExternal!(path).catch((e: Error) => useOS.getState().notify('Could not open file', e?.message ?? String(e)));
}

/** Opens a path (real FS in a session, VFS in the browser) with the most appropriate app. */
export function openFile(path: string) {
  const ext = extname(path);
  const { launch, mode } = useOS.getState();
  if (WRITER_EXT.has(ext)) return launch('writer', { path });
  if (IMAGE_EXT.has(ext)) return launch('photo', { path });
  if (MUSIC_ACCEPTS_PATH && AUDIO_EXT.has(ext)) return launch('music', { path });
  if (ext === 'txt' && mode === 'mobile') return launch('notes', { path });
  if (ext && CODE_EXT.has(ext)) return launch('code', { path });
  // Not handled by an OPOS app: hand it to the system default app when we're on a real FS.
  if (fsapi.real && fsapi.openExternal) return openExternally(path);
  return launch('code', { path });
}
