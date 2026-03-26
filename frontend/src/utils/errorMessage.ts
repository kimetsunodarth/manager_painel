export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('401') || msg.toLowerCase().includes('não autorizado') || msg.toLowerCase().includes('unauthorized')) {
      return 'Sessão expirada. Faça login novamente.';
    }
    if (msg.includes('403') || msg.toLowerCase().includes('proibido') || msg.toLowerCase().includes('forbidden')) {
      return 'Sem permissão para esta ação.';
    }
    if (msg.includes('404')) return 'Recurso não encontrado.';
    if (msg.includes('500') || msg.includes('502') || msg.includes('503')) {
      return 'Erro interno do servidor. Tente novamente.';
    }
    if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('inacessível')) {
      return 'Servidor indisponível. Verifique sua conexão.';
    }
    return msg;
  }
  return 'Erro desconhecido.';
}
