/**
 * Lista de serviços SAP B1/HANA conforme documento "Painel de Automação para SAP Business One".
 * Targets: Service Layer, SLD, HANA, Authentication, Reiniciar TUDO.
 * Pode ser sobrescrita pela variável de ambiente SAP_SERVICES_JSON (array JSON).
 */

const DEFAULT_SERVICES = [
  
  { id: 'serviceLayer', name: 'Reiniciar Service Layer', action: 'executar' },
  { id: 'sld', name: 'Reiniciar SLD', action: 'executar' },
  { id: 'hana', name: 'Reiniciar HANA (Cuidado)', action: 'executar' },
  { id: 'authentication', name: 'Reiniciar Authentication', action: 'executar' },
  { id: 'all', name: 'Reiniciar TUDO', action: 'executar' },
  
];

function loadFromEnv() {
  const raw = process.env.SAP_SERVICES_JSON;
  if (!raw || typeof raw !== 'string') return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    const valid = arr.every((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && ['listar', 'executar'].includes(s.action));
    return valid ? arr : null;
  } catch {
    return null;
  }
}

export function getServiceList() {
  const fromEnv = loadFromEnv();
  return fromEnv || DEFAULT_SERVICES;
}
