import { lazy, Suspense, useEffect } from 'react';
import { useApp } from './store';
import { useRoute } from './router';
import { Onboard } from './views/Onboard';
import { SignInHandoff } from './views/SignInHandoff';
import { Shell } from './views/Shell';
import { Overview } from './views/stats/Overview';
import { TopView } from './views/stats/TopView';
import { EntityView } from './views/stats/EntityView';
import { History } from './views/stats/History';
import { Records } from './views/stats/Records';
import { FirstSync } from './views/FirstSync';
import { initCloud, setOnSignedIn, setOnSignedOut, useCloud } from './lib/cloud';
import { lookAccountChecked, useLook } from './lib/look';
import { LookPicker } from './views/LookPicker';
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
  setOnSignedOut((why) => useApp.getState().signedOut(why));
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
  const look = useLook();
  const token = useCloud((s) => s.token);
  const locked = useCloud((s) => s.privacy === 'locked');

  // signed in on a browser that hasn't picked a look: wait to hear whether the account already has one
  useEffect(() => {
    if (look.chosen || !token || look.accountChecked) return;
    if (locked) return lookAccountChecked();
    const done = () => lookAccountChecked();
    window.addEventListener('sw:synced', done);
    const t = setTimeout(done, 8000);
    return () => {
      window.removeEventListener('sw:synced', done);
      clearTimeout(t);
    };
  }, [look.chosen, look.accountChecked, token, locked]);

  if (view === 'loading')
    return (
      <div className="center-screen">
        <span className="spinner big" />
      </div>
    );
  if (view === 'onboard') return <Onboard />;
  if (view === 'handoff') return <SignInHandoff />;
  // first run: pick a look before anything else (a new account's history downloads meanwhile)
  if (!look.chosen) {
    if (token && !look.accountChecked) return loading;
    return <LookPicker />;
  }
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
    case 'history':
      page = <History view={route.view} />;
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
          <Settings tab={route.tab} q={route.q} />
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
