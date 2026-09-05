import { useEffect, useState } from 'react';
import { cloud8, type Cloud8ScheduleEntry } from '../api/client';

const TASK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ev_serverstart', label: 'Ligar' },
  { value: 'ev_serverstop', label: 'Desligar' },
  { value: 'ev_serverreboot', label: 'Reiniciar' },
];

/** Brasil não observa horário de verão atualmente — offset fixo -03:00. */
const BR_OFFSET_MS = 3 * 60 * 60 * 1000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Converte um ISO em UTC (o que a API do Cloud8 devolve, sufixo "+0000") pro valor de um <input type="datetime-local"> em horário do Brasil. */
function isoToBrazilDatetimeLocal(iso: string): string {
  const brazil = new Date(new Date(iso).getTime() - BR_OFFSET_MS);
  return `${brazil.getUTCFullYear()}-${pad(brazil.getUTCMonth() + 1)}-${pad(brazil.getUTCDate())}T${pad(brazil.getUTCHours())}:${pad(brazil.getUTCMinutes())}`;
}

/** Converte o valor de um <input type="datetime-local"> (entendido como horário do Brasil) pro formato que o Cloud8 espera (sufixo "-03:00" fixo, igual ao payload real capturado). */
function brazilDatetimeLocalToIso(value: string): string {
  return `${value}:00-03:00`;
}

/** Soma horas a um ISO no formato do Cloud8, preservando o sufixo "-03:00". */
function addHoursToCloud8Iso(iso: string, hours: number): string {
  const shifted = new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000);
  const brazil = new Date(shifted.getTime() - BR_OFFSET_MS);
  return `${brazil.getUTCFullYear()}-${pad(brazil.getUTCMonth() + 1)}-${pad(brazil.getUTCDate())}T${pad(brazil.getUTCHours())}:${pad(brazil.getUTCMinutes())}:${pad(brazil.getUTCSeconds())}-03:00`;
}

interface Cloud8ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  vmName: string;
  /** Id numérico do Cloud8 da VM (sem sufixo "s") — usado ao criar. */
  resourceId: string;
  /** Presente = editar essa programação existente; ausente = criar uma nova. */
  editing?: Cloud8ScheduleEntry | null;
}

export default function Cloud8ScheduleModal({ open, onClose, onSaved, vmName, resourceId, editing }: Cloud8ScheduleModalProps) {
  const [name, setName] = useState('');
  const [taskTypes, setTaskTypes] = useState<Set<string>>(new Set());
  const [datetime, setDatetime] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || '');
      setTaskTypes(new Set(editing.taskTypes.length ? editing.taskTypes : editing.taskType ? [editing.taskType] : []));
      setDatetime(editing.startDate ? isoToBrazilDatetimeLocal(editing.startDate) : '');
    } else {
      setName('');
      setTaskTypes(new Set());
      setDatetime('');
    }
    setEmail('');
    setError(null);
  }, [open, editing]);

  if (!open) return null;

  const toggleTaskType = (value: string) => {
    setTaskTypes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return setError('Nome é obrigatório.');
    if (taskTypes.size === 0) return setError('Selecione ao menos uma ação.');
    if (!datetime) return setError('Data e hora são obrigatórias.');

    setSaving(true);
    setError(null);
    try {
      const startDate = brazilDatetimeLocalToIso(datetime);
      const endDate = addHoursToCloud8Iso(startDate, 1);
      const payload = {
        name: name.trim(),
        resourceIds: editing?.resourceIds.length ? editing.resourceIds : [resourceId],
        taskTypes: Array.from(taskTypes) as ('ev_serverstart' | 'ev_serverstop' | 'ev_serverreboot')[],
        startDate,
        endDate,
        email: email.trim() || undefined,
      };
      if (editing?.id) {
        await cloud8.updateSchedule(Number(editing.id), { ...payload, scheduleId: Number(editing.scheduleId) });
      } else {
        await cloud8.createSchedule(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gravar programação no Cloud8.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="ananim-card w-full max-w-md p-6 shadow-lg shadow-black/30">
        <h3 className="text-lg font-medium text-white mb-1">{editing ? 'Alterar programação' : 'Nova programação'} — Cloud8</h3>
        <p className="text-sm text-ananim-textSoft mb-4">VM: <span className="font-medium text-white">{vmName}</span></p>

        {error && <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 text-red-200 rounded-lg text-sm">{error}</div>}

        <label className="block mb-3">
          <span className="ananim-label">Nome</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="ananim-input" placeholder="Ex.: Desligar fim de semana" />
        </label>

        <div className="mb-3">
          <span className="ananim-label block mb-1">Ação(ões)</span>
          <div className="flex flex-wrap gap-3">
            {TASK_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none text-sm text-ananim-text">
                <input type="checkbox" checked={taskTypes.has(opt.value)} onChange={() => toggleTaskType(opt.value)} className="rounded border-white/20 bg-transparent" />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <label className="block mb-3">
          <span className="ananim-label">Data e hora (horário de Brasília)</span>
          <input type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} className="ananim-input" />
        </label>

        <label className="block mb-4">
          <span className="ananim-label">E-mail de notificação (opcional)</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ananim-input" placeholder="opcional" />
        </label>

        <p className="text-xs text-ananim-muted mb-4">
          Execução única — recorrência (semanal etc.) ainda não é suportada por aqui. Pra repetir, cadastre direto no Cloud8.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="ananim-btn-ghost disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={handleSave} disabled={saving} className="ananim-btn-primary disabled:opacity-50">
            {saving ? 'Gravando...' : 'Gravar'}
          </button>
        </div>
      </div>
    </div>
  );
}
