import { useEffect } from 'react';
import { useApp } from './store';
import { Onboard } from './views/Onboard';
import { Home } from './views/Home';
import { Editor } from './views/Editor';
import { Images } from './views/Images';

export default function App() {
  const view = useApp((s) => s.view);
  const init = useApp((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  switch (view) {
    case 'loading':
      return (
        <div className="center-screen">
          <span className="spinner big" />
        </div>
      );
    case 'onboard':
      return <Onboard />;
    case 'editor':
      return <Editor />;
    case 'images':
      return <Images />;
    default:
      return <Home />;
  }
}
