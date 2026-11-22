import { useEffect } from 'react';
import { useApp } from './store';
import { useRoute } from './router';
import { Onboard } from './views/Onboard';
import { Editor } from './views/Editor';
import { Images } from './views/Images';
import { Shell } from './views/Shell';
import { Overview } from './views/stats/Overview';
import { TopView } from './views/stats/TopView';
import { EntityView } from './views/stats/EntityView';
import { Listening } from './views/stats/Listening';
import { Records } from './views/stats/Records';
import { Create } from './views/Create';
import { FirstSync } from './views/FirstSync';
import { initCloud, setOnSignedIn } from './lib/cloud';
import { useEditor } from './editor/editorStore';
import type { CompareMode } from './lib/range';
import type { RangeSpec } from './lib/types';

function startCloud() {
  setOnSignedIn((name) => void useApp.getState().adoptUser(name));
  initCloud({
    getSettings: () => {
      const { exploreRange, compare } = useApp.getState();
      let milestones: unknown = null;
      try {
        milestones = JSON.parse(localStorage.getItem('sw.milestones') || 'null');
      } catch {
        /* ignore */
      }
      return { range: exploreRange, compare, milestones };
    },
    applySettings: (raw) => {
      const d = raw as { range?: RangeSpec; compare?: CompareMode; milestones?: unknown };
      try {
        if (d.range) localStorage.setItem('sw.range', JSON.stringify(d.range));
        if (d.compare) localStorage.setItem('sw.compare', d.compare);
        if (d.milestones) localStorage.setItem('sw.milestones', JSON.stringify(d.milestones));
      } catch {
        /* private mode */
      }
      useApp.setState({ ...(d.range ? { exploreRange: d.range } : {}), ...(d.compare ? { compare: d.compare } : {}) });
    },
    onProjectChanged: (p, id) => {
      const ed = useEditor.getState();
      if (ed.project?.id !== id) return;
      if (p && p.updated > ed.project.updated) ed.load(p);
    },
  });
}

export default function App() {
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);
  const route = useRoute();

  useEffect(() => {
    init().then(startCloud);
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
    case 'images':
      page = <Images />;
      break;
    default:
      page = <Overview />;
  }
  return (
    <Shell route={route} showRange={route.name !== 'records' && route.name !== 'images'}>
      {page}
    </Shell>
  );
}
