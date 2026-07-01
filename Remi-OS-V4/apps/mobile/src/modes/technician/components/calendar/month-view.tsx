import { useMemo } from "react";
import { StyleSheet, View, Text, Pressable } from "react-native";
import dayjs from "dayjs";
import { useFranchiseMonthView } from "@technician/hooks/schedule/use-calendar";
import { useCalendarStore } from "@technician/stores/calendar";
import { haptic } from "@technician/hooks/utility/use-haptics";

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CAPACITY_COLORS: Record<string, string> = {
  light: "#22C55E",
  moderate: "#F59E0B",
  full: "#EF4444",
};

export function MonthView() {
  const { selectedDate, setSelectedDate, setViewMode } = useCalendarStore();
  const current = dayjs(selectedDate);
  const year = current.year();
  const month = current.month() + 1;
  const today = dayjs().format("YYYY-MM-DD");

  const { data } = useFranchiseMonthView(year, month);
  const dayMap = useMemo(() => {
    const map: Record<string, { date: string; appointment_count: number; capacity: string }> = {};
    if (data?.days) {
      data.days.forEach((d) => {
        map[d.date] = d;
      });
    }
    return map;
  }, [data]);

  const calendarDays = useMemo(() => {
    const firstDay = current.startOf("month");
    const startOffset = firstDay.day();
    const daysInMonth = current.daysInMonth();
    const cells: (string | null)[] = [];

    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(current.date(d).format("YYYY-MM-DD"));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [current]);

  const handleDayPress = (date: string) => {
    haptic.light();
    setSelectedDate(date);
    setViewMode("day");
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((d) => (
          <View key={d} style={styles.headerCell}>
            <Text style={styles.headerText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {calendarDays.map((date, idx) => {
          if (!date) {
            return <View key={`empty-${idx}`} style={styles.cell} />;
          }
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dayData = dayMap[date];
          const dayNum = dayjs(date).date();

          return (
            <Pressable
              key={date}
              style={[styles.cell, isSelected && styles.cellSelected]}
              onPress={() => handleDayPress(date)}
            >
              <Text
                style={[
                  styles.dayNum,
                  isToday && styles.dayNumToday,
                  isSelected && styles.dayNumSelected,
                ]}
              >
                {dayNum}
              </Text>
              {dayData && (
                <>
                  <Text style={styles.count}>{dayData.appointment_count}</Text>
                  <View
                    style={[
                      styles.capacityDot,
                      {
                        backgroundColor:
                          CAPACITY_COLORS[dayData.capacity] ?? "#D1D5DB",
                      },
                    ]}
                  />
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingTop: 8 },
  headerRow: { flexDirection: "row" },
  headerCell: { flex: 1, alignItems: "center", paddingVertical: 6 },
  headerText: { fontSize: 12, fontWeight: "600", color: "#9CA3AF" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderRadius: 8,
  },
  cellSelected: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#3B82F6" },
  dayNum: { fontSize: 15, fontWeight: "600", color: "#374151" },
  dayNumToday: { color: "#3B82F6" },
  dayNumSelected: { color: "#1D4ED8", fontWeight: "800" },
  count: { fontSize: 10, color: "#6B7280", marginTop: 1 },
  capacityDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
});
