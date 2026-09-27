// Attendance states shared between DailyAttendance, MonthlyHours, PDF and Excel export

export const ATTENDANCE_STATES = {
  presente: {
    label: "Presente",
    short: "P",
    color: "#16a34a",
    bgClass: "bg-green-100 border-green-300 text-green-700",
    badgeClass: "bg-green-100 text-green-700",
    dotClass: "bg-green-500",
    countsAsHours: true,
    excelBg: "#dcfce7",
    excelText: "#15803d",
  },
  permesso: {
    label: "Permesso retribuito",
    short: "PR",
    color: "#2563eb",
    bgClass: "bg-blue-100 border-blue-300 text-blue-700",
    badgeClass: "bg-blue-100 text-blue-700",
    dotClass: "bg-blue-500",
    countsAsHours: false,
    excelBg: "#dbeafe",
    excelText: "#1d4ed8",
  },
  assente: {
    label: "Assente",
    short: "A",
    color: "#dc2626",
    bgClass: "bg-red-100 border-red-300 text-red-700",
    badgeClass: "bg-red-100 text-red-700",
    dotClass: "bg-red-500",
    countsAsHours: false,
    excelBg: "#fee2e2",
    excelText: "#b91c1c",
  },
  malattia: {
    label: "Malattia",
    short: "M",
    color: "#d97706",
    bgClass: "bg-amber-100 border-amber-300 text-amber-700",
    badgeClass: "bg-amber-100 text-amber-700",
    dotClass: "bg-amber-500",
    countsAsHours: false,
    excelBg: "#fef3c7",
    excelText: "#b45309",
  },
  ferie: {
    label: "Ferie",
    short: "F",
    color: "#9333ea",
    bgClass: "bg-purple-100 border-purple-300 text-purple-700",
    badgeClass: "bg-purple-100 text-purple-700",
    dotClass: "bg-purple-500",
    countsAsHours: false,
    excelBg: "#f3e8ff",
    excelText: "#7e22ce",
  },
};

export const STATE_ORDER = ["presente", "permesso", "assente", "malattia", "ferie"];

export function getStatoInfo(stato) {
  return ATTENDANCE_STATES[stato] || ATTENDANCE_STATES.presente;
}