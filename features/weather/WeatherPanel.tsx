'use client';

import React, { useEffect, useState } from 'react';
import { CloudSun } from 'lucide-react';
import { LiveJourney } from '@/types/train';
import { WeatherCard } from './WeatherCard';
import { WeatherData } from '@/lib/openweather';
import { DataSource } from '@/types/api';
import { DataSourceBadge } from '@/components/ui/DataSourceBadge';

interface WeatherPanelProps {
  journey: LiveJourney;
}

function stationRef(st?: { code?: string; lat?: number; lng?: number; name?: string }) {
  if (!st) return { key: '', lat: 0, lng: 0, name: '', code: '' };
  return {
    key: `${st.code || ''}:${Number(st.lat).toFixed(3)}:${Number(st.lng).toFixed(3)}`,
    lat: st.lat || 0,
    lng: st.lng || 0,
    name: st.name || '',
    code: st.code || '',
  };
}

export function WeatherPanel({ journey }: WeatherPanelProps) {
  const curr = stationRef(journey.currentStation || journey.previousStation || journey.stations[0]);
  const next = stationRef(journey.nextStation || journey.stations[journey.stations.length - 1]);
  const dest = stationRef(journey.stations[journey.stations.length - 1]);

  const [weatherData, setWeatherData] = useState<{
    current?: WeatherData;
    next?: WeatherData;
    dest?: WeatherData;
  }>({});
  const [dataSource, setDataSource] = useState<DataSource>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!curr.lat || !curr.lng) return;

    let cancelled = false;

    async function loadWeather() {
      setLoading(true);
      try {
        const [currRes, nextRes, destRes] = await Promise.all([
          fetch(`/api/weather?lat=${curr.lat}&lng=${curr.lng}&name=${encodeURIComponent(curr.name)}&code=${curr.code}`),
          fetch(`/api/weather?lat=${next.lat}&lng=${next.lng}&name=${encodeURIComponent(next.name)}&code=${next.code}`),
          fetch(`/api/weather?lat=${dest.lat}&lng=${dest.lng}&name=${encodeURIComponent(dest.name)}&code=${dest.code}`),
        ]);

        const [currJson, nextJson, destJson] = await Promise.all([
          currRes.json(),
          nextRes.json(),
          destRes.json(),
        ]);

        if (cancelled) return;
        setWeatherData({
          current: currJson.data,
          next: nextJson.data,
          dest: destJson.data,
        });
        setDataSource(currJson.dataSource || nextJson.dataSource || destJson.dataSource);
      } catch (e) {
        console.warn('Weather panel loading failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWeather();
    return () => {
      cancelled = true;
    };
  }, [
    curr.key,
    curr.lat,
    curr.lng,
    curr.name,
    curr.code,
    next.key,
    next.lat,
    next.lng,
    next.name,
    next.code,
    dest.key,
    dest.lat,
    dest.lng,
    dest.name,
    dest.code,
  ]);

  if (loading || !weatherData.current) {
    return (
      <div className="glass-panel rounded-3xl p-6 text-center text-xs text-slate-400">
        Loading live OpenWeather intelligence...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 font-bold text-lg text-slate-900 dark:text-white">
        <CloudSun className="h-5 w-5 text-amber-500" />
        <span>Smart Travel Companion Weather</span>
        <DataSourceBadge dataSource={dataSource} className="ml-auto font-bold" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {weatherData.current && (
          <WeatherCard label="Current Station Weather" weather={weatherData.current} />
        )}
        {weatherData.next && (
          <WeatherCard label="Next Station Weather" weather={weatherData.next} />
        )}
        {weatherData.dest && (
          <WeatherCard label="Destination Weather" weather={weatherData.dest} />
        )}
      </div>
    </div>
  );
}
