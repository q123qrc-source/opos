import { useOS } from '../store/useOS';
import { extname } from './vfs';

const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'json', 'css', 'html', 'md', 'py', 'sh', 'yml', 'yaml', 'csv', 'm3u', 'txt', '']);

/** Opens a VFS path with the most appropriate app. */
export function openFile(path: string) {
  const ext = extname(path);
  const { launch } = useOS.getState();
  if (ext === 'doc' || ext === 'opdoc') return launch('writer', { path });
  if (['png', 'jpg', 'jpeg', 'img'].includes(ext)) return launch('photo', { path });
  if (ext === 'txt' && useOS.getState().mode === 'mobile') return launch('notes', { path });
  if (CODE_EXT.has(ext)) return launch('code', { path });
  return launch('code', { path });
}
