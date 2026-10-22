import { getHomeProjectSelection } from '../utils/homeProjectSelection';
import PageHeader from '../components/PageHeader';
import AgentServicesPanel from '../components/AgentServicesPanel';
import { projectKeyOf } from '../api/agent';

/** "sa-brazil-1_Ecoa" → "Ecoa". */
const nomeCliente = (nome: string) => nome.replace(/^[a-z]{2}-[a-z]+-\d+_/i, '') || nome;

/**
 * Serviços pelo Ananim Manager Agent: o que foi liberado em cada servidor do cliente escolhido na Home,
 * separado em banco/HANA e servidor web. (O modelo antigo por SSH foi removido.)
 */
export default function Servicos() {
  const projeto = getHomeProjectSelection()?.project;
  const projectKey = projeto ? projectKeyOf({ id: projeto.id, perfil: projeto.perfil ?? undefined }) : undefined;
  return (
    <div className="ananim-page">
      <PageHeader badge="Serviços" title={projeto ? `Serviços ${nomeCliente(projeto.name)}` : 'Serviços'}
        description="Iniciar, parar e reiniciar os serviços liberados nos servidores deste cliente, pelo conector instalado em cada servidor." />
      <AgentServicesPanel projectKey={projectKey} alwaysShow />
    </div>
  );
}
