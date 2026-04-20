// Türkçe: Recharts type declarations
import { ComponentType, ReactElement, ReactNode } from 'react';

declare module 'recharts' {
  export interface ResponsiveContainerProps {
    width?: string | number;
    height?: string | number;
    aspect?: number;
    minWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    children?: ReactNode;
  }

  export interface TooltipProps {
    content?: ReactElement | ContentRenderer<any>;
    contentStyle?: React.CSSProperties;
    wrapperStyle?: React.CSSProperties;
    cursor?: boolean | ReactElement | ContentRenderer<any>;
    coordinate?: { x: number; y: number };
    position?: { x: number; y: number };
    viewBox?: { x: number; y: number; width: number; height: number };
    active?: boolean;
    payload?: Array<any>;
    label?: any;
    labelFormatter?: LabelFormatter;
    formatter?: Formatter;
    itemSorter?: ItemSorter;
    itemStyle?: React.CSSProperties;
    separator?: string;
    hide?: boolean;
    animationId?: number;
  }

  export const ResponsiveContainer: ComponentType<ResponsiveContainerProps>;
  export const Tooltip: ComponentType<TooltipProps>;
  export const XAxis: ComponentType<any>;
  export const YAxis: ComponentType<any>;
  export const CartesianGrid: ComponentType<any>;
  export const Bar: ComponentType<any>;
  export const BarChart: ComponentType<any>;
  export const Line: ComponentType<any>;
  export const LineChart: ComponentType<any>;
  export const Pie: ComponentType<any>;
  export const PieChart: ComponentType<any>;
  export const Cell: ComponentType<any>;
  export const Legend: ComponentType<any>;
  export const Radar: ComponentType<any>;
  export const RadarChart: ComponentType<any>;
  export const PolarGrid: ComponentType<any>;
  export const PolarAngleAxis: ComponentType<any>;
  export const PolarRadiusAxis: ComponentType<any>;
}
