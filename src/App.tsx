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

export default function App() {
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);
  const route = useRoute();

  useEffect(() => {
    init();
  }, [init]);

  if (view === 'loading')
    return (
      <div className="center-screen">
        <span className="spinner big" />
      </div>
    );
  if (view === 'onboard') return <Onboard />;
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
