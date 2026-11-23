import { Injectable, computed, effect, signal } from '@angular/core';
import { AppData, CatalogItem, CatalogType, MonthlyExpense, Recipe, RecipeLine, seed, toBase, unitFamily } from './models';

const STORAGE_KEY = 'sweet-lizzi-costos-v1';
const clone = <T>(value: T): T => structuredClone(value);

export const newId = (): string => crypto.randomUUID();

function validCatalogItem(item: CatalogItem): boolean {
  return typeof item?.id === 'string' && typeof item.name === 'string' && item.name.trim().length > 0 &&
    Number.isFinite(item.quantity) && item.quantity > 0 &&
    Number.isFinite(item.price) && item.price >= 0 &&
    ['g', 'kg', 'ml', 'l', 'cm', 'm', 'unidad'].includes(item.unit);
}
function isValidData(data: unknown): data is AppData {
  if (data === null || typeof data !== 'object') return false;
  const d = data as Partial<AppData>;
  return Array.isArray(d.ingredients) && d.ingredients.every(validCatalogItem) &&
    Array.isArray(d.materials) && d.materials.every(validCatalogItem) &&
    Array.isArray(d.expenses) && d.expenses.every(e => typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.amount) && e.amount >= 0) &&
    Number.isFinite(d.monthlyProduction) && (d.monthlyProduction ?? 0) > 0 &&
    (d.hourlyRate === undefined || (Number.isFinite(d.hourlyRate) && d.hourlyRate >= 0)) &&
    (d.deliveryFee === undefined || (Number.isFinite(d.deliveryFee) && d.deliveryFee >= 0)) &&
    Array.isArray(d.recipes) && d.recipes.every(r => typeof r.id === 'string' && typeof r.name === 'string' &&
      Number.isFinite(r.yield) && r.yield > 0 && Number.isFinite(r.labor) && r.labor >= 0 &&
      (r.laborHours === undefined || (Number.isFinite(r.laborHours) && r.laborHours >= 0)) &&
      (r.hourlyRate === undefined || (Number.isFinite(r.hourlyRate) && r.hourlyRate >= 0)) &&
      (r.laborMinutes === undefined || (Number.isFinite(r.laborMinutes) && r.laborMinutes >= 0)) &&
      (r.hasDelivery === undefined || typeof r.hasDelivery === 'boolean') &&
      Number.isFinite(r.delivery) && r.delivery >= 0 && Number.isFinite(r.other) && r.other >= 0 &&
      Number.isFinite(r.margin) && r.margin >= 0 && r.margin < 100 && Array.isArray(r.lines) &&
      r.lines.every(l => typeof l.id === 'string' && ['ingredient', 'material'].includes(l.catalogType) &&
        typeof l.catalogId === 'string' && Number.isFinite(l.quantity) && l.quantity > 0 &&
        ['g', 'kg', 'ml', 'l', 'cm', 'm', 'unidad'].includes(l.unit)));
}
function readSaved(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidData(parsed)) return parsed;
    }
  } catch { /* Navegador sin almacenamiento habilitado o respaldo inválido */ }
  return clone(seed);
}

@Injectable({providedIn: 'root'})
export class CostStore {
  private readonly _data = signal<AppData>(readSaved());
  readonly data = this._data.asReadonly();
  readonly monthlyTotal = computed(() => this.data().expenses.reduce((sum, item) => sum + item.amount, 0));
  readonly overheadPerUnit = computed(() => this.monthlyTotal() / Math.max(1, this.data().monthlyProduction));

