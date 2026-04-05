// weatherService.js
// Fetches Nashville weather from Open-Meteo (no API key needed)
// and upserts it into Supabase's weather_log table.

const NASHVILLE = {
  latitude: 36.1627,
  longitude: -86.7816,
  label: "Nashville, TN",
};

// WMO weather code → human-readable condition
function parseCondition(code) {
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

// Fetch today's weather from Open-Meteo
export async function fetchNashvilleWeather() {
  const { latitude, longitude } = NASHVILLE;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("daily", [
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "uv_index_max",
    "weathercode",
  ].join(","));
  url.searchParams.set("current_weather", "true");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", "America/Chicago");
  url.searchParams.set("forecast_days", "1");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json();

  const daily = data.daily;
  const current = data.current_weather;
  const today = daily.time[0]; // 'YYYY-MM-DD'

  return {
    date: today,
    location: NASHVILLE.label,
    temp_high_f: daily.temperature_2m_max[0],
    temp_low_f: daily.temperature_2m_min[0],
    temp_current_f: current.temperature,
    precipitation_mm: daily.precipitation_sum[0],
    wind_speed_mph: current.windspeed,
    uv_index: daily.uv_index_max[0],
    condition: parseCondition(daily.weathercode[0]),
    condition_code: daily.weathercode[0],
  };
}

// Upsert today's weather into Supabase weather_log
// Pass in your Supabase client instance
export async function syncWeatherToSupabase(supabase) {
  const weather = await fetchNashvilleWeather();

  const { error } = await supabase
    .from("weather_log")
    .upsert(weather, { onConflict: "date" });

  if (error) throw error;
  return weather;
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
