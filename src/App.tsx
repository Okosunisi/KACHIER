import { useEffect, useState } from 'react';
import type { DocKind, TemplateId } from './types';
import { Editor } from './components/Editor';
import { DocsGuide } from './components/DocsGuide';
import { Home, SiteHeader } from './components/Home';
import { Privacy } from './components/Privacy';
import { Reports, Sales } from './components/Books';
import { KIND_COPY, KIND_ORDER } from './lib/kinds';

interface Route {
  page: 'home' | 'sales' | 'reports' | 'documents' | 'privacy' | DocKind;
  template?: TemplateId;
  projectId?: string;
}

function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const t = new URLSearchParams(query).get('t');
  const template = t === 'classic' || t === 'minimal' || t === 'bold' ? t : undefined;
  const seg = path.split('/');
  if (seg[1] === 'documents') return { page: 'documents' };
  if (seg[1] === 'privacy') return { page: 'privacy' };
  if (seg[1] === 'sales' && seg.length <= 3) return { page: 'sales', projectId: seg[2] || undefined };
  if (seg[1] === 'reports' && seg.length <= 3) return { page: 'reports', projectId: seg[2] || undefined };
  const kind = KIND_ORDER.find((k) => path.startsWith(`/${KIND_COPY[k].path}`));
  if (kind) return { page: kind, template };
  return { page: 'home' };
}

function useRoute(): Route & { key: string } {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return { ...parseHash(hash), key: hash };
}

const homeTitle = 'KACHIER - Simple Bookkeeping for Business Owners';
const pageTitle = (page: Route['page']) =>
  page === 'home' ? homeTitle : page === 'privacy' ? 'Privacy Policy - KACHIER' : page === 'documents' ? 'Understand Business Documents - KACHIER' : page === 'sales' ? 'Sales & Expenses - KACHIER' : page === 'reports' ? 'Business Reports - KACHIER' : `Create a ${KIND_COPY[page].noun} - KACHIER`;

export default function App() {
  const route = useRoute();

  useEffect(() => {
    document.title = pageTitle(route.page);
    window.scrollTo(0, 0);
  }, [route.page, route.key]);

  if (route.page === 'home') return <Home />;
  if (route.page === 'privacy') {
    return (
      <>
        <div className="app-shell top-shell">
          <SiteHeader current="privacy" />
        </div>
        <Privacy />
      </>
    );
  }
  if (route.page === 'documents') {
    return (
      <>
        <div className="app-shell top-shell">
          <SiteHeader current="documents" />
        </div>
        <DocsGuide />
      </>
    );
  }
  if (route.page === 'sales' || route.page === 'reports') {
    return (
      <>
        <div className="app-shell top-shell">
          <SiteHeader current={route.page} />
        </div>
        {route.page === 'sales' ? <Sales projectId={route.projectId} /> : <Reports projectId={route.projectId} />}
      </>
    );
  }

  return (
    <>
      <div className="app-shell top-shell">
        <SiteHeader current={route.page} />
      </div>
      {/* key = page + template so switching between document types starts a fresh editor */}
      <Editor key={`${route.page}-${route.template ?? ''}`} kind={route.page} template={route.template} />
    </>
  );
}
