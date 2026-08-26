import {
  Apple,
  Beef,
  Croissant,
  HeartPulse,
  Milk,
  MoreHorizontal,
  PawPrint,
  Snowflake,
  Sparkles,
  Wheat,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import type { ShoppingCategory } from '../../domain/shopping-list';

export const shoppingCategoryIcons: Record<ShoppingCategory, LucideIcon> = {
  mercearia: Wheat,
  hortifruti: Apple,
  acougue: Beef,
  padaria: Croissant,
  bebidas: Wine,
  laticinios: Milk,
  congelados: Snowflake,
  limpeza: Sparkles,
  higiene: HeartPulse,
  pet: PawPrint,
  outros: MoreHorizontal,
};
