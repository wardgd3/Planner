import { useEffect, useState } from "react";
import { fetchWeather, syncWeatherToSupabase, parseCondition, weatherEmoji, generateSummary } from "./weatherService";

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeatherWidget({ supabase = null }) {
  const [forecast, setForecast] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        let data;
        if (supabase) {
          data = await syncWeatherToSupabase(supabase);
        } else {
          data = await fetchWeather();
        }
        setForecast(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return (
    <div className="wx">
      <div className="wx-loading">Loading weather...</div>
    </div>
  );

  if (error) return (
    <div className="wx">
      <div className="wx-error">Weather unavailable</div>
    </div>
  );

  const day = forecast.days[selectedIdx];
  const isToday = selectedIdx === 0;
  const displayTemp = isToday ? Math.round(forecast.current_temp_f) : Math.round(day.temp_high_f);
  const conditionCode = isToday ? forecast.current_code : day.weathercode;
  const emoji = weatherEmoji(conditionCode);
  const condition = parseCondition(conditionCode);
  const summary = generateSummary(day);

  const uvLevel = day.uv_index >= 8 ? "Very High"
    : day.uv_index >= 6 ? "High"
    : day.uv_index >= 3 ? "Moderate"
    : "Low";
  const uvClass = day.uv_index >= 8 ? "wx-uv-vhigh"
    : day.uv_index >= 6 ? "wx-uv-high"
    : day.uv_index >= 3 ? "wx-uv-mod"
    : "wx-uv-low";

  return (
    <div className="wx">
      {/* ── Top: Selected Day Detail ── */}
      <div className="wx-detail">
        <div className="wx-detail-top">
          <span className="wx-detail-emoji">{emoji}</span>
          <div className="wx-detail-main">
            <span className="wx-detail-temp">{displayTemp}°</span>
            <span className="wx-detail-unit">F</span>
          </div>
        </div>

        <div className="wx-detail-info">
          <p className="wx-detail-condition">{condition}</p>
          <p className="wx-detail-location">{forecast.location}</p>
        </div>

        <p className="wx-detail-range">
          H: {Math.round(day.temp_high_f)}°{"  "}L: {Math.round(day.temp_low_f)}°
        </p>

        <p className="wx-detail-summary">{summary}</p>

        <div className="wx-pills">
          <div className="wx-pill">
            <span className="wx-pill-icon">{day.precipitation_in > 0 ? "\uD83C\uDF27\uFE0F" : "\uD83D\uDCA7"}</span>
            <span className="wx-pill-value">{day.precipitation_in}"</span>
            <span className="wx-pill-label">Precip</span>
          </div>
          {day.humidity != null && (
            <div className="wx-pill">
              <span className="wx-pill-icon">{"\uD83D\uDCA6"}</span>
              <span className="wx-pill-value">{Math.round(day.humidity)}%</span>
              <span className="wx-pill-label">Humidity</span>
            </div>
          )}
          <div className="wx-pill">
            <span className="wx-pill-icon">{"\uD83D\uDCA8"}</span>
            <span className="wx-pill-value">{Math.round(day.wind_speed_mph)}</span>
            <span className="wx-pill-label">mph</span>
          </div>
          <div className="wx-pill">
            <span className="wx-pill-icon">{"\u2600\uFE0F"}</span>
            <span className={`wx-pill-value ${uvClass}`}>{uvLevel}</span>
            <span className="wx-pill-label">UV</span>
          </div>
        </div>
      </div>

      {/* ── Bottom: 7-Day Selector ── */}
      <div className="wx-forecast">
        {forecast.days.map((d, i) => {
          const dt = new Date(d.date + "T00:00:00");
          const abbr = i === 0 ? "Today" : DAY_ABBR[dt.getDay()];
          const active = i === selectedIdx;
          return (
            <button
              key={d.date}
              className={`wx-day ${active ? "wx-day-active" : ""}`}
              onClick={() => setSelectedIdx(i)}
            >
              <span className="wx-day-name">{abbr}</span>
              <span className="wx-day-emoji">{weatherEmoji(d.weathercode)}</span>
              <span className="wx-day-temps">
                <span className="wx-day-high">{Math.round(d.temp_high_f)}°</span>
                <span className="wx-day-low">{Math.round(d.temp_low_f)}°</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
