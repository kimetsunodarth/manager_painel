// Dados de ambientes. Em produção vir da Huawei API ou do CBR/change_disk. Lista vazia para trabalhar com os novos dados.
export const environments = [];

export function filterEnvironments(filters = {}) {
  let list = [...environments];
  if (filters.ip) list = list.filter((e) => e.ip.includes(filters.ip));
  if (filters.pais) list = list.filter((e) => e.pais === filters.pais);
  if (filters.vlan) list = list.filter((e) => e.vlan.includes(filters.vlan));
  if (filters.ambiente) list = list.filter((e) => e.tipoAmbiente === filters.ambiente);
  if (filters.cliente) list = list.filter((e) => e.cliente.toLowerCase().includes(String(filters.cliente).toLowerCase()));
  if (filters.parceiro) list = list.filter((e) => e.parceiro.toLowerCase().includes(String(filters.parceiro).toLowerCase()));
  if (filters.erp) list = list.filter((e) => e.erp.toLowerCase().includes(String(filters.erp).toLowerCase()));
  return list;
}
