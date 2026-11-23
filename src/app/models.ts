export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'cm' | 'm' | 'unidad';
export type CatalogType = 'ingredient' | 'material';

export interface CatalogItem {
  id: string;
  name: string;
  quantity: number;        // Contenido de la presentación comprada
  unit: Unit;
  price: number;           // Precio de la presentación completa, CLP
}

export interface RecipeLine {
  id: string;
  catalogType: CatalogType;
  catalogId: string;
  quantity: number;        // Cantidad utilizada
  unit: Unit;              // Unidad de la cantidad utilizada
}

export interface Recipe {
  id: string;
  name: string;
  yield: number;           // Unidades vendibles que produce esta preparación
  lines: RecipeLine[];
  labor: number;           // Importe anterior; usado hasta registrar los minutos
  laborHours?: number;     // Horas del formato anterior
  hourlyRate?: number;     // Tarifa por receta del formato anterior
  laborMinutes?: number;   // Minutos de trabajo por preparación
  delivery: number;        // Importe anterior; usado hasta elegir si tiene delivery
  hasDelivery?: boolean;   // Aplica el costo de delivery configurado globalmente
  other: number;           // Gas o electricidad medidos por preparación, etc.
  margin: number;          // Margen sobre precio de venta, en % (no markup)
}

export interface MonthlyExpense {
  id: string;
  name: string;
  amount: number;
}

export interface AppData {
  ingredients: CatalogItem[];
  materials: CatalogItem[];
  expenses: MonthlyExpense[];
  monthlyProduction: number; // Nº de unidades vendibles previstas por mes
  hourlyRate?: number;     // Tarifa global de mano de obra, CLP por hora
  deliveryFee?: number;    // Costo global de delivery por preparación, CLP
  recipes: Recipe[];
}

export const unitFamily = (unit: Unit): string => {
  if (unit === 'g' || unit === 'kg') return 'weight';
  if (unit === 'ml' || unit === 'l') return 'volume';
  if (unit === 'cm' || unit === 'm') return 'length';
  return 'count';
};
export const unitsFor = (unit: Unit): Unit[] => {
  switch (unitFamily(unit)) {
    case 'weight': return ['g', 'kg'];
    case 'volume': return ['ml', 'l'];
    case 'length': return ['cm', 'm'];
    default: return ['unidad'];
  }
};
export const toBase = (quantity: number, unit: Unit): number =>
  quantity * (unit === 'kg' || unit === 'l' ? 1000 : unit === 'm' ? 100 : 1);

export const validNonnegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

export const seed: AppData = {
  ingredients: [
    {id: 'i1', name: 'Harina', quantity: 1, unit: 'kg', price: 1590},
    {id: 'i2', name: 'Azúcar', quantity: 1, unit: 'kg', price: 1390},
    {id: 'i3', name: 'Mantequilla', quantity: 250, unit: 'g', price: 2790},
    {id: 'i4', name: 'Chocolate cobertura', quantity: 500, unit: 'g', price: 5990},
    {id: 'i5', name: 'Huevos', quantity: 12, unit: 'unidad', price: 3390},
    {id: 'i6', name: 'Leche', quantity: 1, unit: 'l', price: 1290}
  ],
  materials: [
    {id: 'm1', name: 'Caja para brownies', quantity: 25, unit: 'unidad', price: 6250},
    {id: 'm2', name: 'Sticker de marca', quantity: 100, unit: 'unidad', price: 4500},
    {id: 'm3', name: 'Manga pastelera', quantity: 50, unit: 'unidad', price: 4500},
    {id: 'm4', name: 'Cápsula de papel', quantity: 100, unit: 'unidad', price: 2000}
  ],
  expenses: [
    {id: 'e1', name: 'Electricidad mensual', amount: 30000},
    {id: 'e2', name: 'Agua mensual', amount: 16000}
  ],
  monthlyProduction: 200,
  hourlyRate: 0,
  deliveryFee: 0,
  recipes: [
    {
      id: 'r1', name: 'Caja de 12 mini brownies', yield: 1,
      lines: [
        {id: 'l1', catalogType: 'ingredient', catalogId: 'i1', quantity: 180, unit: 'g'},
        {id: 'l2', catalogType: 'ingredient', catalogId: 'i2', quantity: 200, unit: 'g'},
        {id: 'l3', catalogType: 'ingredient', catalogId: 'i3', quantity: 120, unit: 'g'},
        {id: 'l4', catalogType: 'ingredient', catalogId: 'i4', quantity: 200, unit: 'g'},
        {id: 'l5', catalogType: 'ingredient', catalogId: 'i5', quantity: 3, unit: 'unidad'},
        {id: 'l6', catalogType: 'material', catalogId: 'm1', quantity: 1, unit: 'unidad'},
        {id: 'l7', catalogType: 'material', catalogId: 'm2', quantity: 1, unit: 'unidad'}
      ],
      labor: 2500, delivery: 0, other: 350, margin: 35
    }
  ]
};
