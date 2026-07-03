const LEGACY_SERVICE_ID_MAP = {
  'reiniciar-banco-hana': 'hana',
  'reiniciar-service-layer-hana': 'serviceLayer',
  'reiniciar-sld-hana': 'sld',
  servicelayer: 'serviceLayer',
};

export function normalizeServiceId(serviceId) {
  const normalized = typeof serviceId === 'string' ? serviceId.trim() : '';
  if (!normalized) return normalized;
  return LEGACY_SERVICE_ID_MAP[normalized] || LEGACY_SERVICE_ID_MAP[normalized.toLowerCase()] || normalized;
}

export function normalizeAllowedServiceIds(serviceIds) {
  if (!Array.isArray(serviceIds)) return [];
  return [...new Set(serviceIds.map(normalizeServiceId).filter(Boolean))];
}
