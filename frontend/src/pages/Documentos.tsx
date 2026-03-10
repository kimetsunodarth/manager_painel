import { useState, useEffect, useRef } from 'react';
import { documents as api, type DocumentItem } from '../api/client';

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
  const user = JSON.parse(localStorage.getItem('user') || '{}') as { role?: string };
  const isAdmin = user.role === 'admin';

  const [list, setList] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">Documentos</h2>
      <p className="text-sm text-gray-500 mb-4">Propriedades do servidor</p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-gray-800">
            Lista de documentos cadastrados
          </h3>
          {isAdmin && (
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
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
                >
                  {uploading ? 'Enviando...' : 'Importar documento'}
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  disabled={actionLoading === 'clear' || list.length === 0}
                  className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 text-sm font-medium"
                >
                  {actionLoading === 'clear' ? 'Limpando...' : 'Limpar tudo'}
                </button>
              </div>
            </>
          )}
        </div>
        {uploadError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-sm text-red-700">
            {uploadError}
          </div>
        )}
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Arquivo</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Data de Upload</th>
                <th className="text-left py-2 px-4 font-semibold text-gray-700">Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">{row.arquivo}</td>
                  <td className="py-3 px-4">{row.dataUpload}</td>
                  <td className="py-3 px-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onDownload(row.id, row.arquivo)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
                    >
                      Download
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          disabled={!!actionLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
                        >
                          {actionLoading === row.id ? '...' : 'Editar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          disabled={!!actionLoading}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading === row.id ? '...' : 'Excluir'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
