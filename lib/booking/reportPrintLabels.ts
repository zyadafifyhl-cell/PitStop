import type { Locale } from '@/lib/i18n/strings';
import { tp, translate } from '@/lib/i18n/strings';

export type ReportPrintLabels = {
  executiveTitle: string;
  shop: string;
  dateRange: string;
  generatedAt: string;
  grossRevenue: string;
  platformFee: string;
  netEarnings: string;
  operationalInsights: string;
  aov: string;
  channelSplit: string;
  vehiclesServiced: string;
  appRevenue: string;
  walkInRevenue: string;
  cancelledNoShows: string;
  bookingsUnit: string;
  tableBookingId: string;
  tableDate: string;
  tableType: string;
  tableRevenue: string;
  emptyRows: string;
  badgeApp: string;
  badgeWalkIn: string;
  bookingsTitle: string;
  operationsSummary: string;
  financialSummary: string;
  bookingLedger: string;
  totalBookings: string;
  done: string;
  appBookings: string;
  walkInPos: string;
  confirmed: string;
  cancelled: string;
  maintenance: string;
  washPartsWinch: string;
  tableScheduled: string;
  tableSource: string;
  tableCustomerPhone: string;
  tableCarType: string;
  tableColor: string;
  tableStatus: string;
  tableServicePrice: string;
  tablePlatformFee: string;
  tableOwnerNet: string;
  noBookingsPeriod: string;
};

export function getReportPrintLabels(locale: Locale): ReportPrintLabels {
  return {
    executiveTitle: translate(locale, 'report_print_executive_title'),
    shop: translate(locale, 'report_print_shop'),
    dateRange: translate(locale, 'report_print_date_range'),
    generatedAt: translate(locale, 'report_print_generated_at'),
    grossRevenue: translate(locale, 'report_print_gross_revenue'),
    platformFee: translate(locale, 'report_print_platform_fee'),
    netEarnings: translate(locale, 'report_print_net_earnings'),
    operationalInsights: translate(locale, 'report_print_operational_insights'),
    aov: translate(locale, 'report_print_aov'),
    channelSplit: translate(locale, 'report_print_channel_split'),
    vehiclesServiced: translate(locale, 'report_print_vehicles_serviced'),
    appRevenue: translate(locale, 'report_print_app_revenue'),
    walkInRevenue: translate(locale, 'report_print_walk_in_revenue'),
    cancelledNoShows: translate(locale, 'report_print_cancelled_no_shows'),
    bookingsUnit: translate(locale, 'report_print_bookings_unit'),
    tableBookingId: translate(locale, 'report_print_table_booking_id'),
    tableDate: translate(locale, 'report_print_table_date'),
    tableType: translate(locale, 'report_print_table_type'),
    tableRevenue: translate(locale, 'report_print_table_revenue'),
    emptyRows: translate(locale, 'report_print_empty_rows'),
    badgeApp: translate(locale, 'report_print_badge_app'),
    badgeWalkIn: translate(locale, 'report_print_badge_walk_in'),
    bookingsTitle: translate(locale, 'report_print_bookings_title'),
    operationsSummary: translate(locale, 'report_print_operations_summary'),
    financialSummary: translate(locale, 'report_print_financial_summary'),
    bookingLedger: translate(locale, 'report_print_booking_ledger'),
    totalBookings: translate(locale, 'report_print_total_bookings'),
    done: translate(locale, 'report_print_done'),
    appBookings: translate(locale, 'report_print_app_bookings'),
    walkInPos: translate(locale, 'report_print_walk_in_pos'),
    confirmed: translate(locale, 'report_print_confirmed'),
    cancelled: translate(locale, 'report_print_cancelled'),
    maintenance: translate(locale, 'report_print_maintenance'),
    washPartsWinch: translate(locale, 'report_print_wash_parts_winch'),
    tableScheduled: translate(locale, 'report_print_table_scheduled'),
    tableSource: translate(locale, 'report_print_table_source'),
    tableCustomerPhone: translate(locale, 'report_print_table_customer_phone'),
    tableCarType: translate(locale, 'report_print_table_car_type'),
    tableColor: translate(locale, 'report_print_table_color'),
    tableStatus: translate(locale, 'report_print_table_status'),
    tableServicePrice: translate(locale, 'report_print_table_service_price'),
    tablePlatformFee: translate(locale, 'report_print_table_platform_fee'),
    tableOwnerNet: translate(locale, 'report_print_table_owner_net'),
    noBookingsPeriod: translate(locale, 'report_print_no_bookings_period'),
  };
}

export function formatReportChannelSplitValue(
  locale: Locale,
  appPct: string,
  walkPct: string,
): string {
  return tp(locale, 'report_print_channel_value', { appPct, walkPct });
}

export function formatReportCancelledValue(locale: Locale, count: number): string {
  const countText = count.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG');
  return tp(locale, 'report_print_cancelled_value', { count: countText });
}

export function reportBookingSourceLabel(locale: Locale, isWalkIn: boolean): string {
  return isWalkIn
    ? translate(locale, 'report_print_badge_walk_in')
    : translate(locale, 'report_print_badge_app');
}
