import './styles.css';
import './print.css';
import './web.css';
import { startApp } from './app';
import { webPlatform } from './platform/web';
import { readProject } from './web/reader';
import { loadSqlJs } from './web/sqlite-inline';

startApp(
  document.getElementById('app')!,
  webPlatform({ readProject: async (bytes) => readProject(bytes, await loadSqlJs()) }),
  { privacyNote: 'Ihre Datei wird ausschließlich in Ihrem Browser verarbeitet und nicht übertragen.' },
);
