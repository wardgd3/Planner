import { useEffect, useState } from "react";
import { fetchNashvilleWeather, syncWeatherToSupabase } from "./weatherService";

function weatherEmoji(code) {
  if (code === 0 || code === 1) return "\u2600\uFE0F";
  if (code === 2) return "\u26C5";
  if (code === 3) return "\u2601\uFE0F";
  if ([45, 48].includes(code)) return "\uD83C\uDF2B\uFE0F";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "\uD83C\uDF27\uFE0F";
  if ([71, 73, 75].includes(code)) return "\u2744\uFE0F";
  if ([95, 96, 99].includes(code)) return "\u26C8\uFE0F";
  return "\uD83C\uDF21\uFE0F";
}

export default function WeatherWidget({ supabase = null }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        let data;
        if (supabase) {
          data = await syncWeatherToSupabase(supabase);
        } else {
          data = await fetchNashvilleWeather();
        }
        setWeather(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div className="weather-widget">
      <span className="weather-loading">Loading weather...</span>
    </div>
  );

  if (error) return (
    <div className="weather-widget">
      <span className="weather-error">Weather unavailable</span>
    </div>
  );

  const emoji = weatherEmoji(weather.condition_code);
  const uvLevel = weather.uv_index >= 8 ? "Very High"
    : weather.uv_index >= 6 ? "High"
    : weather.uv_index >= 3 ? "Moderate"
    : "Low";

  const uvClass = weather.uv_index >= 8 ? "uv-very-high"
    : weather.uv_index >= 6 ? "uv-high"
    : weather.uv_index >= 3 ? "uv-moderate"
    : "uv-low";

  return (
    <div className="weather-widget">
      <div className="weather-hero">
        <span className="weather-emoji">{emoji}</span>
        <div className="weather-hero-info">
          <div className="weather-condition">{weather.condition}</div>
          <div className="weather-location">{weather.location}</div>
        </div>
        <div className="weather-temp">{Math.round(weather.temp_current_f)}°</div>
      </div>

      <div className="weather-details">
        <div className="weather-detail">
          <span className="weather-detail-label">High</span>
          <span className="weather-detail-value">{Math.round(weather.temp_high_f)}°</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">Low</span>
          <span className="weather-detail-value">{Math.round(weather.temp_low_f)}°</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">Rain</span>
          <span className="weather-detail-value">{weather.precipitation_mm} mm</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">Wind</span>
          <span className="weather-detail-value">{Math.round(weather.wind_speed_mph)} mph</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">UV</span>
          <span className={`weather-detail-value ${uvClass}`}>{uvLevel}</span>
        </div>
      </div>

      {weather.precipitation_mm > 2 && (
        <div className="weather-warning">
          Rain expected — check outdoor blocks
        </div>
      )}
      {weather.uv_index >= 8 && (
        <div className="weather-warning">
          Very high UV — apply sunscreen for outdoor activities
        </div>
      )}
    </div>
  );
}
