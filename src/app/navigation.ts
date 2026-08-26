import {
  ChartNoAxesColumnIncreasing,
  Clock3,
  House,
  ListChecks,
  PackageSearch,
  Settings,
  ShoppingBasket,
  Store,
  type LucideIcon,
} from 'lucide-react';

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  emphasized?: boolean;
};

export const desktopNavigation: NavigationItem[] = [
  { label: 'Início', path: '/', icon: House },
  { label: 'Lista', path: '/lista', icon: ListChecks },
  { label: 'Comprar', path: '/comprar', icon: ShoppingBasket, emphasized: true },
  { label: 'Produtos', path: '/produtos', icon: PackageSearch },
  { label: 'Histórico', path: '/historico', icon: Clock3 },
  { label: 'Gastos', path: '/gastos', icon: ChartNoAxesColumnIncreasing },
  { label: 'Mercados', path: '/mercados', icon: Store },
  { label: 'Configurações', path: '/configuracoes', icon: Settings },
];

export const desktopNavigationGroups = [
  { label: 'Rotina', items: desktopNavigation.slice(0, 3) },
  { label: 'Organização', items: desktopNavigation.slice(3) },
] as const;

export const mobileNavigation: NavigationItem[] = [
  desktopNavigation[0]!,
  desktopNavigation[1]!,
  desktopNavigation[2]!,
  desktopNavigation[3]!,
  { label: 'Mais', path: '/configuracoes', icon: Settings },
];
