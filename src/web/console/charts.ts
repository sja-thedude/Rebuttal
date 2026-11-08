// Only the chart pieces the insights panel draws, so the lazy chunk stays small.
import { AgCharts, BarSeriesModule, CategoryAxisModule, DonutSeriesModule, LegendModule, ModuleRegistry, NumberAxisModule } from "ag-charts-community";

ModuleRegistry.registerModules([BarSeriesModule, DonutSeriesModule, CategoryAxisModule, NumberAxisModule, LegendModule]);

export { AgCharts };
