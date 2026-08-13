import { env } from '@/config/env';

export interface WeatherData {
  stationCode?: string;
  stationName?: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windSpeedKmh: number;
  condition: string; // e.g. "Clear", "Rain", "Clouds"
  icon: string;
  rainChancePercent?: number;
}

export async function getWeatherForLocation(
  lat: number,
  lng: number,
  stationName?: string,
  stationCode?: string
): Promise<{ data: WeatherData; dataSource: 'live' | 'fallback' }> {
  if (env.OPENWEATHER_API_KEY) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${env.OPENWEATHER_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return {
          dataSource: 'live',
          data: {
            stationCode,
            stationName,
            tempC: Math.round(data.main.temp),
            feelsLikeC: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            windSpeedKmh: Math.round(data.wind.speed * 3.6),
            condition: data.weather[0]?.main || 'Clear',
            icon: data.weather[0]?.icon || '01d',
            rainChancePercent: data.rain ? 80 : 10,
          },
        };
      }
    } catch (err) {
      console.warn('OpenWeather API request failed, using fallback', err);
    }
  }

  return {
    dataSource: 'fallback',
    data: {
      stationCode,
      stationName,
      tempC: 28,
      feelsLikeC: 30,
      humidity: 62,
      windSpeedKmh: 14,
      condition: 'Clear',
      icon: '01d',
      rainChancePercent: 15,
    },
  };
}
