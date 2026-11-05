import React from 'react';
import ReactDOM from 'react-dom/client';
import { ResetRoot } from './components/ResetRoot';
import { applyTheme, readThemeForStartup } from './utils/appPreferences';
import './index.css';

class StartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidMount() {
    window.dispatchEvent(new Event('kadowaz-editor-ready'));
    window.electronAPI?.rendererReady?.();
  }
  componentDidCatch(error: Error) { console.error('[renderer] Startup error:', error); }
  render() {
    if (this.state.failed) return <main style={{ padding: 32, fontFamily: 'system-ui' }}><h1>Editor could not start</h1><p>Try reloading. If this continues, quit and restart the app.</p><button onClick={() => window.location.reload()}>Reload editor</button></main>;
    return this.props.children;
  }
}

const startupTheme = readThemeForStartup();
// Reconcile the splash with the editor, even after settings are cleared. Never
// replace a saved splash choice when the renderer's storage cannot be read.
void applyTheme(startupTheme.theme, startupTheme.storageAvailable).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupBoundary><ResetRoot /></StartupBoundary>
  </React.StrictMode>,
);
