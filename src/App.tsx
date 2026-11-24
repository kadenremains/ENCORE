import { useEffect } from 'react';
import { useApp } from './store';
import { useRoute } from './router';
import { Onboard } from './views/Onboard';
import { Editor } from './views/Editor';
import { Settings } from './views/Settings';
import { Shell } from './views/Shell';
import { Overview } from './views/stats/Overview';
import { TopView } from './views/stats/TopView';
import { EntityView } from './views/stats/EntityView';
import { Listening } from './views/stats/Listening';
import { Records } from './views/stats/Records';
import { Create } from './views/Create';
import { FirstSync } from './views/FirstSync';
import { initCloud, setOnSignedIn } from './lib/cloud';
import { runMaintenance } from './lib/maintenance';
import { useEditor } from './editor/editorStore';
import { usePrefs } from './lib/prefs';
import { applyAppSettings, getAppSettings } from './lib/appSettings';
import { applyUpdate, startUpdateChecks, useUpdate } from './lib/updates';

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
  if (route.name === 'edit') return <Editor id={route.id} />;

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
      page = <Create />;
      break;
    case 'settings':
      page = <Settings tab={route.tab} />;
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
