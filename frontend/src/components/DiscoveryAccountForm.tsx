import { useState } from 'react';
import { api } from '../api/client';

export interface NewDiscoveryAccount { id: string; label: string; profile: string; region: string; projectId: string; available: boolean }

const REGIOES = [
  { id: 'sa-brazil-1', label: 'São Paulo (sa-brazil-1)' },
  { id: 'la-south-2', label: 'Santiago (la-south-2)' },
  { id: 'la-north-2', label: 'Cidade do México (la-north-2)' },
];

/** "Outra conta" na descoberta de projetos (só admin): AK/SK vão criptografados para o config.enc do servidor. */
export default function DiscoveryAccountForm({ onCreated }: { onCreated: (account: NewDiscoveryAccount) => void }) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ label: '', region: 'sa-brazil-1', ak: '', sk: '', projectId: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      const conta = await api<NewDiscoveryAccount>('/huawei/discovery-accounts', {
        method: 'POST',
        body: JSON.stringify({ label: form.label, regions: [form.region], ak: form.ak.trim(), sk: form.sk.trim(), projectId: form.projectId.trim() }),
      });
      setForm({ label: '', region: 'sa-brazil-1', ak: '', sk: '', projectId: '' });
      setAberto(false);
      onCreated(conta);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível cadastrar a conta.');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return <button type="button" className="ananim-btn-ghost mb-4 text-sm" onClick={() => setAberto(true)}>＋ Outra conta</button>;
  }
  return (
    <form onSubmit={salvar} className="mb-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-ananim-muted">Nome da conta
        <input className="ananim-input" value={form.label} onChange={set('label')} maxLength={60} required placeholder="ex.: Cliente X (São Paulo)" /></label>
      <label className="flex flex-col gap-1 text-xs text-ananim-muted">Região
        <select className="ananim-select" value={form.region} onChange={set('region')}>
          {REGIOES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select></label>
      <label className="flex flex-col gap-1 text-xs text-ananim-muted">Access Key (AK)
        <input className="ananim-input font-mono" value={form.ak} onChange={set('ak')} autoComplete="off" spellCheck={false} required /></label>
      <label className="flex flex-col gap-1 text-xs text-ananim-muted">Secret Key (SK)
        <input className="ananim-input font-mono" type="password" value={form.sk} onChange={set('sk')} autoComplete="new-password" required /></label>
      <label className="flex flex-col gap-1 text-xs text-ananim-muted sm:col-span-2">Project ID da região
        <input className="ananim-input font-mono" value={form.projectId} onChange={set('projectId')} autoComplete="off" spellCheck={false} required placeholder="32 caracteres" /></label>
      {erro ? <div className="ananim-alert ananim-alert-danger sm:col-span-2">{erro}</div> : null}
      <p className="text-xs text-ananim-muted sm:col-span-2">As chaves ficam criptografadas no servidor (config.enc) e não voltam para a tela.</p>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="ananim-btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
        <button type="submit" className="ananim-btn-soft" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar conta'}</button>
      </div>
    </form>
  );
}
