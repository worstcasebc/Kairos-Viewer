import './styles.css';
import './print.css';
import { startApp } from './app';
import { tauriPlatform } from './platform/tauri';

startApp(document.getElementById('app')!, tauriPlatform());
