import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Minus, Plus, Maximize, Navigation } from 'lucide-react';
import type { Entry, Note, Place, Region } from './types';
import { kindNames, kindSymbols } from './types';
import { assetUrl } from './domain';
interface Props { region: Region; entries: Entry[]; selected?: Entry; focus?: Place; focusKey: number; notes: Note[]; onSelect(e: Entry, p: Place): void; onNote(x: number, y: number): void; onEditNote(n: Note): void; noteMode: boolean }
export function AtlasMap({ region, entries, selected, focus, focusKey, notes, onSelect, onNote, onEditNote, noteMode }: Props) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), group = useRef<L.LayerGroup | null>(null);
  const [coords, setCoords] = useState('拖动探索 · 滚轮缩放'), [mapError, setMapError] = useState(false);
  const callbacks = useRef({ onNote, noteMode }); callbacks.current = { onNote, noteMode };
  const viewState = useRef({ region, focus }); viewState.current = { region, focus };
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 2, zoomSnap: 0.25, zoomDelta: 0.5, zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: false, zoomControl: false, attributionControl: false });
    map.current = m;
    m.on('mousemove', e => setCoords(`${Math.round(e.latlng.lng)} , ${Math.round(-e.latlng.lat)}`));
    m.on('click', e => { if (callbacks.current.noteMode) callbacks.current.onNote(Math.round(e.latlng.lng), Math.round(-e.latlng.lat)); });
    const observer = new ResizeObserver(() => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      m.invalidateSize({ pan: false });
      const { region: r, focus: p } = viewState.current;
      if (p?.valid && p.region === r.id && r.verified) m.setView([-p.y,p.x],Math.max(m.getZoom(),0),{animate:false});
      else m.fitBounds([[-r.height,0],[0,r.width]],{padding:[24,24],animate:false});
    }); observer.observe(host.current);
    return () => { observer.disconnect(); m.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const m = map.current; if (!m) return;
    setMapError(false);
    const bounds: L.LatLngBoundsExpression = [[-region.height, 0], [0, region.width]];
    const overlay = region.image ? L.imageOverlay(assetUrl(region.image), bounds).addTo(m) : null;
    overlay?.on('error', () => setMapError(true));
    m.stop(); m.setMaxBounds([[-region.height - 400, -400], [400, region.width + 400]]); m.fitBounds(bounds, { padding: [24,24], animate: false });
    return () => { overlay?.remove(); };
  }, [region]);
  useEffect(() => {
    const m = map.current; if (!m) return;
    const g = L.layerGroup().addTo(m); group.current = g;
    if (region.verified) for (const e of entries) for (const p of e.locations) {
      if (p.region !== region.id || !p.valid) continue;
      const isSelected = selected?.id === e.id;
      const marker = L.marker([-p.y, p.x], { title: `${kindNames[e.kind]}：${e.name}`, alt: e.name, icon: L.divIcon({ className: `atlas-marker ${e.kind} ${isSelected ? 'chosen' : ''}`, html: `<span>${kindSymbols[e.kind]}</span>`, iconSize: [26,26], iconAnchor: [13,13] }), zIndexOffset: isSelected ? 2000 : e.kind === 'zone' ? -200 : 0 });
      const label = document.createElement('span'); label.textContent = `${e.name} · ${kindNames[e.kind]}`;
      marker.bindTooltip(label, { direction: 'top', offset: [0,-10] }).on('click', ev => { L.DomEvent.stopPropagation(ev); onSelect(e,p); }).addTo(g);
      const el = marker.getElement(); if (el) { el.setAttribute('aria-label', `${kindNames[e.kind]}：${e.name}`); el.setAttribute('role','button'); }
    }
    for (const n of notes) {
      if (n.region !== region.id || n.x > region.width || n.y > region.height) continue;
      const label = document.createElement('span'); label.textContent = n.text;
      L.marker([-n.y,n.x], { icon: L.divIcon({ className: 'atlas-marker note', html: '<span>✎</span>', iconSize: [26,26] }) }).bindTooltip(label).on('click', ev => { L.DomEvent.stopPropagation(ev); onEditNote(n); }).addTo(g);
    }
    return () => { g.remove(); group.current = null; };
  }, [entries, region, selected, notes, onSelect, onEditNote]);
  useEffect(() => {
    if (focus?.valid && focus.region === region.id && region.verified) map.current?.setView([-focus.y, focus.x], Math.max(map.current.getZoom(),0), { animate: false });
  }, [focus, focusKey, region]);
  return <div className={`map-stage ${noteMode ? 'placing-note' : ''}`}>
    <div ref={host} className="leaflet-host" data-testid="atlas-map"/>
    <div className="map-vignette"/>
    <div className="map-heading"><span className="eyebrow">TYRIA CARTOGRAPHY / {region.id.replace(':', '—')}</span><h2>{region.name}</h2><span><span className="live-dot"/> {region.verified ? '原始地图 · 地标已核对' : '地图对应关系待确认'}</span></div>
    <div className="compass"><Navigation size={24}/><span>N</span></div>
    <div className="map-controls"><button aria-label="放大" onClick={() => map.current?.zoomIn()}><Plus size={19}/></button><button aria-label="缩小" onClick={() => map.current?.zoomOut()}><Minus size={19}/></button><span/><button aria-label="显示完整地图" onClick={() => map.current?.fitBounds([[-region.height,0],[0,region.width]])}><Maximize size={18}/></button></div>
    <div className="map-coordinates"><Crosshair size={13}/><span>{coords}</span></div>
    <div className="map-source">GUILD WARS · ORIGINAL ATLAS</div>
    {(mapError || !region.image) && <div className="map-alert">地图图片暂不可用；请联网访问此地区后重试。</div>}
    {noteMode && <div className="map-tip">点击地图添加个人笔记</div>}
  </div>;
}
