// Lista de backups/snapshots do dia (mock). Em produção usar CBR API como no projeto cbr.
export const backups = [
  { ipAmbiente: '10.120.56.227', cliente: 'ELEVA BRASIL SA', parceiro: 'RAMO SISTEMAS DIGITAIS LTDA', nomeBackup: 'Backup_3520_20260121_2212.tar.gz', tamanho: 11947186893 },
  { ipAmbiente: '10.120.56.227', cliente: 'ELEVA BRASIL SA', parceiro: 'RAMO SISTEMAS DIGITAIS LTDA', nomeBackup: 'Backup_3520_20260128_2242.tar.gz', tamanho: 12154455509 },
  { ipAmbiente: '10.120.56.228', cliente: 'CHEMICALTEC', parceiro: 'RAMO SISTEMAS DIGITAIS LTDA', nomeBackup: 'Backup_3521_20260128_2300.tar.gz', tamanho: 8950000000 },
];

export function searchBackups(q, page = 1, perPage = 10) {
  let list = [...backups];
  if (q) {
    const lower = q.toLowerCase();
    list = list.filter(
      (b) =>
        b.ipAmbiente.includes(q) ||
        b.cliente.toLowerCase().includes(lower) ||
        b.parceiro.toLowerCase().includes(lower) ||
        b.nomeBackup.toLowerCase().includes(lower)
    );
  }
  const total = list.length;
  const start = (page - 1) * perPage;
  const items = list.slice(start, start + perPage);
  return { items, total, page, perPage };
}