  constructor() {
    effect(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data())); }
      catch { /* El usuario puede exportar el respaldo manualmente */ }
    });
  }

  catalog(type: CatalogType): CatalogItem[] {
    return type === 'ingredient' ? this.data().ingredients : this.data().materials;
  }
  findItem(type: CatalogType, id: string): CatalogItem | undefined {
    return this.catalog(type).find(item => item.id === id);
  }
  unitCost(item: CatalogItem): number {
    return item.price / toBase(item.quantity, item.unit);
  }
  lineCost(line: RecipeLine): number {
    const item = this.findItem(line.catalogType, line.catalogId);
    if (!item || unitFamily(item.unit) !== unitFamily(line.unit)) return 0;
    return toBase(line.quantity, line.unit) * this.unitCost(item);
  }
  ingredientTotal(recipe: Recipe): number {
    return recipe.lines.filter(l => l.catalogType === 'ingredient').reduce((sum, l) => sum + this.lineCost(l), 0);
  }
  materialTotal(recipe: Recipe): number {
    return recipe.lines.filter(l => l.catalogType === 'material').reduce((sum, l) => sum + this.lineCost(l), 0);
  }
  hourlyRate(): number { return this.data().hourlyRate ?? 0; }
  deliveryFee(): number { return this.data().deliveryFee ?? 0; }
  laborCost(recipe: Recipe): number {
    if (recipe.laborMinutes !== undefined) return recipe.laborMinutes / 60 * this.hourlyRate();
    return recipe.laborHours !== undefined && recipe.hourlyRate !== undefined
      ? recipe.laborHours * recipe.hourlyRate : recipe.labor;
  }
  deliveryCost(recipe: Recipe): number {
    return recipe.hasDelivery === undefined ? recipe.delivery : recipe.hasDelivery ? this.deliveryFee() : 0;
  }
  overheadTotal(recipe: Recipe): number { return this.overheadPerUnit() * recipe.yield; }
  totalCost(recipe: Recipe): number {
    return this.ingredientTotal(recipe) + this.materialTotal(recipe) + this.overheadTotal(recipe) + this.laborCost(recipe) + this.deliveryCost(recipe) + recipe.other;
  }
  unitRecipeCost(recipe: Recipe): number { return this.totalCost(recipe) / Math.max(1, recipe.yield); }
  suggestedUnitPrice(recipe: Recipe): number {
    return this.unitRecipeCost(recipe) / (1 - recipe.margin / 100);
  }

  upsertCatalog(type: CatalogType, item: CatalogItem): void {
    this._data.update(old => {
      const next = clone(old), list = type === 'ingredient' ? next.ingredients : next.materials;
      const index = list.findIndex(current => current.id === item.id);
      if (index === -1) list.push(clone(item)); else list[index] = clone(item);
      return next;
    });
  }
  isUsed(type: CatalogType, id: string): boolean {
    return this.data().recipes.some(recipe => recipe.lines.some(line => line.catalogType === type && line.catalogId === id));
  }
  removeCatalog(type: CatalogType, id: string): boolean {
    if (this.isUsed(type, id)) return false;
    this._data.update(old => ({...old, [type === 'ingredient' ? 'ingredients' : 'materials']:
      old[type === 'ingredient' ? 'ingredients' : 'materials'].filter(item => item.id !== id)}));
    return true;
  }
  upsertExpense(expense: MonthlyExpense): void {
    this._data.update(old => {
      const list = clone(old.expenses), index = list.findIndex(item => item.id === expense.id);
      if (index === -1) list.push(clone(expense)); else list[index] = clone(expense);
      return {...old, expenses: list};
    });
  }
  removeExpense(id: string): void {
    this._data.update(old => ({...old, expenses: old.expenses.filter(item => item.id !== id)}));
  }
  setMonthlyProduction(production: number): void {
    if (Number.isFinite(production) && production > 0) this._data.update(old => ({...old, monthlyProduction: production}));
  }
  setHourlyRate(rate: number): void {
    if (Number.isFinite(rate) && rate >= 0) this._data.update(old => ({...old, hourlyRate: rate}));
  }
  setDeliveryFee(fee: number): void {
    if (Number.isFinite(fee) && fee >= 0) this._data.update(old => ({...old, deliveryFee: fee}));
  }
  upsertRecipe(recipe: Recipe): void {
    this._data.update(old => {
      const recipes = clone(old.recipes), index = recipes.findIndex(item => item.id === recipe.id);
      if (index === -1) recipes.push(clone(recipe)); else recipes[index] = clone(recipe);
      return {...old, recipes};
    });
  }
  removeRecipe(id: string): void {
    this._data.update(old => ({...old, recipes: old.recipes.filter(item => item.id !== id)}));
  }
  updateRecipe(id: string, action: (recipe: Recipe) => void): void {
    this._data.update(old => {
      const recipes = clone(old.recipes), recipe = recipes.find(item => item.id === id);
      if (recipe) action(recipe);
      return {...old, recipes};
    });
  }
  restore(raw: unknown): boolean {
    if (!isValidData(raw)) return false;
    // Comprobar referencias y unidades para no ocultar costos al importar.
    const imported = raw as AppData;
    for (const recipe of imported.recipes) {
      for (const line of recipe.lines) {
        const items = line.catalogType === 'ingredient' ? imported.ingredients : imported.materials;
        const item = items.find(candidate => candidate.id === line.catalogId);
        if (!item || unitFamily(item.unit) !== unitFamily(line.unit)) return false;
      }
    }
    this._data.set(clone(imported));
    return true;
  }
}
