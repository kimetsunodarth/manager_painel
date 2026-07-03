import { useState, useEffect, useRef } from 'react';
import { documents as api, type DocumentItem } from '../api/client';
import { useUser } from '../hooks/useUser';
import PageHeader from '../components/PageHeader';

function getBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64 || '');
    };
    reader.onerror = reject;
  });
}

export default function Documentos() {
  const user = useUser();
  const isAdmin = user?.role === 'admin';

  const [list, setList] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchList = () => {
    setLoading(true);
    api
      .list()
      .then(setList)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchList();
  }, []);

  const onImportClick = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const MAX_SIZE = 52428800; // 50 MB
    if (file.size > MAX_SIZE) {
      setUploadError('Arquivo muito grande. O tamanho máximo permitido é 50 MB.');
      return;
    }
    setUploadError(null);
    setUploading(true);
    try {
      const base64 = await getBase64(file);
      await api.upload(file.name, base64);
      fetchList();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { error?: string } }; message?: string };
      setUploadError(ex.response?.data?.error || ex.message || 'Erro ao importar documento.');
    } finally {
      setUploading(false);
    }
  };

  const onDownload = async (id: string, fileName: string) => {
    setDownloading(id);
    try {
      const res = await fetch(`/api/documents/${id}/download`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha no download');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || id;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const ex = err as { message?: string };
      setUploadError(ex.message || 'Erro ao baixar');
    } finally {
      setDownloading(null);
    }
  };

  const onClearAll = async () => {
    if (!window.confirm('Remover todos os documentos? Esta ação não pode ser desfeita.')) return;
    setUploadError(null);
    setActionLoading('clear');
    try {
      await api.clear();
      fetchList();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { error?: string } }; message?: string };
      setUploadError(ex.response?.data?.error || ex.message || 'Erro ao limpar.');
    } finally {
      setActionLoading(null);
    }
  };

  const onEdit = async (row: DocumentItem) => {
    const newName = window.prompt('Novo nome do arquivo:', row.arquivo);
    if (newName == null || newName.trim() === '' || newName === row.arquivo) return;
    setUploadError(null);
    setActionLoading(row.id);
    try {
      await api.update(row.id, newName.trim());
      fetchList();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { error?: string } }; message?: string };
      setUploadError(ex.response?.data?.error || ex.message || 'Erro ao editar.');
    } finally {
      setActionLoading(null);
    }
  };

  const onDelete = async (row: DocumentItem) => {
    if (!window.confirm(`Excluir o documento "${row.arquivo}"?`)) return;
    setUploadError(null);
    setActionLoading(row.id);
    try {
      await api.delete(row.id);
      fetchList();
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { error?: string } }; message?: string };
      setUploadError(ex.response?.data?.error || ex.message || 'Erro ao excluir.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="ananim-page">
      <PageHeader
        badge="Documentos"
        title="Documentos"
        description="Centralize arquivos operacionais do painel com upload, download e manutenção em uma leitura mais direta."
        actions={
          isAdmin ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={onFileChange}
                accept="*/*"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onImportClick}
                  disabled={uploading}
                  className="ananim-btn-primary"
                >
                  {uploading ? 'Enviando...' : 'Importar documento'}
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={actionLoading === 'clear' || list.length === 0}
                  className="ananim-btn text-amber-100 border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15 disabled:opacity-50"
                >
                  {actionLoading === 'clear' ? 'Limpando...' : 'Limpar tudo'}
                </button>
              </div>
            </>
          ) : null
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="ananim-metric">
          <p className="ananim-metric-label">Arquivos</p>
          <p className="ananim-metric-value">{list.length}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Perfil</p>
          <p className="ananim-metric-value">{isAdmin ? 'Administrador' : 'Leitura'}</p>
        </div>
        <div className="ananim-metric">
          <p className="ananim-metric-label">Status</p>
          <p className="ananim-metric-value">{loading ? 'Carregando' : 'Atualizado'}</p>
        </div>
      </div>

      <div className="ananim-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4 md:p-5">
          <h3 className="ananim-section-title">Lista de documentos cadastrados</h3>
          {isAdmin && (
            <span className="ananim-chip">Gestão completa</span>
          )}
        </div>
        {uploadError && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {uploadError}
          </div>
        )}
        {loading ? (
          <div className="p-8 text-center text-ananim-muted">Carregando...</div>
        ) : (
          <div className="ananim-table-wrap">
            <table className="ananim-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Data de Upload</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium text-ananim-text">{row.arquivo}</td>
                    <td>{row.dataUpload}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onDownload(row.id, row.arquivo)}
                          disabled={downloading === row.id}
                          className="ananim-btn-soft"
                        >
                          {downloading === row.id ? 'Baixando...' : 'Download'}
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEdit(row)}
                              disabled={!!actionLoading}
                              className="ananim-btn-ghost"
                            >
                              {actionLoading === row.id ? '...' : 'Editar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(row)}
                              disabled={!!actionLoading}
                              className="ananim-btn text-red-200 border border-red-500/20 bg-red-500/10 hover:bg-red-500/15 disabled:opacity-50"
                            >
                              {actionLoading === row.id ? '...' : 'Excluir'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end border-t border-white/10 p-4">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="ananim-btn-ghost"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
