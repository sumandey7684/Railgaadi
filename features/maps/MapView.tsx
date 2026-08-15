'use client';

import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Target, ZoomIn, ZoomOut } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import { useJourneyStore } from '@/store/journey';
import { haltStations, mapPosition, stationArrivalView, delayLabel } from '@/lib/journey-state';
import { cn } from '@/utils/cn';
import { escapeHtml } from '@/utils/html';

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY || '';

interface MapViewProps {
  journey: LiveJourney;
  className?: string;
}

export default function MapView({ journey, className }: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const stationMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  const followTrainMode = useJourneyStore((state) => state.followTrainMode);
  const setFollowTrainMode = useJourneyStore((state) => state.setFollowTrainMode);
  const selectedStationCode = useJourneyStore((state) => state.selectedStationCode);
  const setSelectedStationCode = useJourneyStore((state) => state.setSelectedStationCode);
  const position = mapPosition(journey);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const styleUrl = MAPTILER_KEY
      ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
      : {
          version: 8 as const,
          sources: {
            'carto-dark': {
              type: 'raster' as const,
              tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap © CARTO',
            },
          },
          layers: [{ id: 'carto-layer', type: 'raster' as const, source: 'carto-dark' }],
        };

    const center: [number, number] = [
      position.lng || journey.stations[0]?.lng || 77.22,
      position.lat || journey.stations[0]?.lat || 28.64,
    ];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl as any,
      center,
      zoom: 7,
      pitch: 30,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      mapRef.current = map;
      setMapLoaded(true);
    });

    map.on('dragstart', () => setFollowTrainMode(false));

    return () => {
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const coords: [number, number][] =
      journey.routeGeometry ||
      journey.stations
        .filter((s) => s.lat && s.lng)
        .map((s) => [s.lng, s.lat] as [number, number]);

    if (coords.length < 2) return;

    const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };

    if (map.getSource('route')) {
      (map.getSource('route') as maplibregl.GeoJSONSource).setData(routeGeoJSON);
    } else {
      map.addSource('route', { type: 'geojson', data: routeGeoJSON });

      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#0284c7', 'line-width': 12, 'line-opacity': 0.2, 'line-blur': 8 },
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 3.5 },
      });
    }

    const trainLng = position.lng;
    const trainLat = position.lat;
    const delayText =
      journey.delayMinutes == null
        ? 'Delay unknown'
        : journey.delayMinutes > 0
        ? `+${escapeHtml(journey.delayMinutes)}m`
        : 'On time';
    const sourceLabel =
      position.source === 'gps'
        ? 'GPS'
        : position.source === 'station'
        ? 'Station'
        : position.source === 'interpolated'
        ? 'Estimated'
        : 'Fallback';

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="relative flex items-center justify-center w-10 h-10">
          <div class="absolute inset-0 rounded-full bg-sky-500/30 animate-ping"></div>
          <div class="relative flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white border-2 border-white shadow-lg text-lg">
            🚄
          </div>
        </div>`;

      const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(`
        <div class="p-2 font-sans">
          <div class="font-bold text-xs text-slate-900 dark:text-white">${escapeHtml(journey.name)}</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400">#${escapeHtml(journey.number)}</div>
          <div class="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mt-0.5">
            ${escapeHtml(sourceLabel)} · ${delayText}
          </div>
        </div>`);

      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([trainLng, trainLat])
        .setPopup(popup)
        .addTo(map);
    } else {
      markerRef.current.setLngLat([trainLng, trainLat]);
    }

    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];

    haltStations(journey).forEach((st) => {
      if (!st.lat || !st.lng) return;
      const el = document.createElement('div');
      const isPassed = st.status === 'passed';
      const isCurrent = st.status === 'current';
      const isSelected = selectedStationCode === st.code;
      const arrival = stationArrivalView(st);
      const delay = delayLabel(st);

      el.innerHTML = `<div class="rounded-full border-2 border-white shadow-sm cursor-pointer transition-transform hover:scale-150 ${
        isSelected
          ? 'h-4 w-4 bg-amber-400 ring-4 ring-amber-400/30'
          : isCurrent
          ? 'h-4 w-4 bg-sky-500 ring-4 ring-sky-500/30'
          : isPassed
          ? 'h-2.5 w-2.5 bg-emerald-500'
          : 'h-2.5 w-2.5 bg-slate-400'
      }"></div>`;

      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(`
        <div class="p-2 font-sans">
          <div class="font-bold text-xs text-slate-900 dark:text-white">${escapeHtml(st.name)} (${escapeHtml(st.code)})</div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${escapeHtml(st.distanceKm)} km from origin</div>
          <div class="text-[11px] font-semibold mt-0.5 text-slate-800 dark:text-slate-200">
            ${arrival.label ? `${escapeHtml(arrival.label)} ` : ''}${escapeHtml(arrival.time)}
          </div>
          ${
            delay.known
              ? `<div class="text-[11px] ${st.delayMinutes && st.delayMinutes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${escapeHtml(delay.text)}</div>`
              : ''
          }
          ${st.platform ? `<div class="text-[11px] text-slate-500 dark:text-slate-400">Platform ${escapeHtml(st.platform)}</div>` : ''}
        </div>`);

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([st.lng, st.lat])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => {
        setSelectedStationCode(st.code);
        setFollowTrainMode(false);
      });
      stationMarkersRef.current.push(marker);
    });

    if (followTrainMode) {
      map.easeTo({ center: [trainLng, trainLat], duration: 800 });
    } else if (selectedStationCode) {
      const selected = haltStations(journey).find((st) => st.code === selectedStationCode);
      if (selected?.lng && selected?.lat) {
        map.easeTo({ center: [selected.lng, selected.lat], duration: 600 });
      }
    }
  }, [journey, mapLoaded, followTrainMode, selectedStationCode, position.lat, position.lng, position.source, setFollowTrainMode, setSelectedStationCode]);

  const recenter = () => {
    setFollowTrainMode(true);
    setSelectedStationCode(null);
    mapRef.current?.easeTo({
      center: [position.lng, position.lat],
      zoom: 9,
      duration: 800,
    });
  };

  return (
    <div className={cn('relative overflow-hidden rounded-3xl shadow-glass', className)}>
      <div ref={mapContainerRef} className="h-full w-full min-h-[420px]" />

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        {[
          { icon: ZoomIn, action: () => mapRef.current?.zoomIn(), title: 'Zoom In' },
          { icon: ZoomOut, action: () => mapRef.current?.zoomOut(), title: 'Zoom Out' },
          { icon: Target, action: recenter, title: 'Center on Train', isActive: followTrainMode },
        ].map(({ icon: Icon, action, title, isActive }) => (
          <button
            key={title}
            onClick={action}
            title={title}
            className={cn(
              'glass-control flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 motion-reduce:transition-none hover:scale-105 motion-reduce:hover:scale-100',
              isActive ? 'bg-rail-blue text-white shadow-glow !border-rail-blue' : 'text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 z-10">
        <button
          onClick={() => {
            setFollowTrainMode(!followTrainMode);
            if (!followTrainMode) setSelectedStationCode(null);
          }}
          className={cn(
            'glass-control flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors',
            followTrainMode ? 'text-rail-blue !border-rail-blue/35' : 'text-muted-foreground'
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', followTrainMode ? 'bg-rail-blue animate-ping motion-reduce:animate-none' : 'bg-muted-foreground')} />
          {followTrainMode ? 'Following Train' : 'Camera Free'}
        </button>
      </div>
    </div>
  );
}
