import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { PortalNavItem } from './PortalShell';
import { findNavigationEntries } from './pageGuidance';

type Props = {
  items: PortalNavItem[]; portalLabel: string; expanded: Set<string>;
  isActive: (item: PortalNavItem) => boolean;
  toggle: (id: string) => void; goTo: (path: string, label: string) => void;
};

export function PortalMenu({ items, portalLabel, expanded, isActive, toggle, goTo }: Props) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const searching = Boolean(query.trim());
  const results = searching ? findNavigationEntries(items, portalLabel, query) : [];
  const open = (item: PortalNavItem) => { setQuery(''); goTo(item.path, item.label); };
  const clear = () => { setQuery(''); searchRef.current?.focus(); };
  return <>
    <div className="shrink-0 px-3 pt-3">
      <label htmlFor="portal-page-search" className="mb-1 block px-1 text-xs font-semibold text-white">Find a page</label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/80" />
        <input ref={searchRef} id="portal-page-search" type="search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); clear(); } }} placeholder="Try booking, documents, approval…" className="min-h-11 w-full rounded-control border border-white/30 bg-white/10 py-2 pl-9 pr-11 text-sm text-white placeholder:text-white/75" />
        {query && <button type="button" onClick={clear} aria-label="Clear page search" className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-control text-white"><X aria-hidden="true" className="h-4 w-4" /></button>}
      </div>
    </div>
    <nav className="hirna-sidebar-nav min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-label={`${portalLabel} navigation`}>
      {searching ? <>
        <p role="status" className="mb-2 px-1 text-xs text-white/90">{results.length ? `${results.length} ${results.length === 1 ? 'page' : 'pages'} found` : 'No pages match. Try another word or clear the search.'}</p>
        {results.map(item => {
          const Icon = item.icon;
          return <button key={`${item.context}-${item.path}`} type="button" onClick={() => open(item)} aria-current={isActive(item) ? 'page' : undefined} className={`hirna-nav-item mb-1 flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm ${isActive(item) ? 'hirna-nav-item-active' : ''}`}>
            <Icon aria-hidden="true" className="hirna-nav-icon mt-0.5 h-[18px] w-[18px] shrink-0" />
            <span className="min-w-0 break-words"><span className="block font-semibold">{item.label}</span><span className="block text-xs opacity-90">{item.context}</span></span>
          </button>;
        })}
      </> : items.map((item, index) => {
        const Icon = item.icon;
        const childActive = item.children?.some(isActive) ?? false;
        const active = childActive || (!item.disclosureOnly && isActive(item));
        const opened = expanded.has(item.id);
        const toggleLabel = `${opened ? 'Collapse' : 'Expand'} ${item.label}`;
        return <div key={item.id}>
          {item.group && item.group !== items[index - 1]?.group && <p className="mb-1 mt-4 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-white/80">{item.group}</p>}
          <div className={`hirna-nav-item mb-1 flex items-center ${active ? 'hirna-nav-item-active font-semibold' : ''}`}>
            <button type="button" onClick={() => item.disclosureOnly ? toggle(item.id) : open(item)} aria-label={item.disclosureOnly ? `${item.label} — ${toggleLabel}` : undefined} aria-expanded={item.disclosureOnly ? opened : undefined} aria-controls={item.disclosureOnly ? `nav-${item.id}` : undefined} aria-current={!item.disclosureOnly && active && !childActive ? 'page' : undefined} className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control px-3 py-2.5 text-left text-sm font-medium">
              <Icon aria-hidden="true" className="hirna-nav-icon h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 break-words">{item.label}</span>
              {item.badge && <span className="ml-auto text-xs opacity-90">{item.badge}</span>}
              {item.disclosureOnly && <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 transition-transform ${opened ? 'rotate-180' : ''}`} />}
              {!item.children && active && <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 shrink-0" />}
            </button>
            {item.children && !item.disclosureOnly && <button type="button" aria-label={toggleLabel} aria-expanded={opened} aria-controls={`nav-${item.id}`} onClick={() => toggle(item.id)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control"><ChevronDown aria-hidden="true" className={`hirna-nav-chevron h-4 w-4 transition-transform ${opened ? 'rotate-180' : ''}`} /></button>}
          </div>
          {item.children && <div id={`nav-${item.id}`} hidden={!opened}><div className="mb-1 ml-4 space-y-1 border-l border-white/20 pl-2">
            {item.children.map(child => {
              const ChildIcon = child.icon;
              return <button key={child.id} type="button" aria-current={isActive(child) ? 'page' : undefined} onClick={() => open(child)} className={`hirna-nav-item flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm ${isActive(child) ? 'hirna-nav-item-active font-semibold' : ''}`}>
                <ChildIcon aria-hidden="true" className="hirna-nav-icon h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{child.label}</span>
              </button>;
            })}
          </div></div>}
        </div>;
      })}
    </nav>
  </>;
}
