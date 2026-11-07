// Loaded on demand so the chart engine doesn't weigh down the first paint of the queue.
import { IntegratedChartsModule } from "ag-grid-enterprise";
import { AgChartsCommunityModule } from "ag-charts-community";

export const ChartsModule = IntegratedChartsModule.with(AgChartsCommunityModule);
