import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  ListChecks,
  PackageSearch,
  Settings,
  ShoppingBasket,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader/PageHeader';
import { EmptyState } from '../../components/StateView/StateView';

type PlaceholderContent = {
  title: string;
  description: string;
  stateTitle: string;
  stateDescription: string;
  icon: LucideIcon;
};

const pages: Record<string, PlaceholderContent> = {
  lista: {
    title: 'Lista de compras',
    description: 'Um espaço compartilhado para lembrar do que a casa precisa.',
    stateTitle: 'Sua lista começa por aqui',
    stateDescription: 'Itens, quantidades e colaboração em tempo real chegarão na etapa funcional.',
    icon: ListChecks,
  },
  comprar: {
    title: 'Modo compra',
    description: 'Uma experiência rápida para acompanhar tudo no supermercado.',
    stateTitle: 'Pronto para acompanhar a compra',
    stateDescription:
      'O fluxo guiado será ativado quando a lista compartilhada estiver disponível.',
    icon: ShoppingBasket,
  },
  produtos: {
    title: 'Produtos',
    description: 'A memória dos produtos que fazem parte da rotina da sua Casa.',
    stateTitle: 'Um catálogo feito pela sua Casa',
    stateDescription: 'Produtos e preferências aparecerão aqui conforme forem usados nas listas.',
    icon: PackageSearch,
  },
  historico: {
    title: 'Histórico',
    description: 'Compras concluídas preservadas com os dados de cada momento.',
    stateTitle: 'O passado sem perder contexto',
    stateDescription:
      'Cada compra futura manterá seus próprios preços, produtos e estabelecimento.',
    icon: Clock3,
  },
  gastos: {
    title: 'Gastos',
    description: 'Uma visão simples do que entra no orçamento doméstico.',
    stateTitle: 'Clareza para cuidar do orçamento',
    stateDescription: 'Os gastos aparecerão aqui após as primeiras compras registradas.',
    icon: ChartNoAxesColumnIncreasing,
  },
  mercados: {
    title: 'Mercados',
    description: 'Os estabelecimentos que fazem parte da rotina de compras.',
    stateTitle: 'Seus mercados, organizados',
    stateDescription: 'Locais frequentes e seus históricos serão reunidos neste espaço.',
    icon: Store,
  },
  configuracoes: {
    title: 'Configurações',
    description: 'Preferências pessoais e da Casa em um só lugar.',
    stateTitle: 'A Casa do seu jeito',
    stateDescription: 'Conta, membros e preferências serão configurados nas próximas etapas.',
    icon: Settings,
  },
};

export function PlaceholderPage({ page }: { page: keyof typeof pages }) {
  const content = pages[page]!;

  return (
    <div className="placeholder-page">
      <PageHeader
        eyebrow="Organização da casa"
        title={content.title}
        description={content.description}
      />
      <section className="placeholder-surface" aria-label={`Estado inicial de ${content.title}`}>
        <EmptyState
          eyebrow="Preparado para evoluir"
          title={content.stateTitle}
          description={content.stateDescription}
          icon={content.icon}
        />
      </section>
    </div>
  );
}
