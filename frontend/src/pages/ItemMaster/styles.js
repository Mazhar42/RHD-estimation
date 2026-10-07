export const btnPrimary =
  "inline-flex items-center gap-1 rounded bg-teal-700 px-3 py-1 text-xs font-medium text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-gray-300";
export const btnSecondary =
  "rounded border border-teal-600 bg-white px-3 py-1 text-xs font-semibold text-teal-700 shadow-sm hover:bg-teal-50 disabled:opacity-60";
export const btnDanger =
  "rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60";
export const textInput =
  "w-full rounded border border-gray-300 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500";
export const errorInput =
  "w-full rounded border border-red-500 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-500";

export const errorDetail = (e, fallback) => e?.response?.data?.detail || fallback;
