import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostStore, newId } from './cost.store';
import { CatalogItem, CatalogType, MonthlyExpense, Recipe, RecipeLine, Unit, unitsFor, unitFamily, validNonnegative } from './models';

type Tab = 'dashboard' | 'ingredients' | 'materials' | 'expenses' | 'recipes';
interface NewLine { catalogType: CatalogType; catalogId: string; quantity: number; unit: Unit; }

const blankItem = (): CatalogItem => ({id: '', name: '', quantity: 1, unit: 'kg', price: 0});
const blankExpense = (): MonthlyExpense => ({id: '', name: '', amount: 0});
const formatCurrency = new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  readonly store = inject(CostStore);
  readonly tab = signal<Tab>('dashboard');
  readonly selectedRecipeId = signal<string | null>(this.store.data().recipes[0]?.id ?? null);
  readonly selectedRecipe = computed(() => this.store.data().recipes.find(r => r.id === this.selectedRecipeId()));
  readonly notice = signal('');
  readonly nav: {id: Tab; icon: string; label: string}[] = [
    {id: 'dashboard', icon: '◫', label: 'Resumen'},
    {id: 'recipes', icon: '▤', label: 'Mis recetas'},
    {id: 'ingredients', icon: '♧', label: 'Ingredientes'},
    {id: 'materials', icon: '▣', label: 'Materiales'},
    {id: 'expenses', icon: '◈', label: 'Gastos generales'}
  ];
  readonly unitChoices: Unit[] = ['g', 'kg', 'ml', 'l', 'unidad'];
  readonly count = computed(() => this.store.data().recipes.length);
  readonly avgCost = computed(() => {
    const recipes = this.store.data().recipes;
    return recipes.length ? recipes.reduce((sum, recipe) => sum + this.store.unitRecipeCost(recipe), 0) / recipes.length : 0;
  });
  stockDraft: CatalogItem = blankItem();
  expenseDraft: MonthlyExpense = blankExpense();
  recipeDraft: Recipe | null = null;
  newLine: NewLine = {catalogType: 'ingredient', catalogId: '', quantity: 1, unit: 'g'};
  productionDraft = this.store.data().monthlyProduction;

  constructor() {
    this.loadRecipe();
    this.resetLine();
  }

  money(value: number): string { return formatCurrency.format(Number.isFinite(value) ? value : 0); }
  decimal(value: number): string { return new Intl.NumberFormat('es-CL', {maximumFractionDigits: 3}).format(value); }
  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.stockDraft = blankItem();
    this.expenseDraft = blankExpense();
    this.notice.set('');
  }
  typeOfTab(): CatalogType { return this.tab() === 'materials' ? 'material' : 'ingredient'; }
  catalogTitle(): string { return this.tab() === 'materials' ? 'Materiales y empaques' : 'Ingredientes'; }
  catalogSubtitle(): string { return this.tab() === 'materials'
    ? 'Registra cajas, stickers y materiales de trabajo según su presentación de compra.'
    : 'Registra cada ingrediente tal como lo compras. Calcularemos el valor de la cantidad utilizada.';
  }
  catalogRows(): CatalogItem[] { return this.store.catalog(this.typeOfTab()); }
  perBaseUnit(item: CatalogItem): string {
    const base = item.unit === 'g' || item.unit === 'kg' ? 'g' : (item.unit === 'ml' || item.unit === 'l' ? 'ml' : 'unid.');
    return `${this.money(this.store.unitCost(item))} / ${base}`;
  }
  editStock(item: CatalogItem): void { this.stockDraft = structuredClone(item); }
  resetStock(): void { this.stockDraft = blankItem(); }
  saveStock(): void {
    const item = {...this.stockDraft, name: this.stockDraft.name.trim()};
    if (!item.name || !Number.isFinite(item.quantity) || item.quantity <= 0 || !validNonnegative(item.price)) {
      this.notice.set('Completa un nombre, una cantidad mayor a cero y un precio válido.'); return;
    }
    this.store.upsertCatalog(this.typeOfTab(), {...item, id: item.id || newId()});
    this.resetStock(); this.notice.set('Producto guardado correctamente.');
  }
  deleteStock(item: CatalogItem): void {
    if (!this.store.removeCatalog(this.typeOfTab(), item.id)) {
      this.notice.set('No puedes borrar un producto usado en una receta. Quítalo primero de la receta.'); return;
    }
    if (this.stockDraft.id === item.id) this.resetStock();
    this.notice.set('Producto eliminado.');
  }
  saveExpense(): void {
    const expense = {...this.expenseDraft, name: this.expenseDraft.name.trim()};
    if (!expense.name || !validNonnegative(expense.amount)) {
      this.notice.set('Ingresa un nombre y un gasto mensual válido.'); return;
    }
    this.store.upsertExpense({...expense, id: expense.id || newId()});
    this.expenseDraft = blankExpense(); this.notice.set('Gasto guardado.');
  }
  deleteExpense(id: string): void {
    this.store.removeExpense(id);
    if (this.expenseDraft.id === id) this.expenseDraft = blankExpense();
    this.notice.set('Gasto eliminado.');
  }
  saveProduction(): void {
    if (!Number.isFinite(this.productionDraft) || this.productionDraft <= 0) {
      this.notice.set('La producción mensual debe ser mayor que cero.'); return;
    }
    this.store.setMonthlyProduction(this.productionDraft);
    this.notice.set('Producción mensual actualizada.');
  }
  createRecipe(): void {
    const recipe: Recipe = {id: newId(), name: 'Nueva receta', yield: 1, lines: [], labor: 0, delivery: 0, other: 0, margin: 35};
    this.store.upsertRecipe(recipe);
    this.selectedRecipeId.set(recipe.id);
    this.setTab('recipes'); this.loadRecipe();
  }
  openRecipe(id: string): void {
    this.selectedRecipeId.set(id);
    this.loadRecipe();
    this.resetLine();
    this.notice.set('');
  }
  loadRecipe(): void {
    const recipe = this.selectedRecipe();
    this.recipeDraft = recipe ? structuredClone(recipe) : null;
  }
  saveRecipe(silent = false): boolean {
    const recipe = this.recipeDraft;
    if (!recipe) return false;
    recipe.name = recipe.name.trim();
    if (!recipe.name || !Number.isInteger(recipe.yield) || recipe.yield <= 0 ||
        !validNonnegative(recipe.labor) || !validNonnegative(recipe.delivery) ||
        !validNonnegative(recipe.other) || !validNonnegative(recipe.margin) || recipe.margin >= 100) {
      this.notice.set('Revisa el nombre, las unidades obtenidas, los gastos y el margen (entre 0 y 99,99%).');
      return false;
    }
    this.store.upsertRecipe(recipe);
    if (!silent) this.notice.set('Receta guardada.');
    return true;
  }
  deleteRecipe(recipe: Recipe): void {
    if (!confirm(`¿Eliminar la receta «${recipe.name}»?`)) return;
    this.store.removeRecipe(recipe.id);
    this.selectedRecipeId.set(this.store.data().recipes[0]?.id ?? null);
    this.loadRecipe();
    this.notice.set('Receta eliminada.');
  }
  linesOf(recipe: Recipe, type: CatalogType): RecipeLine[] {
    return recipe.lines.filter(line => line.catalogType === type);
  }
  lineLabel(line: RecipeLine): string {
    return this.store.findItem(line.catalogType, line.catalogId)?.name ?? 'Producto no encontrado';
  }
  itemOptions(): CatalogItem[] { return this.store.catalog(this.newLine.catalogType); }
  unitOptions(): Unit[] {
    const item = this.store.findItem(this.newLine.catalogType, this.newLine.catalogId);
    return item ? unitsFor(item.unit) : ['unidad'];
  }
  resetLine(): void {
    const first = this.itemOptions()[0];
    this.newLine = {
      catalogType: this.newLine.catalogType,
      catalogId: first?.id ?? '',
      quantity: 1,
      unit: first ? unitsFor(first.unit)[0] : 'unidad'
    };
  }
  changeLineType(): void { this.resetLine(); }
  changeLineItem(): void {
    const item = this.store.findItem(this.newLine.catalogType, this.newLine.catalogId);
    if (item) this.newLine.unit = unitsFor(item.unit)[0];
  }
  addLine(): void {
    if (!this.recipeDraft || !this.saveRecipe(true)) return;
    const item = this.store.findItem(this.newLine.catalogType, this.newLine.catalogId);
    if (!item || !Number.isFinite(this.newLine.quantity) || this.newLine.quantity <= 0 ||
        unitFamily(item.unit) !== unitFamily(this.newLine.unit)) {
      this.notice.set('Selecciona un producto y una cantidad válida.'); return;
    }
    const line: RecipeLine = {id: newId(), catalogType: this.newLine.catalogType,
      catalogId: this.newLine.catalogId, quantity: this.newLine.quantity, unit: this.newLine.unit};
    this.store.updateRecipe(this.recipeDraft.id, recipe => recipe.lines.push(line));
    this.loadRecipe();
    this.notice.set('Producto agregado a la receta.');
  }
  deleteLine(lineId: string): void {
    if (!this.recipeDraft || !this.saveRecipe(true)) return;
    this.store.updateRecipe(this.recipeDraft.id, recipe => { recipe.lines = recipe.lines.filter(line => line.id !== lineId); });
    this.loadRecipe();
  }
  suggested(recipe: Recipe): number {
    return Math.ceil(this.store.suggestedUnitPrice(recipe) / 100) * 100;
  }
  profit(recipe: Recipe): number { return this.suggested(recipe) - this.store.unitRecipeCost(recipe); }
  exportBackup(): void {
    const blob = new Blob([JSON.stringify(this.store.data(), null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'sweet-lizzi-respaldo.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.store.restore(parsed)) throw new Error('Datos incompatibles');
      this.selectedRecipeId.set(this.store.data().recipes[0]?.id ?? null);
      this.loadRecipe(); this.productionDraft = this.store.data().monthlyProduction;
      this.resetLine(); this.notice.set('Respaldo restaurado con éxito.');
    } catch { this.notice.set('No fue posible importar el archivo. Verifica que sea un respaldo válido.'); }
    input.value = '';
  }
}
