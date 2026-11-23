# Sweet Lizzi Costos — Angular 21

MVP de calculadora de costos para repostería (en español, pesos chilenos).

## Funcionalidades

- Catálogo de ingredientes: nombre, presentación de compra (cantidad + unidad) y precio.
- Catálogo de materiales: cajas, stickers, mangas y otros insumos.
- Conversión automática g/kg, mL/L y cm/m, y soporte de unidades.
- Recetas con cantidades utilizadas y desglose de costo por línea.
- Gastos generales mensuales, repartidos entre las unidades vendibles estimadas del mes.
- Tarifa por hora y costo de delivery configurables en Costos directos; cada receta registra minutos trabajados y si requiere delivery.
- Rendimiento por receta (porciones/cajas/unidades vendibles).
- Precio sugerido por unidad en CLP, en función del margen **sobre venta**; redondeado hacia arriba a $10.
- Edición de catálogos, gastos y recetas; prevención de eliminación de productos referenciados.
- Persistencia automática en `localStorage` y respaldo importable/exportable en JSON.
- Datos de ejemplo editables para explorar la calculadora.

## Instalación

Se requiere una versión de Node compatible con Angular 21 (Node ^20.19, ^22.12 o ^24).

```bash
npm install
npm start
```

Abrir http://localhost:4200

Para producción:

```bash
npm run build
```

La compilación quedará bajo `dist/sweet-lizzi-costos/browser` y puede alojarse en hosting estático. El proyecto usa base href `/`, por lo que si lo publicas en GitHub Pages bajo `/nombre-repo/`, ajusta la base href (por ejemplo, `ng build --base-href /nombre-repo/`).

## Publicar en GitHub Pages

El flujo de [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml) compila la aplicación con la ruta base `/sweet-lizzi/` y publica el resultado cuando hay cambios en `main` (o al ejecutarlo manualmente).

1. Asegúrate de que el repositorio `FelOrtiz/sweet-lizzi` exista en GitHub y de tener acceso para subir cambios. Si usas GitHub Free, debe ser público para habilitar Pages.
2. Sube los cambios de este proyecto a `main`.
3. En GitHub, abre **Settings → Pages** y elige **GitHub Actions** como fuente de publicación.
4. Espera a que termine **Deploy to GitHub Pages** en la pestaña **Actions**. El sitio quedará en `https://felortiz.github.io/sweet-lizzi/`.

El archivo de respaldo **no se publica**: las recetas y precios se guardan en el navegador, no en GitHub Pages. Para usar datos de otro dispositivo, abre la web publicada e impórtalos con **Importar respaldo**. No subas respaldos con datos privados al repositorio.

## Cómo se calculan los precios

1. Costo por unidad base = precio de compra / (cantidad comprada expresada en gramos, mililitros, centímetros o unidades).
2. Costo de línea = cantidad utilizada en unidad base × costo por unidad base.
3. Gasto general por unidad vendible = total de gastos mensuales / producción mensual vendible estimada.
4. Mano de obra = minutos trabajados / 60 × tarifa por hora. El delivery se suma solo si está marcado en la receta.
5. Costo receta = ingredientes + materiales + mano de obra + delivery + otros directos + (gasto general unitario × rendimiento).
6. Costo por unidad vendible = costo receta / rendimiento.
7. Precio teórico = costo unitario / (1 − margen deseado/100). Precio sugerido = precio teórico redondeado hacia arriba al siguiente $10.

Ejemplo: comprar 1 kg de harina por $1.500 y usar 250 g cuesta $375.

**Importante:** Usa la misma unidad vendible al estimar producción mensual y rendimientos (por ejemplo, una caja de 12 brownies es una unidad vendible si se vende solo en cajas). Así se reparte el gasto fijo consistentemente.

## Limitaciones de esta versión

- Los datos quedan **en este navegador y dispositivo**. No tiene usuarios, sincronización ni base de datos remota. Es indispensable exportar respaldos para conservar o trasladar la información.
- Los cambios de precios del catálogo actualizan el costo de todas las recetas que lo referencian; no existe historial de costos por fecha.
- Los gastos fijos se distribuyen por unidad vendible; empresas con líneas muy distintas pueden necesitar reparto por horas, energía, o margen de contribución.
- La utilidad calculada es estimada **antes de impuestos**; no modela IVA, comisiones de pago, descuentos, mermas ni pérdidas.
- Para un negocio productivo, incorporar autenticación, almacenamiento en la nube, backups automáticos, auditoría y pruebas automatizadas.

## Estructura

- `src/app/models.ts`: modelos y conversiones.
- `src/app/cost.store.ts`: persistencia y lógica de cálculos.
- `src/app/app.component.ts`: navegación, formularios y acciones.
- `src/app/app.component.html`: interfaz.
- `src/app/app.component.css`: estilo de marca.

## Nota de entorno

Este repositorio se preparó como código fuente, sin dependencias preinstaladas. No se pudo ejecutar `npm install` en el entorno en el que se generó, porque el registro de npm no estaba disponible. Tras instalar dependencias en tu computador, corre `npm run build` para validar la compilación.
