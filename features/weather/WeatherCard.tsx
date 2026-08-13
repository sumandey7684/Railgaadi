import React from 'react';
import { Cloud, Sun, CloudRain, Wind, Droplets } from 'lucide-react';
import { WeatherData } from '@/lib/openweather';
import { cn } from '@/utils/cn';

interface WeatherCardProps {
  label: string; // e.g. "Current Station", "Next Station", "Destination"
  weather: WeatherData;
  className?: string;
}

export function WeatherCard({ label, weather, className }: WeatherCardProps) {
  const isRain = weather.condition.toLowerCase().includes('rain');
  const isSun = weather.condition.toLowerCase().includes('clear');

  return (
    <div
      className={cn(
        'glass-panel relative overflow-hidden rounded-2xl p-5 space-y-3',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-rail-blue">
          {label}
        </span>
        {isSun ? (
          <Sun className="h-6 w-6 text-amber-500 animate-spin-slow" />
        ) : isRain ? (
          <CloudRain className="h-6 w-6 text-sky-500 animate-bounce" />
        ) : (
          <Cloud className="h-6 w-6 text-slate-400" />
        )}
      </div>

      <div>
        <h4 className="font-bold text-foreground text-base">
          {weather.stationName || 'Station'} ({weather.stationCode || '---'})
        </h4>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-extrabold text-foreground">
            {weather.tempC}°C
          </span>
          <span className="text-xs text-muted-foreground">Feels like {weather.feelsLikeC}°C</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs font-semibold text-foreground/80">
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{weather.windSpeedKmh} km/h wind</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets className="h-3.5 w-3.5 text-sky-500" />
          <span>{weather.humidity}% humidity</span>
        </div>
      </div>
    </div>
  );
}
