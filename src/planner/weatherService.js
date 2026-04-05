// weatherService.js
// Fetches Bristol, VA weather from Open-Meteo (no API key needed)
// and upserts it into Supabase's weather_log table.

const LOCATION = {
  latitude: 36.5957,
  longitude: -82.1679,
  label: "Bristol, VA",
};

// WMO weather code -> human-readable condition
export function parseCondition(code) {
  if (code === 0) return "Clear Sky";
  if (code === 1) return "Mostly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([71, 73, 75].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain Showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Unknown";
}

// WMO code -> emoji
export function weatherEmoji(code) {
  if (code === 0 || code === 1) return "\u2600\uFE0F";
  if (code === 2) return "\u26C5";
  if (code === 3) return "\u2601\uFE0F";
  if ([45, 48].includes(code)) return "\uD83C\uDF2B\uFE0F";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "\uD83C\uDF27\uFE0F";
  if ([71, 73, 75].includes(code)) return "\u2744\uFE0F";
  if ([95, 96, 99].includes(code)) return "\u26C8\uFE0F";
  return "\uD83C\uDF21\uFE0F";
}

// Generate a plain-language summary for the day
export function generateSummary(day) {
  const parts = [];
  const condition = parseCondition(day.weathercode);

  if ([61, 63, 65, 80, 81, 82].includes(day.weathercode)) {
    parts.push("Rain expected today");
  } else if ([51, 53, 55].includes(day.weathercode)) {
    parts.push("Light drizzle expected");
  } else if ([71, 73, 75].includes(day.weathercode)) {
    parts.push("Snow expected today");
  } else if ([95, 96, 99].includes(day.weathercode)) {
    parts.push("Thunderstorms likely");
  } else if (day.weathercode <= 1) {
    parts.push("Clear skies today");
  } else if (day.weathercode === 2) {
    parts.push("Partly cloudy skies");
  } else if (day.weathercode === 3) {
    parts.push("Overcast skies");
  } else if ([45, 48].includes(day.weathercode)) {
    parts.push("Foggy conditions");
  }

  if (day.precipitation_in > 0.1) {
    parts.push(`up to ${day.precipitation_in}" of precipitation`);
  }

  if (day.uv_index >= 8) {
    parts.push("very high UV \u2014 wear sunscreen");
  } else if (day.uv_index >= 6) {
    parts.push("high UV exposure");
  }

  if (day.wind_speed_mph >= 20) {
    parts.push(`gusty winds up to ${Math.round(day.wind_speed_mph)} mph`);
  }

  return parts.length > 0 ? parts.join(", ") + "." : `${condition} expected.`;
}

// Fetch 7-day forecast from Open-Meteo
export async function fetchWeather() {
  const { latitude, longitude } = LOCATION;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "uv_index_max",
    "weathercode",
    "windspeed_10m_max",
    "relative_humidity_2m_max",
  ].join(","));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "America/New_York");
  url.searchParams.set("forecast_days", "7");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json();

  const daily = data.daily;
  const current = data.current_weather;

  const days = daily.time.map((date, i) => ({
    date,
    temp_high_f: daily.temperature_2m_max[i],
    temp_low_f: daily.temperature_2m_min[i],
    precipitation_in: +(daily.precipitation_sum[i] || 0).toFixed(2),
    uv_index: daily.uv_index_max[i],
    weathercode: daily.weathercode[i],
    wind_speed_mph: daily.windspeed_10m_max?.[i] ?? current.windspeed,
    humidity: daily.relative_humidity_2m_max?.[i] ?? null,
  }));

  return {
    location: LOCATION.label,
    current_temp_f: current.temperature,
    current_code: current.weathercode,
    current_wind_mph: current.windspeed,
    days,
  };
}

// Upsert today's weather into Supabase weather_log
export async function syncWeatherToSupabase(supabase) {
  const forecast = await fetchWeather();
  const today = forecast.days[0];

  const row = {
    date: today.date,
    location: forecast.location,
    temp_high_f: today.temp_high_f,
    temp_low_f: today.temp_low_f,
    temp_current_f: forecast.current_temp_f,
    precipitation_mm: today.precipitation_in * 25.4, // keep DB in mm
    wind_speed_mph: forecast.current_wind_mph,
    uv_index: today.uv_index,
    condition: parseCondition(today.weathercode),
    condition_code: today.weathercode,
  };

  const { error } = await supabase
    .from("weather_log")
    .upsert(row, { onConflict: "date" });

  if (error) throw error;
  return forecast;
}

// Fetch the most recent weather_log entry from Supabase
export async function getTodayWeather(supabase) {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("weather_log")
    .select("*")
    .eq("date", today)
    .maybeSingle();

  if (error) throw error;
  return data;
}
