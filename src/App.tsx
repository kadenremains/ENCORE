import { lazy, Suspense, useEffect } from 'react';
import { useApp } from './store';
import { useRoute } from './router';
import { Onboard } from './views/Onboard';
import { Shell } from './views/Shell';
import { Overview } from './views/stats/Overview';
import { TopView } from './views/stats/TopView';
import { EntityView } from './views/stats/EntityView';
import { Listening } from './views/stats/Listening';
import { Records } from './views/stats/Records';
import { FirstSync } from './views/FirstSync';
import { initCloud, setOnSignedIn } from './lib/cloud';
import { runMaintenance } from './lib/maintenance';
import { useEditor } from './editor/editorStore';
import { usePrefs } from './lib/prefs';
import { applyAppSettings, getAppSettings } from './lib/appSettings';
import { applyUpdate, startUpdateChecks, useUpdate } from './lib/updates';

// loaded when first opened: Create and the wrapped editor (graphics renderer, image exporter) and Settings
const Editor = lazy(() => import('./views/Editor').then((m) => ({ default: m.Editor })));
const Create = lazy(() => import('./views/Create').then((m) => ({ default: m.Create })));
const Settings = lazy(() => import('./views/Settings').then((m) => ({ default: m.Settings })));
const loading = (
  <div className="center-screen">
    <span className="spinner big" />
  </div>
);

function startCloud() {
  setOnSignedIn((name) => void useApp.getState().adoptUser(name));
  initCloud({
    getSettings: getAppSettings,
    applySettings: applyAppSettings,
    onProjectChanged: (p, id) => {
      const ed = useEditor.getState();
      if (ed.project?.id !== id) return;
      if (p && p.updated > ed.project.updated) ed.load(p);
    },
  });
}

function UpdateToast() {
  const available = useUpdate((s) => s.available);
  if (!available) return null;
  return (
    <button className="update-toast" onClick={() => applyUpdate()}>
      New version of Encore · <b>Reload</b>
    </button>
  );
}

export default function App() {
  return (
    <>
      <Main />
      <UpdateToast />
    </>
  );
}

function Main() {
  usePrefs(); // settings like the clock style apply everywhere at once
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);
  const route = useRoute();

  useEffect(() => {
    // shrink oversized old pictures first so the first sync sends the light versions
    init().then(runMaintenance).catch(() => {}).then(startCloud);
    startUpdateChecks();
  }, [init]);
  const lib = useApp((s) => s.lib);
  const demo = useApp((s) => s.demo);

  if (view === 'loading')
    return (
      <div className="center-screen">
        <span className="spinner big" />
      </div>
    );
  if (view === 'onboard') return <Onboard />;
  if (!demo && lib && lib.n === 0) return <FirstSync />;
  if (route.name === 'edit')
    return (
      <Suspense fallback={loading}>
        <Editor id={route.id} />
      </Suspense>
    );

  let page;
  switch (route.name) {
    case 'top':
      page = <TopView key={route.kind} kind={route.kind} />;
      break;
    case 'entity':
      page = <EntityView key={`${route.kind}${route.artist}${route.title}`} kind={route.kind} artist={route.artist} title={route.title} />;
      break;
    case 'listening':
      page = <Listening />;
      break;
    case 'records':
      page = <Records />;
      break;
    case 'create':
      page = (
        <Suspense fallback={loading}>
          <Create />
        </Suspense>
      );
      break;
    case 'settings':
      page = (
        <Suspense fallback={loading}>
          <Settings tab={route.tab} />
        </Suspense>
      );
      break;
    default:
      page = <Overview />;
  }
  return (
    <Shell route={route} showRange={route.name !== 'records' && route.name !== 'settings'}>
      {page}
    </Shell>
  );
}
