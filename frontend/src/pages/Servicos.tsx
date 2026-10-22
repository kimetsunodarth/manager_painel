import { getHomeProjectSelection } from '../utils/homeProjectSelection';
import PageHeader from '../components/PageHeader';
import AgentServicesPanel from '../components/AgentServicesPanel';
import { projectKeyOf } from '../api/agent';
import { useUser } from '../hooks/useUser';

/** "sa-brazil-1_Ecoa" → "Ecoa". */
const nomeCliente = (nome: string) => nome.replace(/^[a-z]{2}-[a-z]+-\d+_/i, '') || nome;
const chave = (p: { id: string; perfil?: string | null }) => projectKeyOf({ id: p.id, perfil: p.perfil ?? undefined });

/**
 * Serviços pelo Ananim Manager Agent: o que foi liberado em cada servidor do cliente escolhido na Home,
 * separado em banco/HANA e servidor web. (O modelo antigo por SSH foi removido.)
 */
export default function Servicos() {
  const user = useUser();
  const guardado = getHomeProjectSelection()?.project ?? null;
  const visiveis = user?.visibleProjects ?? [];
  // Cliente: o projeto guardado no navegador só vale se ainda estiver na visão dele (ex.: projeto removido em Usuários).
  const projeto = user?.role === 'admin'
    ? guardado
    : (guardado && visiveis.some((p) => chave(p) === chave(guardado)) ? guardado : visiveis[0] ?? null);
  const projectKey = projeto ? chave(projeto) : undefined;
  return (
    <div className="ananim-page">
      <PageHeader badge="Serviços" title={projeto ? `Serviços ${nomeCliente(projeto.name || projeto.id)}` : 'Serviços'}
        description="Iniciar, parar e reiniciar os serviços liberados nos servidores deste cliente, pelo conector instalado em cada servidor." />
      <AgentServicesPanel projectKey={projectKey} alwaysShow />
    </div>
  );
}
