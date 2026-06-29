export type user_location = {
  city: string;
  lat?: number;
  lng?: number;
};

const storage_key = 'yoboba_location';

export const default_store_address = 'Кимры, ул. Урицкого, 12';

export const demo_cities = [
  'москва',
  'санкт-петербург',
  'казань',
  'новосибирск',
  'екатеринбург',
  'кимры',
  'тверь',
  'ярославль',
];

export const store_cities = demo_cities;

export function normalize_city(city: string): string {
  return city.trim().toLowerCase().replace(/ё/g, 'е');
}

export function is_city_served(city: string): boolean {
  const normalized = normalize_city(city);
  return store_cities.some((store_city) => normalize_city(store_city) === normalized);
}

export function get_location(): user_location | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(storage_key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as user_location;
  } catch {
    return null;
  }
}

export function set_location(location: user_location) {
  localStorage.setItem(storage_key, JSON.stringify(location));
}

export function clear_location() {
  localStorage.removeItem(storage_key);
}

async function reverse_geocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ru`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'yoboba-pwa/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const city =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.municipality ||
      data.address?.county;
    return city ? String(city).toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function detect_location(): Promise<user_location> {
  if (!('geolocation' in navigator)) {
    throw new Error('геолокация недоступна');
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 300000,
    });
  });

  const { latitude: lat, longitude: lng } = pos.coords;
  const city = (await reverse_geocode(lat, lng)) || 'москва';

  const location: user_location = { city, lat, lng };
  set_location(location);
  return location;
}
