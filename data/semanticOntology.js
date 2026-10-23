export const CANONICAL_FIELD_SCHEMA = {
  temperature: { type: 'number', unit: '°C' },
  smoke: { type: 'number', unit: 'AQI' },
  fire_alarm: { type: 'boolean' },
  occupancy: { type: 'number', unit: 'people' },
  accessible: { type: 'boolean' },
  co2: { type: 'number', unit: 'ppm' },
  humidity: { type: 'number', unit: '%' },
  light_level: { type: 'number', unit: 'lux' },
  power_usage: { type: 'number', unit: 'kW' }
};

export const FIELD_CANONICAL_NAMES = new Set(Object.keys(CANONICAL_FIELD_SCHEMA));
