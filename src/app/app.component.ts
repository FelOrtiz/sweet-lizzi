import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CostStore, newId } from './cost.store';
import { CatalogItem, CatalogType, MonthlyExpense, Recipe, RecipeLine, Unit, toBase, unitsFor, unitFamily, validNonnegative } from './models';

type Tab = 'dashboard' | 'ingredients' | 'materials' | 'expenses' | 'recipes' | 'directCosts';
interface NewLine { catalogType: CatalogType; catalogId: string; quantity: number; unit: Unit; }
interface PriceChange { recipe: string; oldPrice: number; newPrice: number; }
interface Confirmation {
  title: string;
  message: string;
  actionLabel: string;
  danger?: boolean;
  recipes?: string[];
  priceChanges?: PriceChange[];
  action: () => void;
}

const blankItem = (): CatalogItem => ({id: '', name: '', quantity: 1, unit: 'kg', price: 0});
const blankExpense = (): MonthlyExpense => ({id: '', name: '', amount: 0});
const formatCurrency = new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0});
const roundSuggestedPrice = (price: number): number => Math.ceil(price / 10) * 10;

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
  readonly confirmation = signal<Confirmation | null>(null);
  readonly deleteTooltip = signal<{left: number; top: number; above: boolean} | null>(null);
  readonly confirmDialogElement = viewChild<ElementRef<HTMLDialogElement>>('confirmDialog');
  private deleteTooltipTimer: ReturnType<typeof setTimeout> | null = null;
  readonly nav: {id: Tab; icon: string; label: string}[] = [
    {id: 'dashboard', icon: '◫', label: 'Resumen'},
    {id: 'recipes', icon: '▤', label: 'Mis recetas'},
    {id: 'ingredients', icon: '♧', label: 'Ingredientes'},
    {id: 'materials', icon: '▣', label: 'Materiales'},
    {id: 'directCosts', icon: '◷', label: 'Costos directos'},
    {id: 'expenses', icon: '◈', label: 'Gastos generales'}
  ];
  readonly unitChoices: Unit[] = ['g', 'kg', 'ml', 'l', 'cm', 'm', 'unidad'];
  readonly count = computed(() => this.store.data().recipes.length);
  readonly avgCost = computed(() => {
    const recipes = this.store.data().recipes;
    return recipes.length ? recipes.reduce((sum, recipe) => sum + this.store.unitRecipeCost(recipe), 0) / recipes.length : 0;
  });
  stockDraft: CatalogItem = blankItem();
  expenseDraft: MonthlyExpense = blankExpense();
  recipeDraft: Recipe | null = null;
  hourlyRateDraft = this.store.hourlyRate();
  deliveryFeeDraft = this.store.deliveryFee();
  newLine: NewLine = {catalogType: 'ingredient', catalogId: '', quantity: 1, unit: 'g'};
  productionDraft = this.store.data().monthlyProduction;

  constructor() {
    this.loadRecipe();
    this.resetLine();
  }

  money(value: number): string { return formatCurrency.format(Number.isFinite(value) ? value : 0); }
  decimal(value: number): string { return new Intl.NumberFormat('es-CL', {maximumFractionDigits: 3}).format(value); }
  unitLabel(unit: Unit): string { return unit === 'ml' ? 'mL' : unit === 'l' ? 'L' : unit; }
  tabTitle(): string { return this.nav.find(item => item.id === this.tab())?.label.toUpperCase() ?? ''; }
  setTab(tab: Tab): void {
    this.hideDeleteTooltip();
    this.tab.set(tab);
    if (tab === 'directCosts') this.loadDirectCostDrafts();
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
    const base = item.unit === 'g' || item.unit === 'kg' ? 'g' :
      item.unit === 'ml' || item.unit === 'l' ? 'mL' :
      item.unit === 'cm' || item.unit === 'm' ? 'cm' : 'unid.';
    return `${this.money(this.store.unitCost(item))} / ${base}`;
  }
  scheduleDeleteTooltip(event: Event, itemId: string): void {
    if (!this.store.isUsed(this.typeOfTab(), itemId)) return;
    this.hideDeleteTooltip();
    const target = event.currentTarget as HTMLElement;
    this.deleteTooltipTimer = setTimeout(() => {
      this.deleteTooltipTimer = null;
      if (!target.isConnected) return;
      const bounds = target.getBoundingClientRect();
      const halfWidth = Math.min(150, (window.innerWidth - 24) / 2);
      const above = bounds.bottom + 72 > window.innerHeight;
      this.deleteTooltip.set({
        left: Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, bounds.left + bounds.width / 2)),
        top: above ? bounds.top - 8 : bounds.bottom + 8,
        above
      });
    }, 500);
  }
  hideDeleteTooltip(): void {
    if (this.deleteTooltipTimer !== null) clearTimeout(this.deleteTooltipTimer);
    this.deleteTooltipTimer = null;
    this.deleteTooltip.set(null);
  }
  private openConfirmation(confirmation: Confirmation): void {
    this.confirmation.set(confirmation);
    setTimeout(() => {
      const dialog = this.confirmDialogElement()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }
  closeConfirmation(): void {
    this.confirmDialogElement()?.nativeElement.close();
    this.confirmation.set(null);
  }
  confirmAction(): void {
    const confirmation = this.confirmation();
    if (!confirmation) return;
    this.closeConfirmation();
    confirmation.action();
  }
  affectedRecipes(type: CatalogType, itemId: string): Recipe[] {
    return this.store.data().recipes.filter(recipe =>
      recipe.lines.some(line => line.catalogType === type && line.catalogId === itemId));
  }
  private priceChanges(type: CatalogType, item: CatalogItem): PriceChange[] {
    const unitCost = this.store.unitCost(item);
    return this.affectedRecipes(type, item.id).map(recipe => {
      const difference = recipe.lines
        .filter(line => line.catalogType === type && line.catalogId === item.id)
        .reduce((sum, line) => sum +
          (unitFamily(line.unit) === unitFamily(item.unit) ? toBase(line.quantity, line.unit) * unitCost : 0)
          - this.store.lineCost(line), 0);
      const newUnitCost = (this.store.totalCost(recipe) + difference) / recipe.yield;
      return {
        recipe: recipe.name,
        oldPrice: this.suggested(recipe),
        newPrice: roundSuggestedPrice(newUnitCost / (1 - recipe.margin / 100))
      };
    });
  }
  editStock(item: CatalogItem): void {
    const recipes = this.affectedRecipes(this.typeOfTab(), item.id);
    if (!recipes.length) { this.stockDraft = structuredClone(item); return; }
    this.openConfirmation({
      title: 'Editar producto en uso',
      message: `«${item.name}» se utiliza en estas recetas. Si cambias su cantidad, unidad o precio, sus costos pueden variar.`,
      actionLabel: 'Continuar con la edición',
      recipes: recipes.map(recipe => recipe.name),
      action: () => { this.stockDraft = structuredClone(item); }
    });
  }
  resetStock(): void { this.stockDraft = blankItem(); }
  private persistStock(type: CatalogType, item: CatalogItem): void {
    this.store.upsertCatalog(type, item);
    this.resetStock();
    this.notice.set('Producto guardado correctamente.');
  }
  saveStock(): void {
    const item = {...this.stockDraft, name: this.stockDraft.name.trim()};
    if (!item.name || !Number.isFinite(item.quantity) || item.quantity <= 0 || !validNonnegative(item.price)) {
      this.notice.set('Completa un nombre, una cantidad mayor a cero y un precio válido.'); return;
    }
    const type = this.typeOfTab();
    if (!item.id) { this.persistStock(type, {...item, id: newId()}); return; }
    const original = this.store.findItem(type, item.id);
    if (!original) { this.notice.set('El producto ya no está disponible.'); return; }
    const recipes = this.affectedRecipes(type, item.id);
    if (recipes.length && unitFamily(original.unit) !== unitFamily(item.unit)) {
      this.notice.set('No puedes cambiar el tipo de unidad de un producto usado en una receta.'); return;
    }
    this.openConfirmation({
      title: 'Confirmar cambios del producto',
      message: recipes.length
        ? `Revisa los precios de venta sugeridos antes de actualizar «${original.name}».`
        : `¿Guardar los cambios de «${original.name}»? Ninguna receta utiliza este producto.`,
      actionLabel: 'Guardar cambios',
      priceChanges: this.priceChanges(type, item),
      action: () => this.persistStock(type, item)
    });
  }
  deleteStock(item: CatalogItem): void {
    const type = this.typeOfTab();
    if (this.store.isUsed(type, item.id)) {
      this.notice.set('No puedes borrar un producto usado en una receta. Quítalo primero de la receta.'); return;
    }
    this.openConfirmation({
      title: 'Eliminar producto',
      message: `¿Eliminar «${item.name}»? Esta acción no se puede deshacer.`,
      actionLabel: 'Eliminar producto', danger: true,
      action: () => {
        if (!this.store.removeCatalog(type, item.id)) {
          this.notice.set('No puedes borrar un producto usado en una receta.'); return;
        }
        if (this.stockDraft.id === item.id) this.resetStock();
        this.notice.set('Producto eliminado.');
      }
    });
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
    const expense = this.store.data().expenses.find(item => item.id === id);
    if (!expense) return;
    this.openConfirmation({
      title: 'Eliminar gasto general',
      message: `¿Eliminar «${expense.name}»? Esta acción no se puede deshacer.`,
      actionLabel: 'Eliminar gasto', danger: true,
      action: () => {
        this.store.removeExpense(id);
        if (this.expenseDraft.id === id) this.expenseDraft = blankExpense();
        this.notice.set('Gasto eliminado.');
      }
    });
  }
  saveProduction(): void {
    if (!Number.isFinite(this.productionDraft) || this.productionDraft <= 0) {
      this.notice.set('La producción mensual debe ser mayor que cero.'); return;
    }
    this.store.setMonthlyProduction(this.productionDraft);
    this.notice.set('Producción mensual actualizada.');
  }
  createRecipe(): void {
    if (this.hasUnsavedRecipeChanges()) {
      this.confirmDiscardRecipe(() => this.createRecipeDraft());
      return;
    }
    this.createRecipeDraft();
  }
  private createRecipeDraft(): void {
    const recipe: Recipe = {id: newId(), name: 'Nueva receta', yield: 1, lines: [], labor: 0,
      laborMinutes: 0, delivery: 0, hasDelivery: false, other: 0, margin: 35};
    this.selectedRecipeId.set(null);
    this.setTab('recipes');
    this.recipeDraft = recipe;
    this.resetLine();
  }
  copyRecipe(recipe: Recipe): void {
    const source = this.store.data().recipes.find(saved => saved.id === recipe.id);
    if (!source) {
      this.notice.set('La receta original ya no está disponible.');
      return;
    }
    const copy = () => {
      this.recipeDraft = {
        ...structuredClone(source),
        id: newId(),
        name: `Copia de ${source.name}`.slice(0, 120),
        lines: source.lines.map(line => ({...structuredClone(line), id: newId()}))
      };
      this.selectedRecipeId.set(null);
      this.resetLine();
      this.notice.set('Copia preparada. Edita la receta y pulsa «Guardar receta» para agregarla.');
    };
    if (this.hasUnsavedRecipeChanges()) {
      this.confirmDiscardRecipe(copy);
      return;
    }
    copy();
  }
  openRecipe(id: string): void {
    if (this.recipeDraft?.id === id) return;
    if (this.hasUnsavedRecipeChanges()) {
      this.confirmDiscardRecipe(() => this.selectRecipe(id));
      return;
    }
    this.selectRecipe(id);
  }
  private selectRecipe(id: string): void {
    this.selectedRecipeId.set(id);
    this.loadRecipe();
    this.resetLine();
    this.notice.set('');
  }
  private hasUnsavedRecipeChanges(): boolean {
    if (!this.recipeDraft) return false;
    const saved = this.store.data().recipes.find(recipe => recipe.id === this.recipeDraft?.id);
    return !saved || JSON.stringify(saved) !== JSON.stringify(this.recipeDraft);
  }
  private confirmDiscardRecipe(action: () => void): void {
    this.openConfirmation({
      title: 'Cambios sin guardar',
      message: 'Esta receta tiene cambios sin guardar. Si continúas, se perderán.',
      actionLabel: 'Descartar cambios',
      action
    });
  }
  loadRecipe(): void {
    const recipe = this.selectedRecipe();
    this.recipeDraft = recipe ? structuredClone(recipe) : null;
  }
  loadDirectCostDrafts(): void {
    this.hourlyRateDraft = this.store.hourlyRate();
    this.deliveryFeeDraft = this.store.deliveryFee();
  }
  saveHourlyRate(): void {
    if (!validNonnegative(this.hourlyRateDraft)) {
      this.notice.set('Ingresa una tarifa por hora válida.'); return;
    }
    this.store.setHourlyRate(this.hourlyRateDraft);
    this.notice.set('Tarifa por hora actualizada.');
  }
  saveDeliveryFee(): void {
    if (!validNonnegative(this.deliveryFeeDraft)) {
      this.notice.set('Ingresa un costo de delivery válido.'); return;
    }
    this.store.setDeliveryFee(this.deliveryFeeDraft);
    this.notice.set('Costo de delivery actualizado.');
  }
  saveRecipe(): void {
    const recipe = this.recipeDraft;
    if (!recipe) return;
    recipe.name = recipe.name.trim();
    if (!recipe.name || !Number.isInteger(recipe.yield) || recipe.yield <= 0 ||
        !validNonnegative(recipe.labor) || !validNonnegative(recipe.delivery) ||
        (recipe.laborMinutes !== undefined && !validNonnegative(recipe.laborMinutes)) ||
        (recipe.hasDelivery !== undefined && typeof recipe.hasDelivery !== 'boolean') ||
        !validNonnegative(recipe.other) || !validNonnegative(recipe.margin) || recipe.margin >= 100) {
      this.notice.set('Revisa el nombre, las unidades obtenidas, los minutos, los gastos y el margen (entre 0 y 99,99%).');
      return;
    }
    if (recipe.lines.some(line => {
      const item = this.store.findItem(line.catalogType, line.catalogId);
      return !item || unitFamily(item.unit) !== unitFamily(line.unit);
    })) {
      this.notice.set('Hay un ingrediente o material que ya no está disponible. Revisa los productos de la receta.');
      return;
    }
    const isNew = !this.store.data().recipes.some(saved => saved.id === recipe.id);
    this.store.upsertRecipe(recipe);
    this.selectedRecipeId.set(recipe.id);
    this.notice.set(isNew ? 'Receta creada y guardada.' : 'Cambios de la receta guardados.');
  }
  deleteRecipe(recipe: Recipe): void {
    const isNew = !this.store.data().recipes.some(saved => saved.id === recipe.id);
    this.openConfirmation({
      title: isNew ? 'Descartar receta' : 'Eliminar receta',
      message: isNew
        ? '¿Descartar esta receta sin guardar?'
        : `¿Eliminar «${recipe.name}» y sus líneas de ingredientes y materiales? Esta acción no se puede deshacer.`,
      actionLabel: isNew ? 'Descartar receta' : 'Eliminar receta', danger: true,
      action: () => {
        if (!isNew) this.store.removeRecipe(recipe.id);
        this.selectedRecipeId.set(this.store.data().recipes[0]?.id ?? null);
        this.loadRecipe();
        this.notice.set(isNew ? 'Receta descartada.' : 'Receta eliminada.');
      }
    });
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
    if (!this.recipeDraft) return;
    const item = this.store.findItem(this.newLine.catalogType, this.newLine.catalogId);
    if (!item || !Number.isFinite(this.newLine.quantity) || this.newLine.quantity <= 0 ||
        unitFamily(item.unit) !== unitFamily(this.newLine.unit)) {
      this.notice.set('Selecciona un producto y una cantidad válida.'); return;
    }
    const line: RecipeLine = {id: newId(), catalogType: this.newLine.catalogType,
      catalogId: this.newLine.catalogId, quantity: this.newLine.quantity, unit: this.newLine.unit};
    this.recipeDraft.lines.push(line);
    this.notice.set('Producto agregado al formulario. Guarda la receta para confirmar los cambios.');
  }
  deleteLine(lineId: string): void {
    const recipe = this.recipeDraft;
    const line = recipe?.lines.find(item => item.id === lineId);
    if (!recipe || !line) return;
    this.openConfirmation({
      title: 'Quitar producto de la receta',
      message: `¿Quitar «${this.lineLabel(line)}» de «${recipe.name}»?`,
      actionLabel: 'Quitar producto', danger: true,
      action: () => {
        if (!this.recipeDraft || this.recipeDraft.id !== recipe.id) return;
        this.recipeDraft.lines = this.recipeDraft.lines.filter(item => item.id !== lineId);
        this.notice.set('Producto quitado del formulario. Guarda la receta para confirmar los cambios.');
      }
    });
  }
  suggested(recipe: Recipe): number {
    return roundSuggestedPrice(this.store.suggestedUnitPrice(recipe));
  }
  profit(recipe: Recipe): number { return this.suggested(recipe) - this.store.unitRecipeCost(recipe); }
  exportBackup(): void {
    const blob = new Blob([JSON.stringify(this.store.data(), null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'sweet-lizzi-respaldo.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async importBackup(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.store.restore(parsed)) throw new Error('Datos incompatibles');
      this.selectedRecipeId.set(this.store.data().recipes[0]?.id ?? null);
      this.loadRecipe(); this.loadDirectCostDrafts(); this.productionDraft = this.store.data().monthlyProduction;
      this.resetLine(); this.notice.set('Respaldo restaurado con éxito.');
    } catch { this.notice.set('No fue posible importar el archivo. Verifica que sea un respaldo válido.'); }
    input.value = '';
  }
}
