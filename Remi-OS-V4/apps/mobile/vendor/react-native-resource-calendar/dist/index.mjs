import * as React19 from 'react';
import React19__default, { createContext, useState, useEffect, useRef, useMemo, useContext, useCallback } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated2, { useAnimatedRef, useSharedValue, withSpring, useFrameCallback, scrollTo, useAnimatedScrollHandler, useAnimatedStyle, useAnimatedProps } from 'react-native-reanimated';
import { InteractionManager, View, Text, StyleSheet, TouchableOpacity, TextInput, useWindowDimensions, Platform, Dimensions, Image } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { toZonedTime } from 'date-fns-tz';
import { isSameDay, format, getHours, getMinutes, set, addDays, setSeconds, setMinutes, setHours } from 'date-fns';
import { isUndefined } from 'lodash';
import { createStore } from 'zustand';
import { shallow } from 'zustand/shallow';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { Canvas, Rect as Rect$1, Line as Line$1 } from '@shopify/react-native-skia';
import Svg, { Defs, Pattern, Line } from 'react-native-svg';
import { Rect } from 'react-content-loader/native';
import { MaterialIcons } from '@expo/vector-icons';

// src/components/Calendar.tsx
var TIME_LABEL_WIDTH = 50;
var groupEventsByOverlap = (events) => {
  return events.reduce((clusters, appointment) => {
    const cluster = clusters.find((c) => c.some((e) => isOverlapping(e, appointment)));
    if (cluster) {
      cluster.push(appointment);
    } else {
      clusters.push([appointment]);
    }
    return clusters;
  }, []);
};
function computeDisabledBlockColumns(disabledBlocks) {
  const groups = groupDisabledBlocksByOverlap(disabledBlocks);
  const res = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort((a, b) => a.from - b.from);
    const columns = [];
    for (const evt of byStart) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (!isOverlappingDisabledBlock(last, evt)) {
          col.push(evt);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([evt]);
    }
    const colIndexByEvent = /* @__PURE__ */ new Map();
    columns.forEach((col, idx) => col.forEach((e) => colIndexByEvent.set(e, idx)));
    const groupCols = columns.length;
    for (const evt of group) {
      const myCol = colIndexByEvent.get(evt);
      let span = 1;
      for (let c = myCol + 1; c < groupCols; c++) {
        const blocked = columns[c].some(
          (e) => e !== evt && isOverlappingDisabledBlock(e, evt)
        );
        if (blocked) break;
        span++;
      }
      const key = evt.id;
      res.set(key, {
        leftIndex: myCol,
        renderColumnCount: groupCols,
        spanColumns: span
      });
    }
  }
  return res;
}
var groupDisabledBlocksByOverlap = (disabledBlocks) => {
  return disabledBlocks.reduce((clusters, disabledBlock) => {
    const cluster = clusters.find((c) => c.some((e) => isOverlappingDisabledBlock(e, disabledBlock)));
    if (cluster) {
      cluster.push(disabledBlock);
    } else {
      clusters.push([disabledBlock]);
    }
    return clusters;
  }, []);
};
var isOverlappingDisabledBlock = (disabledBlockA, disabledBlockB) => {
  return !(disabledBlockA.to <= disabledBlockB.from || disabledBlockA.from >= disabledBlockB.to);
};
function computeEventColumns(events) {
  const groups = groupEventsByOverlap(events);
  const out = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort(
      (a, b) => a.from - b.from
    );
    const columns = [];
    for (const evt of byStart) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (!isOverlapping(last, evt)) {
          col.push(evt);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([evt]);
    }
    const colIndex = /* @__PURE__ */ new Map();
    columns.forEach((col, i) => col.forEach((e) => colIndex.set(e, i)));
    const groupCols = columns.length;
    for (const evt of group) {
      const myCol = colIndex.get(evt);
      let span = 1;
      for (let c = myCol + 1; c < groupCols; c++) {
        const blocked = columns[c].some(
          (e) => (
            // exclude self; block if ANY event in col c overlaps me
            e !== evt && e.id !== evt.id && isOverlapping(e, evt)
          )
        );
        if (blocked) break;
        span++;
      }
      out.set(evt.id, {
        leftIndex: myCol,
        renderColumnCount: groupCols,
        spanColumns: span
      });
    }
  }
  return out;
}
var getTextSize = (size) => {
  switch (size) {
    case 60:
      return 10;
    case 80:
      return 12;
    case 100:
      return 12;
    default:
      return 12;
  }
};
var MINUTES_IN_DAY = 1440;
var normalizeOvernight = (startMin, endMin) => {
  if (endMin < startMin) endMin += MINUTES_IN_DAY;
  return { startMin, endMin };
};
var intersects = (A, B) => Math.max(A.startMin, B.startMin) < Math.min(A.endMin, B.endMin);
var isOverlapping = (eventA, eventB) => {
  const aStart0 = eventA.from;
  const aEnd0 = eventA.to;
  const bStart0 = eventB.from;
  const bEnd0 = eventB.to;
  if (aStart0 === aEnd0 || bStart0 === bEnd0) return false;
  const A = normalizeOvernight(aStart0, aEnd0);
  const B = normalizeOvernight(bStart0, bEnd0);
  return intersects(A, B);
};
var getCurrentTimeInMinutes = (timezone) => {
  const now = toZonedTime(/* @__PURE__ */ new Date(), timezone);
  const hours = getHours(now);
  const minutes = getMinutes(now);
  return hours * 60 + minutes;
};
var timeToYPosition = (minutes, TIME_LABEL_HEIGHT) => minutes * (TIME_LABEL_HEIGHT / 60);
var scalePosition = (position, hourHeight) => {
  return position * (hourHeight / 60);
};
var positionToMinutes = (position, TIME_LABEL_HEIGHT) => {
  "worklet";
  return position / (TIME_LABEL_HEIGHT / 60);
};
var combineDateAndTime = (date, time) => {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  const combinedDate = setSeconds(setMinutes(setHours(date, hours), minutes), seconds);
  return format(combinedDate, "yyyy-MM-dd HH:mm:ss");
};
var indexToDate = (index) => {
  const dateWithHour = set(/* @__PURE__ */ new Date(), { hours: index, minutes: 0, seconds: 0, milliseconds: 0 });
  return format(dateWithHour, "h:mm a");
};
var minutesToTime = (totalMinutes) => {
  "worklet";
  const safeTotalMinutes = Math.max(0, Math.round(totalMinutes));
  const hours24 = Math.floor(safeTotalMinutes / 60);
  const minutes = safeTotalMinutes % 60;
  const paddedMins = minutes < 10 ? "0" + minutes : String(minutes);
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${paddedMins}`;
};
function computeStackedEventLayout(events, containerWidthPx, {
  indentPx = 6,
  // how much to nudge each overlap to the right
  rightPadPx = 0,
  // visual breathing room on the right
  minWidthPx = 25,
  // never let an event become thinner than this
  capIndentLevels = 4
  // after N levels, stop indenting (just stack via z-index)
} = {}) {
  const groups = groupEventsByOverlap(events);
  const out = /* @__PURE__ */ new Map();
  for (const group of groups) {
    const byStart = [...group].sort((a, b) => a.from - b.from);
    const active = [];
    const removeFinished = (currentFrom) => {
      for (let i = active.length - 1; i >= 0; i--) {
        if (!isOverlapping(active[i].e, { ...active[i].e, from: currentFrom, to: currentFrom })) {
          if (active[i].e.to <= currentFrom) active.splice(i, 1);
        }
      }
    };
    const findLowestFreeLevel = () => {
      const used = new Set(active.map((a) => a.level));
      let lvl = 0;
      while (used.has(lvl)) lvl++;
      return lvl;
    };
    for (const e of byStart) {
      removeFinished(e.from);
      let level = findLowestFreeLevel();
      const visualLevel = Math.min(level, capIndentLevels);
      active.push({ e, level });
      const leftPx = visualLevel * indentPx;
      const available = containerWidthPx - leftPx - rightPadPx;
      const widthPx = Math.max(minWidthPx, available);
      const zIndex = 9999 + e.from * 10 + level;
      out.set(e.id, { leftPx, widthPx, zIndex });
    }
  }
  return out;
}
function columnsToPixels(columnMap, containerWidthPx, {
  gutterPx = 2,
  // spacing between columns
  padLeftPx = 0,
  padRightPx = 0
} = {}) {
  const out = /* @__PURE__ */ new Map();
  for (const [id, c] of columnMap) {
    const totalGutters = (c.renderColumnCount - 1) * gutterPx;
    const innerWidth = containerWidthPx - padLeftPx - padRightPx - totalGutters;
    const colWidth = innerWidth / c.renderColumnCount;
    const left = padLeftPx + c.leftIndex * (colWidth + gutterPx);
    const width = colWidth * c.spanColumns + gutterPx * (c.spanColumns - 1);
    out.set(id, {
      leftPx: left,
      widthPx: Math.max(0, width),
      // later columns on top slightly, but mostly rely on time-based z
      zIndex: 1e3 + c.leftIndex
    });
  }
  return out;
}
function computeEventFrames(events, containerWidthPx, mode, options) {
  if (mode === "columns") {
    const columnLayouts = computeEventColumns(events);
    return columnsToPixels(columnLayouts, containerWidthPx, {
      gutterPx: options?.gutterPx,
      padLeftPx: options?.padLeftPx,
      padRightPx: options?.padRightPx
    });
  } else {
    return computeStackedEventLayout(events, containerWidthPx, {
      indentPx: options?.indentPx,
      rightPadPx: options?.rightPadPx,
      minWidthPx: options?.minWidthPx,
      capIndentLevels: options?.capIndentLevels
    });
  }
}
var findResourceIndexFor = (rid, resourceIds) => Math.max(0, Math.min(
  resourceIds.length - 1,
  resourceIds.findIndex((id) => id === rid)
));
var findDayIndexFor = (date, days) => Math.max(0, Math.min(
  days.length - 1,
  days.findIndex((d) => date === format(d, "yyyy-MM-dd"))
));
var Col = ({ children, divider, space, style }) => {
  return /* @__PURE__ */ React19__default.createElement(View, { style: [{ flexDirection: "column" }, style] }, React19__default.Children.toArray(children).map((child, index) => /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, { key: index }, child, index !== React19__default.Children.toArray(children).length - 1 && divider, index !== React19__default.Children.toArray(children).length - 1 && /* @__PURE__ */ React19__default.createElement(View, { style: { height: space, width: "100%" } }))));
};
var Col_default = Col;

// src/theme/resolveFont.ts
var WEIGHT_NAME_MAP = {
  "100": "Thin",
  "200": "ExtraLight",
  "300": "Light",
  "400": "Regular",
  "500": "Medium",
  "600": "SemiBold",
  "700": "Bold",
  "800": "ExtraBold",
  "900": "Black"
};
function resolveFont({ family = "System", weight = "400", italic = false }) {
  if (family === "System" || family.includes("_")) return family;
  const weightName = WEIGHT_NAME_MAP[weight] ?? "Regular";
  const base = `${family}_${weight}${weightName}`;
  return italic ? `${base}_Italic` : base;
}

// src/theme/ThemeContext.tsx
var defaultTheme = {
  typography: {
    fontFamily: "System"
  }
};
var ThemeCtx = createContext(defaultTheme);
var useCalendarTheme = () => useContext(ThemeCtx);
var useResolvedFont = (overrides) => {
  const { typography } = useCalendarTheme();
  const family = overrides?.fontFamily ?? typography?.fontFamily ?? "System";
  const weight = overrides?.fontWeight ?? "400";
  const italic = overrides?.italic ?? false;
  return resolveFont({ family, weight, italic });
};
var CalendarThemeProvider = ({ theme, children }) => {
  const mergedTheme = {
    ...defaultTheme,
    ...theme,
    typography: { ...defaultTheme.typography, ...theme?.typography }
  };
  return /* @__PURE__ */ React19__default.createElement(ThemeCtx.Provider, { value: mergedTheme }, children);
};

// src/components/TimeLabels.tsx
var TimeLabels = React19.forwardRef(({
  timezone,
  hourHeight = 120,
  startMinutes = 0,
  endMinutes = 1440,
  totalTimelineWidth,
  date,
  layout
}, ref) => {
  const isToday = isSameDay(/* @__PURE__ */ new Date(), date);
  const sHour = Math.floor(startMinutes / 60);
  const eHour = Math.ceil(endMinutes / 60);
  const dHours = eHour - sHour;
  const mOffset = sHour * 60;
  const [currentTimeYPosition, setCurrentTimeYPosition] = useState(timeToYPosition(getCurrentTimeInMinutes(timezone) - mOffset, hourHeight));
  const [currentTime, setCurrentTime] = useState(format(toZonedTime(/* @__PURE__ */ new Date(), timezone), "h:mm"));
  const APPOINTMENT_BLOCK_HEIGHT = hourHeight / 4;
  const lastLoggedYRef = useRef(0);
  const updateCurrentTimeYPosition = () => {
    const mins = getCurrentTimeInMinutes(timezone);
    const yPos = timeToYPosition(mins - mOffset, hourHeight);
    const rounded = Math.round(yPos);
    if (rounded !== lastLoggedYRef.current) {
      console.log("[CAL:nowLine]", { minutes: mins, yPos: rounded, hourHeight, contentH: dHours * hourHeight, mOffset });
      lastLoggedYRef.current = rounded;
    }
    setCurrentTimeYPosition(yPos);
  };
  const updateCurrentTime = () => {
    setCurrentTime(format(toZonedTime(/* @__PURE__ */ new Date(), timezone), "h:mm"));
  };
  const titleFace = useResolvedFont({ fontWeight: "700" });
  useEffect(() => {
    const update = () => {
      updateCurrentTime();
      updateCurrentTimeYPosition();
    };
    update();
    const intervalId = setInterval(update, 300);
    return () => clearInterval(intervalId);
  }, [timezone, hourHeight]);
  const lastScrolledDateRef = useRef(null);
  useEffect(() => {
    if (!layout) return;
    const dateKey = date.getTime();
    if (lastScrolledDateRef.current === dateKey) return;
    InteractionManager.runAfterInteractions(() => {
      let pos = isToday ? currentTimeYPosition - 240 : timeToYPosition(startMinutes - mOffset, hourHeight);
      if (ref.current) {
        ref.current.scrollTo({
          y: Math.round(pos / APPOINTMENT_BLOCK_HEIGHT) * APPOINTMENT_BLOCK_HEIGHT,
          animated: true
        });
        lastScrolledDateRef.current = dateKey;
      }
    });
  }, [layout, date, isToday, APPOINTMENT_BLOCK_HEIGHT, startMinutes, hourHeight, currentTimeYPosition]);
  return /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement(Col_default, null, Array.from({ length: dHours }).map((_, index) => /* @__PURE__ */ React19.createElement(View, { key: index, style: [styles.timeLabel, { height: hourHeight }] }, /* @__PURE__ */ React19.createElement(
    Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }
    },
    indexToDate(sHour + index).split(" ")[0]
  ), /* @__PURE__ */ React19.createElement(
    Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }
    },
    indexToDate(sHour + index).split(" ")[1]
  ))), isToday && currentTimeYPosition >= 0 && currentTimeYPosition <= dHours * hourHeight && /* @__PURE__ */ React19.createElement(View, { style: [styles.currentTime, {
    top: currentTimeYPosition - 13,
    width: TIME_LABEL_WIDTH
  }] }, /* @__PURE__ */ React19.createElement(
    Text,
    {
      allowFontScaling: false,
      style: {
        textAlign: "center",
        fontFamily: titleFace,
        fontWeight: "700",
        fontSize: getTextSize(hourHeight),
        color: "red"
      }
    },
    currentTime
  ))), isToday && currentTimeYPosition >= 0 && currentTimeYPosition <= dHours * hourHeight && /* @__PURE__ */ React19.createElement(View, { style: [styles.currentTimeLine, {
    pointerEvents: "none",
    top: currentTimeYPosition,
    width: totalTimelineWidth,
    left: TIME_LABEL_WIDTH
  }] }));
});
var styles = StyleSheet.create({
  timeLabel: {
    width: TIME_LABEL_WIDTH
  },
  currentTimeLine: {
    position: "absolute",
    height: 2,
    // Thickness of the line
    backgroundColor: "red",
    zIndex: 1e4
    // Ensure it's on top of all other elements
  },
  currentTime: {
    backgroundColor: "#fff",
    borderColor: "red",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 20,
    height: 26,
    position: "absolute",
    zIndex: 1e4
    // Ensure it's on top of all other elements
  }
});
var Hidden = ({ isHidden, children }) => {
  if (isHidden) {
    return null;
  }
  return /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, null, children);
};
var Hidden_default = Hidden;
var Center = ({ children, style }) => {
  return /* @__PURE__ */ React19__default.createElement(
    View,
    {
      style: [{
        justifyContent: "center",
        alignItems: "center"
      }, style]
    },
    children
  );
};
var Center_default = Center;
var Badge = ({
  style,
  value = "",
  children,
  fontSize,
  color = "red",
  textColor = "white"
}) => {
  const titleFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__default.createElement(View, { style: [styles2.badge, { backgroundColor: color }, style] }, children ? children : /* @__PURE__ */ React19__default.createElement(
    Text,
    {
      allowFontScaling: false,
      style: {
        color: textColor,
        fontSize,
        fontFamily: titleFace,
        fontWeight: "600"
      }
    },
    value
  ));
};
var styles2 = StyleSheet.create({
  badge: {
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 6
  }
});
var Badge_default = Badge;
var createCalendarStore = () => createStore((set2) => ({
  date: /* @__PURE__ */ new Date(),
  resourcesById: {},
  // NEW multi-day
  eventsByDay: {},
  disabledBlocksByDay: {},
  disabledIntervalsByDay: {},
  selectedEvent: null,
  draggedEventDraft: null,
  setSelectedEvent: (evt) => set2({ selectedEvent: evt }),
  setDate: (date) => set2({ date }),
  upsertResources: (rs) => set2((s) => {
    const next = { ...s.resourcesById };
    let changed = false;
    for (const r of rs) {
      const prev = next[r.id];
      if (!prev || prev.name !== r.name || prev.avatar !== r.avatar) {
        next[r.id] = { id: r.id, name: r.name, avatar: r.avatar };
        changed = true;
      }
    }
    return changed ? { resourcesById: next } : {};
  }),
  // NEW: multi-day write
  setDayDataFor: (dayKey, { events, disabledBlocks, disableIntervals }) => set2((s) => ({
    eventsByDay: events ? { ...s.eventsByDay, [dayKey]: events } : s.eventsByDay,
    disabledBlocksByDay: disabledBlocks ? { ...s.disabledBlocksByDay, [dayKey]: disabledBlocks } : s.disabledBlocksByDay,
    disabledIntervalsByDay: disableIntervals ? { ...s.disabledIntervalsByDay, [dayKey]: disableIntervals } : s.disabledIntervalsByDay
  })),
  setDraggedEventDraft: (draft) => set2({ draggedEventDraft: draft })
}));
var StoreContext = createContext(null);
var Provider = ({ children }) => {
  const ref = useRef(void 0);
  if (!ref.current) ref.current = createCalendarStore();
  return /* @__PURE__ */ React19__default.createElement(StoreContext.Provider, { value: ref.current }, children);
};
var useBound = (selector, eq) => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Calendar store used outside of Provider");
  return useStoreWithEqualityFn(store, selector, eq);
};
var useResourceById = (id) => useBound((s) => s.resourcesById[id]);
var useGetSelectedEvent = () => useBound((s) => s.selectedEvent);
var useSetSelectedEvent = () => useBound((s) => s.setSelectedEvent);
var useEventsFor = (resourceId, dayDate) => useBound((s) => {
  const key = format(dayDate, "yyyy-MM-dd");
  return s.eventsByDay?.[key]?.[resourceId] ?? [];
}, shallow);
var useGetDraggedEventDraft = () => useBound((s) => s.draggedEventDraft);
var useDisabledBlocksFor = (resourceId, dayDate) => useBound((s) => {
  const key = format(dayDate, "yyyy-MM-dd");
  return s.disabledBlocksByDay?.[key]?.[resourceId] ?? [];
}, shallow);
var useDisabledIntervalsFor = (resourceId, dayDate) => useBound((s) => {
  const key = format(dayDate, "yyyy-MM-dd");
  return s.disabledIntervalsByDay?.[key]?.[resourceId] ?? [];
}, shallow);
var useUpsertResources = () => useBound((s) => s.upsertResources);
var useSetDayDataFor = () => useBound((s) => s.setDayDataFor);
var useSetDraggedEventDraft = () => useBound((s) => s.setDraggedEventDraft);
var useSetDate = () => useBound((s) => s.setDate);
var useGetDate = () => useBound((s) => s.date);
var zustandBinding = {
  Provider,
  useResourceById,
  useEventsFor,
  useDisabledBlocksFor,
  useDisabledIntervalsFor,
  useUpsertResources,
  useSetDate,
  useGetDate,
  useSetDayDataFor,
  useGetSelectedEvent,
  useSetSelectedEvent,
  useGetDraggedEventDraft,
  useSetDraggedEventDraft
};

// src/store/bindings/BindingProvider.tsx
var BindingCtx = createContext(null);
var useCalendarBinding = () => {
  const ctx = useContext(BindingCtx);
  if (!ctx) throw new Error("useCalendarBinding must be used within <CalendarBindingProvider>");
  return ctx;
};
var CalendarBindingProvider = ({ binding, children }) => {
  const active = binding ?? zustandBinding;
  const StoreProvider = active.Provider;
  return /* @__PURE__ */ React19__default.createElement(BindingCtx.Provider, { value: active }, /* @__PURE__ */ React19__default.createElement(StoreProvider, null, children));
};

// src/components/ResourcesComponent.tsx
var ResourceComponent = ({ id, onResourcePress, APPOINTMENT_BLOCK_WIDTH, date }) => {
  const { useResourceById: useResourceById2, useEventsFor: useEventsFor2 } = useCalendarBinding();
  const resource = useResourceById2(id);
  const events = useEventsFor2(id, date);
  const titleFace = useResolvedFont({ fontWeight: "700" });
  return /* @__PURE__ */ React19.createElement(Col_default, { style: [{
    alignItems: "center",
    width: APPOINTMENT_BLOCK_WIDTH
  }] }, /* @__PURE__ */ React19.createElement(View, { style: { position: "relative" } }, /* @__PURE__ */ React19.createElement(
    StaffAvatar,
    {
      onPress: () => {
        if (onResourcePress)
          onResourcePress(resource);
      },
      name: resource?.name,
      circleSize: Math.min(40, APPOINTMENT_BLOCK_WIDTH - 12),
      fontSize: 16,
      badge: events?.length,
      image: resource?.avatar
    }
  )), /* @__PURE__ */ React19.createElement(
    Text,
    {
      style: {
        fontSize: 14,
        fontFamily: titleFace,
        fontWeight: "700"
      },
      numberOfLines: 1,
      allowFontScaling: false
    },
    resource?.name
  ));
};
var ResourcesComponent = ({ resourceIds, onResourcePress, APPOINTMENT_BLOCK_WIDTH, date }) => {
  return /* @__PURE__ */ React19.createElement(React19.Fragment, null, resourceIds?.map((id) => {
    return /* @__PURE__ */ React19.createElement(
      ResourceComponent,
      {
        date,
        key: id,
        id,
        APPOINTMENT_BLOCK_WIDTH,
        onResourcePress
      }
    );
  }));
};
function StaffAvatar({
  name,
  circleSize = 60,
  fontSize = 36,
  image,
  badge,
  badgeStyle,
  onPress,
  containerStyle,
  ringColor = "#DAEEE7",
  avatarColor,
  textColor
}) {
  const titleFace = useResolvedFont({ fontWeight: "700" });
  return /* @__PURE__ */ React19.createElement(
    TouchableOpacity,
    {
      disabled: isUndefined(onPress),
      onPress,
      style: containerStyle
    },
    /* @__PURE__ */ React19.createElement(Center_default, { style: {
      borderRadius: 9999,
      backgroundColor: ringColor
    } }, /* @__PURE__ */ React19.createElement(Hidden_default, { isHidden: isUndefined(badge) || Number(badge) == 0 }, /* @__PURE__ */ React19.createElement(
      View,
      {
        style: [{
          zIndex: 1,
          position: "absolute",
          right: -4,
          top: -6,
          borderRadius: 999,
          backgroundColor: "#fff",
          padding: 2
        }, badgeStyle]
      },
      /* @__PURE__ */ React19.createElement(
        Badge_default,
        {
          fontSize: 12,
          value: badge + "",
          color: "#4d959c"
        }
      )
    )), /* @__PURE__ */ React19.createElement(Center_default, { style: {
      margin: 2,
      borderRadius: 9999,
      backgroundColor: "white"
    } }, /* @__PURE__ */ React19.createElement(Center_default, { style: {
      margin: 2,
      borderRadius: 9999,
      height: circleSize,
      width: circleSize,
      backgroundColor: avatarColor || "#C9E5E8",
      overflow: "hidden"
    } }, image ? /* @__PURE__ */ React19.createElement(
      Image,
      {
        resizeMode: "cover",
        source: { uri: image },
        style: {
          height: "100%",
          borderRadius: 6,
          ...StyleSheet.absoluteFillObject
        }
      }
    ) : /* @__PURE__ */ React19.createElement(
      Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize,
          color: textColor || "#4d959c",
          lineHeight: circleSize
        }
      },
      name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2) : ""
    ))))
  );
}
var EventGridBlocksSkia = ({
  handleBlockPress,
  handleBlockLongPress,
  hourHeight,
  APPOINTMENT_BLOCK_WIDTH,
  startMinutes: gridStart = 0,
  endMinutes: gridEnd = 1440,
  externalPanGesture
}) => {
  const rowHeight = hourHeight / 4;
  const [pressedRow, setPressedRow] = React19.useState(null);
  const gridStartHour = Math.floor(gridStart / 60);
  const gridEndHour = Math.ceil(gridEnd / 60);
  const timeLabels = useMemo(() => {
    const out = [];
    for (let h = gridStartHour; h < gridEndHour; h++) {
      for (let q = 0; q < 4; q++) {
        const m = q * 15;
        const hh = String(h).padStart(2, "0");
        const mm = String(m).padStart(2, "0");
        out.push(`${hh}:${mm}:00`);
      }
    }
    return out;
  }, [gridStartHour, gridEndHour]);
  const rects = useMemo(
    () => timeLabels.map((_, row) => ({
      x: 0,
      y: row * rowHeight,
      width: APPOINTMENT_BLOCK_WIDTH,
      height: rowHeight,
      row
    })),
    [timeLabels, rowHeight, APPOINTMENT_BLOCK_WIDTH]
  );
  const midIndex = Math.ceil(rects.length / 2);
  const firstRects = rects.slice(0, midIndex);
  const secondRects = rects.slice(midIndex);
  const segmentHeight = rowHeight * firstRects.length;
  const onSlotPress = React19.useCallback(
    (row) => {
      setPressedRow(null);
      const slot = timeLabels[row];
      if (slot) {
        handleBlockPress(slot);
      }
    },
    [handleBlockPress, timeLabels]
  );
  const onSlotLongPress = React19.useCallback(
    (row) => {
      setPressedRow(null);
      const slot = timeLabels[row];
      if (slot) {
        handleBlockLongPress(slot);
      }
    },
    [timeLabels, handleBlockLongPress]
  );
  const onPressBegin = React19.useCallback((row) => {
    setPressedRow(row);
  }, []);
  const onTouchesUp = React19.useCallback(() => {
    setPressedRow(null);
  }, []);
  let longPressGesture = Gesture.LongPress().onBegin((e) => {
    "worklet";
    scheduleOnRN(onPressBegin, Math.floor(e.y / rowHeight));
  }).onStart((e) => {
    "worklet";
    scheduleOnRN(onSlotLongPress, Math.floor(e.y / rowHeight));
  }).onTouchesUp(() => {
    "worklet";
    scheduleOnRN(onTouchesUp);
  }).onFinalize(() => {
    "worklet";
    scheduleOnRN(onTouchesUp);
  });
  if (externalPanGesture) {
    longPressGesture = longPressGesture.simultaneousWithExternalGesture(externalPanGesture);
  }
  const tapGesture = Gesture.Tap().onBegin((e) => {
    "worklet";
    scheduleOnRN(onPressBegin, Math.floor(e.y / rowHeight));
  }).onEnd((e) => {
    "worklet";
    scheduleOnRN(onSlotPress, Math.floor(e.y / rowHeight));
  }).onTouchesUp(() => {
    "worklet";
    scheduleOnRN(onTouchesUp);
  }).onFinalize(() => {
    "worklet";
    scheduleOnRN(onTouchesUp);
  });
  const composedGesture = Gesture.Race(longPressGesture, tapGesture);
  return /* @__PURE__ */ React19.createElement(GestureDetector, { gesture: composedGesture }, /* @__PURE__ */ React19.createElement(View, null, /* @__PURE__ */ React19.createElement(Canvas, { style: { width: APPOINTMENT_BLOCK_WIDTH, height: segmentHeight } }, firstRects.map(({ x, y, width: w, height: h, row }, idx) => /* @__PURE__ */ React19.createElement(React19.Fragment, { key: idx }, /* @__PURE__ */ React19.createElement(
    Rect$1,
    {
      x,
      y,
      width: w,
      height: h,
      color: pressedRow === row ? "rgba(240,240,240,0.3)" : "rgba(240,240,240,0.6)",
      style: "fill"
    }
  ), /* @__PURE__ */ React19.createElement(Line$1, { p1: { x, y: y + h }, p2: { x: x + w, y: y + h }, color: "#ddd", strokeWidth: 1 })))), /* @__PURE__ */ React19.createElement(Canvas, { style: { width: APPOINTMENT_BLOCK_WIDTH, height: segmentHeight } }, secondRects.map(({ x, y, width: w, height: h, row }, idx) => /* @__PURE__ */ React19.createElement(React19.Fragment, { key: idx }, /* @__PURE__ */ React19.createElement(
    Rect$1,
    {
      x,
      y: y - segmentHeight,
      width: w,
      height: h,
      color: pressedRow === row ? "rgba(240,240,240,0.3)" : "rgba(240,240,240,0.6)",
      style: "fill"
    }
  ), /* @__PURE__ */ React19.createElement(
    Line$1,
    {
      p1: { x, y: y - segmentHeight + h },
      p2: { x: x + w, y: y - segmentHeight + h },
      color: "#ddd",
      strokeWidth: 1
    }
  ))))));
};
var StoreFeeder = ({ store, resources, baseDate }) => {
  const upsertResources = store.useUpsertResources();
  const setDayDataFor = store.useSetDayDataFor();
  const setDate = store.useSetDate();
  const baseDateKey = useMemo(() => format(baseDate, "yyyy-MM-dd"), [baseDate]);
  // FORK (Phase 11 — clear-on-empty): track which day-keys this feeder
  // wrote to on the previous tick so a `resources` ref that drops
  // events for a previously-populated day forces an explicit empty
  // payload through `setDayDataFor`. Without this, the `if (!items?.length) return;`
  // short-circuit below means a consumer setting `events: []` for every
  // resource (e.g. REMITechnician `LandscapeWorkweekView` in 0-tech
  // "create-card" mode) cannot clear stale events from a prior
  // selection state — the body keeps painting whatever was last seeded.
  // The Set is a Ref (not state) so it persists across renders without
  // re-triggering the effect itself.
  const prevTouchedRef = useRef(/* @__PURE__ */ new Set());
  useEffect(() => {
    setDate(baseDate);
    upsertResources(resources.map((r) => ({ id: r.id, name: r.name, avatar: r.avatar })));
    const dayBuckets = /* @__PURE__ */ new Map();
    for (const r of resources) {
      const push = (items, field) => {
        if (!items?.length) return;
        for (const it of items) {
          const key = it.date ?? baseDateKey;
          const bucket = dayBuckets.get(key) ?? dayBuckets.set(key, { events: {}, disabledBlocks: {}, disableIntervals: {} }).get(key);
          const m = bucket[field];
          (m[r.id] ||= []).push(it);
        }
      };
      push(r.events, "events");
      push(r.disabledBlocks, "disabledBlocks");
      push(r.disableIntervals, "disableIntervals");
    }
    for (const [dayKey, payload] of dayBuckets) {
      setDayDataFor(dayKey, payload);
    }
    // FORK (Phase 11): for every day-key we populated last tick but did
    // not populate this tick, write an explicit empty payload so the
    // store's `eventsByDay[dayKey]` (and the parallel disabled maps)
    // reflect the new empty reality. `setDayDataFor` overwrites
    // wholesale on a truthy `events` object, and `{}` is truthy, so
    // `useEventsFor` will start returning `[]` for every resource on
    // the cleared day.
    const currentTouched = /* @__PURE__ */ new Set(dayBuckets.keys());
    for (const staleKey of prevTouchedRef.current) {
      if (!currentTouched.has(staleKey)) {
        setDayDataFor(staleKey, { events: {}, disabledBlocks: {}, disableIntervals: {} });
      }
    }
    prevTouchedRef.current = currentTouched;
  }, [resources, upsertResources, setDayDataFor, baseDateKey]);
  return null;
};
var DisabledInterval = ({ width, top, height }) => {
  return /* @__PURE__ */ React19__default.createElement(View, { style: [styles3.disabledBlock, { width, top, height }] }, /* @__PURE__ */ React19__default.createElement(Svg, { width, height: "100%" }, /* @__PURE__ */ React19__default.createElement(Defs, null, /* @__PURE__ */ React19__default.createElement(Pattern, { id: "diagonalHatch", patternUnits: "userSpaceOnUse", width: "10", height: "10" }, /* @__PURE__ */ React19__default.createElement(Line, { x1: "0", y1: "0", x2: "10", y2: "10", stroke: "rgba(150, 150, 150, 0.8)", strokeWidth: "1" }))), /* @__PURE__ */ React19__default.createElement(Rect, { width, height: "100%", fill: "url(#diagonalHatch)" })));
};
var DisabledIntervals = React19__default.memo(({
  id,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  minuteOffset = 0,
  date: dateProp
}) => {
  const { useDisabledIntervalsFor: useDisabledIntervalsFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const disabledIntervals = useDisabledIntervalsFor2(id, dateProp ?? date);
  return /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, null, disabledIntervals.map(
    (disabledInterval, index) => {
      return /* @__PURE__ */ React19__default.createElement(
        DisabledInterval,
        {
          key: `${index}-${disabledInterval.from}-${disabledInterval.to}`,
          width: APPOINTMENT_BLOCK_WIDTH,
          top: scalePosition(disabledInterval.from - minuteOffset, hourHeight),
          height: scalePosition(disabledInterval.to - disabledInterval.from, hourHeight)
        }
      );
    }
  ));
});
var styles3 = StyleSheet.create({
  disabledBlock: {
    position: "absolute",
    zIndex: -10
  }
});
var DisabledIntervals_default = DisabledIntervals;
var Row = ({ children, divider, space, style, ...props }) => {
  return /* @__PURE__ */ React19__default.createElement(View, { style: [{ flexDirection: "row" }, style], ...props }, React19__default.Children.toArray(children).map((child, index) => /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, { key: index }, child, index !== React19__default.Children.toArray(children).length - 1 && divider, index !== React19__default.Children.toArray(children).length - 1 && /* @__PURE__ */ React19__default.createElement(View, { style: { width: space, height: "100%" } }))));
};
var Row_default = Row;
var DisabledBlockComponent = ({
  top,
  height,
  layout,
  disabledBlock,
  hourHeight,
  onDisabledBlockPress
}) => {
  const dynamicStyle = {
    backgroundColor: "#d3d3d3",
    top: top + 2,
    left: layout.leftPx + 1,
    height: height < hourHeight / 4 ? height : height - 4,
    width: layout.widthPx - 3,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)"
  };
  const titleFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__default.createElement(
    TouchableOpacity,
    {
      style: [styles4.event, dynamicStyle],
      onPress: () => {
        onDisabledBlockPress && onDisabledBlockPress(disabledBlock);
      }
    },
    /* @__PURE__ */ React19__default.createElement(Col_default, { style: { position: "relative" } }, /* @__PURE__ */ React19__default.createElement(Row_default, { style: { height: 18 } }, /* @__PURE__ */ React19__default.createElement(
      Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }
      },
      minutesToTime(disabledBlock?.from),
      " - ",
      minutesToTime(disabledBlock?.to)
    )), /* @__PURE__ */ React19__default.createElement(
      Text,
      {
        allowFontScaling: false,
        style: {
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }
      },
      disabledBlock?.title
    ))
  );
};
var DisabledBlocks = React19__default.memo(({
  id,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  minuteOffset = 0,
  onDisabledBlockPress,
  date: dateProp
}) => {
  const { useDisabledBlocksFor: useDisabledBlocksFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const disabledBlocks = useDisabledBlocksFor2(id, dateProp ?? date);
  const layoutMap = useMemo(() => {
    return columnsToPixels(computeDisabledBlockColumns(disabledBlocks), APPOINTMENT_BLOCK_WIDTH);
  }, [disabledBlocks]);
  return /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, null, disabledBlocks.map(
    (disabledBlock, index) => {
      const key = disabledBlock.id;
      return /* @__PURE__ */ React19__default.createElement(
        DisabledBlockComponent,
        {
          hourHeight,
          disabledBlock,
          key: `${index}-${disabledBlock.from}-${disabledBlock.to}`,
          top: scalePosition(disabledBlock.from - minuteOffset, hourHeight),
          height: scalePosition(disabledBlock.to - disabledBlock.from, hourHeight),
          layout: layoutMap.get(key),
          onDisabledBlockPress
        }
      );
    }
  ));
});
var styles4 = StyleSheet.create({
  event: {
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 999
    // Ensure events stay above the background blocks
  }
});
var DisabledBlocks_default = DisabledBlocks;
var EventBlock = React19__default.memo(({
  event,
  onLongPress,
  onPress,
  disabled,
  selected,
  hourHeight,
  minuteOffset = 0,
  slots,
  frame,
  styleOverrides
}) => {
  const { useGetSelectedEvent: useGetSelectedEvent2 } = useCalendarBinding();
  const selectedAppointment = useGetSelectedEvent2();
  const eventTop = scalePosition(event.from - minuteOffset, hourHeight);
  const rawEventHeight = scalePosition(event.to - event.from, hourHeight);
  const MIN_EVENT_PX = 22;
  const eventHeight = Math.max(rawEventHeight, MIN_EVENT_PX);
  const start = minutesToTime(event.from);
  const end = minutesToTime(event.to);
  const dynamicStyle = {
    top: eventTop + 2,
    height: eventHeight < hourHeight / 4 ? eventHeight : eventHeight - 4,
    left: frame.leftPx + 1,
    width: frame.widthPx - 3,
    zIndex: frame.zIndex,
    opacity: selectedAppointment || disabled ? 0.5 : 1,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? "#4d959c" : "rgba(0,0,0,0.12)"
  };
  const resolved = typeof styleOverrides === "function" ? styleOverrides(event) ?? {} : styleOverrides ?? {};
  if (eventHeight == 0)
    return null;
  const TopRight = slots?.TopRight;
  const Body = slots?.Body;
  const titleFace = useResolvedFont({ fontWeight: "700" });
  const timeFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19__default.createElement(
    TouchableOpacity,
    {
      // FORK Phase 23 (PR-UX-2): swapped `resolved?.container` to
      // last so user-supplied container styles (opacity, borderWidth,
      // borderColor) actually override the library's hard-coded
      // dynamicStyle. Matches the order already used in DraggableEvent.
      style: [styles5.event, dynamicStyle, resolved?.container],
      hitSlop: { top: 10, bottom: 10, left: 4, right: 4 },
      disabled,
      onPress: () => {
        onPress && onPress(event);
      },
      onLongPress: () => {
        onLongPress && onLongPress(event);
      }
    },
    /* @__PURE__ */ React19__default.createElement(Col_default, { style: [{ position: "relative" }, resolved?.content] }, /* @__PURE__ */ React19__default.createElement(
      TextInput,
      {
        editable: false,
        allowFontScaling: false,
        underlineColorAndroid: "transparent",
        style: [{
          width: "100%",
          fontFamily: timeFace,
          fontSize: getTextSize(hourHeight),
          pointerEvents: "none",
          padding: 0,
          margin: 0,
          color: "black"
        }, resolved?.time],
        defaultValue: `${start} - ${end}`
      }
    ), Body ? /* @__PURE__ */ React19__default.createElement(Body, { event, ctx: { hourHeight } }) : /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, null, /* @__PURE__ */ React19__default.createElement(Row_default, { style: { alignItems: "center", height: 18 } }, /* @__PURE__ */ React19__default.createElement(
      Text,
      {
        allowFontScaling: false,
        style: [{
          fontFamily: titleFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "700"
        }, resolved?.title]
      },
      event?.title
    )), /* @__PURE__ */ React19__default.createElement(
      Text,
      {
        allowFontScaling: false,
        style: [{
          fontFamily: timeFace,
          fontSize: getTextSize(hourHeight),
          fontWeight: "600"
        }, resolved?.desc]
      },
      event?.description
    )), /* @__PURE__ */ React19__default.createElement(Row_default, { style: {
      position: "absolute",
      right: 2
    } }, TopRight ? /* @__PURE__ */ React19__default.createElement(TopRight, { event, ctx: { hourHeight } }) : null))
  );
});
var styles5 = StyleSheet.create({
  event: {
    backgroundColor: "#4d959c",
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 9999
    // Ensure events stay above the background blocks
  }
});
var EventBlock_default = EventBlock;
var AnimatedTextInput = Animated2.createAnimatedComponent(TextInput);
var DraggableEvent = ({
  selectedEvent,
  eventStartedTop,
  panYAbs,
  panXAbs,
  APPOINTMENT_BLOCK_WIDTH,
  hourHeight,
  eventHeight,
  styleOverrides,
  slots
}) => {
  const dynamicStyle = useAnimatedStyle(() => {
    return {
      height: eventHeight.value < hourHeight / 4 ? eventHeight.value : eventHeight.value - 4,
      width: APPOINTMENT_BLOCK_WIDTH - 3,
      borderWidth: 1,
      borderColor: "rgba(0,0,0,0.12)"
    };
  });
  const draggingAnimatedStyle = useAnimatedStyle(() => {
    if (!selectedEvent) {
      return {
        opacity: 0,
        transform: [
          {
            translateY: 0
          },
          {
            translateX: 0
          }
        ]
      };
    }
    return {
      opacity: 1,
      transform: [
        {
          translateY: panYAbs.value - eventHeight.value / 2 + 2
        },
        {
          translateX: panXAbs.value - APPOINTMENT_BLOCK_WIDTH / 2 + 1
        }
      ]
    };
  }, [selectedEvent, APPOINTMENT_BLOCK_WIDTH]);
  const initialDisplayTime = useMemo(() => {
    const start = minutesToTime(positionToMinutes(eventStartedTop.value, hourHeight));
    const end = minutesToTime(positionToMinutes(eventStartedTop.value + eventHeight.value, hourHeight));
    return `${start} - ${end}`;
  }, [hourHeight]);
  const animatedTimeProps = useAnimatedProps(() => {
    const start = minutesToTime(positionToMinutes(eventStartedTop.value, hourHeight));
    const end = minutesToTime(positionToMinutes(eventStartedTop.value + eventHeight.value, hourHeight));
    return {
      text: `${start} - ${end}`
    };
  }, [hourHeight]);
  const resolved = typeof styleOverrides === "function" ? styleOverrides(selectedEvent) ?? {} : styleOverrides ?? {};
  const TopRight = slots?.TopRight;
  const Body = slots?.Body;
  const titleFace = useResolvedFont({ fontWeight: "700" });
  const timeFace = useResolvedFont({ fontWeight: "600" });
  return /* @__PURE__ */ React19.createElement(Animated2.View, { style: [styles6.event, dynamicStyle, draggingAnimatedStyle, resolved?.container] }, /* @__PURE__ */ React19.createElement(Col_default, { style: [{ position: "relative" }, resolved?.content] }, /* @__PURE__ */ React19.createElement(
    AnimatedTextInput,
    {
      editable: false,
      allowFontScaling: false,
      underlineColorAndroid: "transparent",
      style: [{
        width: "100%",
        fontFamily: timeFace,
        fontSize: getTextSize(hourHeight),
        pointerEvents: "none",
        padding: 0,
        margin: 0,
        color: "black"
      }, resolved?.time],
      defaultValue: initialDisplayTime,
      animatedProps: animatedTimeProps
    }
  ), Body ? /* @__PURE__ */ React19.createElement(Body, { event: selectedEvent, ctx: { hourHeight } }) : /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement(Row_default, { style: { alignItems: "center", height: 18 } }, /* @__PURE__ */ React19.createElement(
    Text,
    {
      allowFontScaling: false,
      style: [{
        fontFamily: titleFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "700"
      }, resolved?.title]
    },
    selectedEvent?.title
  )), /* @__PURE__ */ React19.createElement(
    Text,
    {
      allowFontScaling: false,
      style: [{
        fontFamily: timeFace,
        fontSize: getTextSize(hourHeight),
        fontWeight: "600"
      }, resolved?.desc]
    },
    selectedEvent?.description
  )), /* @__PURE__ */ React19.createElement(Row_default, { style: {
    position: "absolute",
    right: 2
  }, space: 2 }, TopRight ? /* @__PURE__ */ React19.createElement(TopRight, { event: selectedEvent, ctx: { hourHeight } }) : null)), /* @__PURE__ */ React19.createElement(Row_default, { style: {
    position: "absolute",
    alignSelf: "center",
    bottom: 0
  } }, /* @__PURE__ */ React19.createElement(MaterialIcons, { name: "drag-handle", size: 12, color: "black" })));
};
var styles6 = StyleSheet.create({
  event: {
    backgroundColor: "#4d959c",
    position: "absolute",
    borderRadius: 5,
    padding: 2,
    overflow: "hidden",
    zIndex: 99
    // Ensure events stay above the background blocks
  }
});
var EventBlocks = React19__default.memo(({
  id,
  onLongPress,
  onPress,
  hourHeight,
  minuteOffset = 0,
  EVENT_BLOCK_WIDTH,
  eventRenderer,
  isEventDisabled,
  isEventSelected,
  mode,
  date: dateProp
}) => {
  const { useEventsFor: useEventsFor2, useGetDate: useGetDate2 } = useCalendarBinding();
  const date = useGetDate2();
  const events = useEventsFor2(id, dateProp ?? date);
  const frameMap = useMemo(
    () => computeEventFrames(events, EVENT_BLOCK_WIDTH, mode),
    [events, mode, EVENT_BLOCK_WIDTH]
  );
  const Renderer = eventRenderer;
  return events?.map(
    (evt, index) => {
      const selected = isEventSelected?.(evt) ?? false;
      const disabled = isEventDisabled?.(evt) ?? false;
      return /* @__PURE__ */ React19__default.createElement(
        Renderer,
        {
          // FORK Phase 38 (2026-05-13): key by stable event id, not slot position.
          // See dist/index.js + README-FORK.md Phase 38 for the full rationale.
          key: evt.id,
          event: evt,
          onLongPress: (evt2) => onLongPress(evt2),
          onPress: (evt2) => onPress(evt2),
          hourHeight,
          minuteOffset,
          frame: frameMap.get(evt.id),
          selected,
          disabled
        }
      );
    }
  );
});
var EventBlocks_default = EventBlocks;
var DaysComponent = ({ onResourcePress, activeResourceId, mode, date, APPOINTMENT_BLOCK_WIDTH, multiDayCount, showResourceHeader = true }) => {
  const { useResourceById: useResourceById2 } = useCalendarBinding();
  const resource = useResourceById2(activeResourceId);
  useResolvedFont({ fontWeight: "700" });
  const subTitleFace = useResolvedFont({ fontWeight: "600" });
  const isMultiDay = mode !== "day";
  const visibleDayCount = isMultiDay ? multiDayCount ?? (mode === "week" ? 7 : 3) : 1;
  const days = useMemo(
    () => Array.from({ length: visibleDayCount }, (_, i) => addDays(date, i)),
    [date, visibleDayCount]
  );
  return /* @__PURE__ */ React19.createElement(Row_default, { style: { paddingVertical: 4 } }, /* @__PURE__ */ React19.createElement(Col_default, { style: { width: TIME_LABEL_WIDTH, alignItems: "center", justifyContent: "center" } }, showResourceHeader ? /* @__PURE__ */ React19.createElement(
    StaffAvatar,
    {
      onPress: () => {
        if (onResourcePress)
          onResourcePress(resource);
      },
      name: resource?.name,
      circleSize: TIME_LABEL_WIDTH - 12,
      fontSize: 16,
      image: resource?.avatar
    }
  ) : null), /* @__PURE__ */ React19.createElement(Row_default, { style: { flex: 1 } }, days.map((d, i) => {
    const selected = isSameDay(d, /* @__PURE__ */ new Date());
    return /* @__PURE__ */ React19.createElement(
      Col_default,
      {
        style: {
          alignItems: "center",
          justifyContent: "center",
          width: APPOINTMENT_BLOCK_WIDTH
        },
        space: 4,
        key: d.toString()
      },
      /* @__PURE__ */ React19.createElement(Center_default, { style: {
        backgroundColor: selected ? "#4d959c" : void 0,
        width: Math.min(30, APPOINTMENT_BLOCK_WIDTH - 8),
        height: Math.min(30, APPOINTMENT_BLOCK_WIDTH - 8),
        borderRadius: 999
      } }, /* @__PURE__ */ React19.createElement(
        Text,
        {
          style: {
            fontSize: 16,
            fontFamily: subTitleFace,
            fontWeight: "600",
            color: selected ? "#fff" : void 0
          },
          numberOfLines: 1,
          allowFontScaling: false
        },
        format(d, "d")
      )),
      /* @__PURE__ */ React19.createElement(
        Text,
        {
          style: {
            fontSize: 14,
            fontFamily: subTitleFace,
            fontWeight: "600"
          },
          numberOfLines: 1,
          allowFontScaling: false
        },
        format(d, "EEE")
      )
    );
  })));
};
var AnimatedFlashList = Animated2.createAnimatedComponent(FlashList);
var CalendarInner = (props) => {
  const { width } = useWindowDimensions();
  const isIOS = Platform.OS === "ios";
  const binding = useCalendarBinding();
  const {
    date,
    numberOfColumns: numberOfColumnsProp = 3,
    startMinutes,
    endMinutes,
    hourHeight = 120,
    snapIntervalInMinutes = 5,
    timezone = Intl?.DateTimeFormat()?.resolvedOptions()?.timeZone,
    resources,
    onResourcePress,
    onBlockLongPress,
    onBlockTap,
    onEventPress,
    onEventLongPress,
    onDisabledBlockPress,
    enableHapticFeedback = false,
    eventSlots,
    eventStyleOverrides,
    overLappingLayoutMode = "stacked",
    mode = "day",
    activeResourceId,
    multiDayCount,
    scrollsToTop = true,
    onZoom
  } = props;
  const isMultiDay = mode !== "day";
  const visibleDayCount = isMultiDay ? multiDayCount ?? (mode === "week" ? 7 : 3) : 1;
  const numberOfColumns = mode === "day" ? numberOfColumnsProp : visibleDayCount;
  const startHour = Math.floor((startMinutes ?? 0) / 60);
  const endHour = Math.ceil((endMinutes ?? 1440) / 60);
  const displayHours = endHour - startHour;
  const minuteOffset = startHour * 60;
  const totalDayHeight = displayHours * hourHeight;
  const days = useMemo(
    () => Array.from({ length: visibleDayCount }, (_, i) => addDays(date, i)),
    [date, visibleDayCount]
  );
  const snapInterval = hourHeight / 60 * snapIntervalInMinutes;
  const onPressRef = React19__default.useRef(onEventPress);
  const onLongPressRef = React19__default.useRef(onEventLongPress);
  const internalOnLongPress = useRef(null);
  const onDisabledBlockPressRef = React19__default.useRef(onDisabledBlockPress);
  const selectedRef = useRef(props.isEventSelected);
  const disabledRef = useRef(props.isEventDisabled);
  const effectiveRenderer = useMemo(() => {
    return (p) => /* @__PURE__ */ React19__default.createElement(
      EventBlock_default,
      {
        ...p,
        slots: props.eventSlots,
        styleOverrides: props.eventStyleOverrides
      }
    );
  }, [eventSlots, eventStyleOverrides]);
  const isEventSelectedStable = useCallback(
    (ev) => selectedRef.current ? selectedRef.current(ev) : false,
    []
  );
  const isEventDisabledStable = useCallback(
    (ev) => disabledRef.current ? disabledRef.current(ev) : false,
    []
  );
  useEffect(() => {
    onPressRef.current = onEventPress;
  }, [onEventPress]);
  useEffect(() => {
    onLongPressRef.current = onEventLongPress;
  }, [onEventLongPress]);
  useEffect(() => {
    onDisabledBlockPressRef.current = onDisabledBlockPress;
  }, [onDisabledBlockPress]);
  const onZoomRef = useRef(onZoom);
  useEffect(() => {
    onZoomRef.current = onZoom;
  }, [onZoom]);
  const fireZoom = useCallback((scale) => {
    onZoomRef.current?.(scale);
  }, []);
  useEffect(() => {
    rendererRef.current = effectiveRenderer;
  }, [effectiveRenderer]);
  useEffect(() => {
    selectedRef.current = props.isEventSelected;
  }, [props.isEventSelected]);
  useEffect(() => {
    disabledRef.current = props.isEventDisabled;
  }, [props.isEventDisabled]);
  const rendererRef = useRef(effectiveRenderer);
  const stableRenderer = useCallback((p) => rendererRef.current(p), []);
  const stableOnPress = React19__default.useCallback((e) => onPressRef.current?.(e), []);
  const stableOnDisabledBlockPress = React19__default.useCallback((b) => onDisabledBlockPressRef.current?.(b), []);
  const { useGetSelectedEvent: useGetSelectedEvent2, useSetSelectedEvent: useSetSelectedEvent2, useSetDraggedEventDraft: useSetDraggedEventDraft2, useGetDraggedEventDraft: useGetDraggedEventDraft2 } = useCalendarBinding();
  const selectedEvent = useGetSelectedEvent2();
  const setSelectedEvent = useSetSelectedEvent2();
  const setDraggedEventDraft = useSetDraggedEventDraft2();
  const APPOINTMENT_BLOCK_WIDTH = (width - TIME_LABEL_WIDTH) / numberOfColumns;
  useEffect(() => {
    console.log("[CAL:lib] layout params", { numberOfColumns, ABW: Math.round(APPOINTMENT_BLOCK_WIDTH), totalW: Math.round(APPOINTMENT_BLOCK_WIDTH * numberOfColumns), viewportW: width, hourHeight, contentH: totalDayHeight, displayHours, minuteOffset });
  }, [numberOfColumns, APPOINTMENT_BLOCK_WIDTH, hourHeight, width]);
  const hourHeightRef = useRef(hourHeight);
  const resourcesRef = useRef(resources);
  const apptWidthRef = useRef(APPOINTMENT_BLOCK_WIDTH);
  const isMultiDayRef = useRef(isMultiDay);
  const daysRef = useRef(days);
  useEffect(() => {
    hourHeightRef.current = hourHeight;
  }, [hourHeight]);
  useEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);
  useEffect(() => {
    apptWidthRef.current = APPOINTMENT_BLOCK_WIDTH;
  }, [APPOINTMENT_BLOCK_WIDTH]);
  useEffect(() => {
    isMultiDayRef.current = isMultiDay;
  }, [isMultiDay]);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);
  useEffect(() => {
    console.log("[CAL:gesture] selectedEvent changed", { id: selectedEvent?.id ?? null, hasEvent: !!selectedEvent });
    if (!selectedEvent) {
      setDraggedEventDraft(null);
      setDragReady(false);
    }
  }, [selectedEvent, setSelectedEvent, setDraggedEventDraft]);
  useEffect(() => {
    scrollX.value = 0;
  }, [mode, numberOfColumns]);
  const verticalScrollViewRef = useAnimatedRef();
  const headerScrollViewRef = useAnimatedRef();
  const flashListRef = useRef(null);
  const prevResourceIdsRef = useRef([]);
  const [layout, setLayout] = useState(null);
  const [dragReady, setDragReady] = useState(false);
  const dateRef = useRef(date);
  const originalDurationRef = useRef(0);
  const eventStartedTop = useSharedValue(0);
  const eventHeight = useSharedValue(0);
  const panXAbs = useSharedValue(0);
  const panYAbs = useSharedValue(0);
  const isPinching = useSharedValue(false);
  const pinchBaseHeight = useSharedValue(0);
  const isZooming = useSharedValue(false);
  const zoomBaseHourHeight = useSharedValue(0);
  const zoomTX = useSharedValue(0);
  const zoomTY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const autoScrollSpeed = useSharedValue(0);
  const autoScrollXSpeed = useSharedValue(0);
  const lastHapticScrollY = useSharedValue(0);
  const lastXScrollTime = useSharedValue(0);
  const startedX = useSharedValue(0);
  const startedY = useSharedValue(0);
  const touchY = useSharedValue(0);
  const triggerHaptic = useCallback(
    async (style = "Light") => {
      try {
        const Haptics = await import('expo-haptics');
        const feedbackStyle = Haptics.ImpactFeedbackStyle[style];
        if (enableHapticFeedback)
          await Haptics.impactAsync(feedbackStyle);
      } catch (e) {
        console.log("Haptics not available, skipping...");
      }
    },
    [enableHapticFeedback]
  );
  const gestureLog = useCallback((...args) => {
    console.log("[CAL:gesture]", ...args);
  }, []);
  const zoomStyle = useAnimatedStyle(() => {
    if (zoomTX.value === 0 && zoomTY.value === 0) return {};
    return {
      transform: [
        { translateX: zoomTX.value },
        { translateY: zoomTY.value },
      ],
    };
  });
  const resourceIds = useMemo(() => {
    const ids = resources?.map((item) => item?.id) || [];
    if (JSON.stringify(prevResourceIdsRef.current) !== JSON.stringify(ids)) {
      prevResourceIdsRef.current = ids;
    }
    return prevResourceIdsRef.current;
  }, [resources]);
  const finalizeDrag = React19__default.useCallback((colIndex, adjustedTop, height, isResize = false) => {
    const isMultiDay2 = mode !== "day";
    const landedResourceId = !isMultiDay2 ? resourceIds[colIndex] : activeResourceId ?? resourceIds[0];
    const landedDate = format(!isMultiDay2 ? date : days[colIndex], "yyyy-MM-dd");
    const fromMin = positionToMinutes(adjustedTop, hourHeight) + minuteOffset;
    const toMin = isResize
      ? positionToMinutes(adjustedTop + height, hourHeight) + minuteOffset
      : fromMin + originalDurationRef.current;
    console.log("[CAL:gesture] finalizeDrag", { col: colIndex, landedResourceId, landedDate, from: fromMin, to: toMin, eventId: selectedEvent?.id, height, isResize, minuteOffset });
    setDraggedEventDraft({
      event: selectedEvent,
      from: fromMin,
      to: toMin,
      resourceId: landedResourceId,
      date: landedDate
    });
  }, [mode, resourceIds, activeResourceId, selectedEvent, hourHeight, minuteOffset, setDraggedEventDraft, days]);
  const columns = useMemo(() => {
    if (!isMultiDay) {
      return resourceIds.map((resourceId) => ({ kind: "resource", resourceId }));
    }
    return days.map((dayDate, dayIndex) => ({ kind: "day", dayIndex, dayDate }));
  }, [isMultiDay, resourceIds, days]);
  const panGesture = Gesture.Pan().manualActivation(!isIOS).enabled(layout !== null).shouldCancelWhenOutside(false).onBegin((evt) => {
    "worklet";
    scheduleOnRN(gestureLog, "pan:begin", { pointers: evt.numberOfPointers, hasSelected: !!selectedEvent, x: Math.round(evt.x), y: Math.round(evt.y) });
  }).onTouchesMove((_evt, stateManager) => {
    "worklet";
    if (isIOS) return;
    if (selectedEvent)
      stateManager.activate();
    else stateManager.end();
  }).onUpdate((evt) => {
    "worklet";
    if (!evt || evt.y == null || evt.x == null) return;
    if (isPinching.value || isZooming.value) return;
    if (evt.numberOfPointers >= 2 && !isDragging.value) return;
    touchY.value = evt.y;
    if (!isDragging.value) {
      const draggableMinY = panYAbs.value - eventHeight.value / 2;
      const draggableMaxY = panYAbs.value + eventHeight.value / 2;
      const blockMinX = panXAbs.value - APPOINTMENT_BLOCK_WIDTH / 2;
      const blockMaxX = panXAbs.value + APPOINTMENT_BLOCK_WIDTH / 2;
      if (!(evt.x >= blockMinX && evt.x <= blockMaxX && evt.y >= draggableMinY && evt.y <= draggableMaxY)) return;
      scheduleOnRN(gestureLog, "pan:dragStart", evt.numberOfPointers);
    }
    {
      isDragging.value = true;
      const translatedY = Math.round(evt.translationY / snapInterval) * snapInterval;
      const proposedAbsoluteTop = startedY.value - eventHeight.value / 2 + translatedY + scrollY.value;
      let snappedAbsoluteTop = Math.round(proposedAbsoluteTop / snapInterval) * snapInterval;
      snappedAbsoluteTop = Math.max(0, snappedAbsoluteTop);
      if (layout) {
        const maxAbsoluteTop = layout.height + scrollY.value - snapInterval;
        snappedAbsoluteTop = Math.min(snappedAbsoluteTop, maxAbsoluteTop);
      }
      if (snappedAbsoluteTop !== eventStartedTop.value) {
        scheduleOnRN(triggerHaptic);
        eventStartedTop.value = snappedAbsoluteTop;
      }
      panYAbs.value = snappedAbsoluteTop - scrollY.value + eventHeight.value / 2;
      let panXAbsValue = Math.max(
        APPOINTMENT_BLOCK_WIDTH / 2 + TIME_LABEL_WIDTH,
        startedX.value + evt.translationX
      );
      if (layout?.width) {
        panXAbsValue = Math.min(
          layout.width - APPOINTMENT_BLOCK_WIDTH / 2,
          panXAbsValue
        );
      }
      panXAbs.value = panXAbsValue;
      if (layout) {
        const AUTO_SCROLL_BUFFER = 30;
        if (evt.y > layout.height - AUTO_SCROLL_BUFFER) {
          autoScrollSpeed.value = 1;
        } else if (evt.y < AUTO_SCROLL_BUFFER) {
          autoScrollSpeed.value = -1;
        } else {
          autoScrollSpeed.value = 0;
        }
        if (panXAbs.value >= layout.width - APPOINTMENT_BLOCK_WIDTH / 2) {
          autoScrollXSpeed.value = 1;
        } else if (panXAbs.value <= APPOINTMENT_BLOCK_WIDTH / 2 + TIME_LABEL_WIDTH) {
          autoScrollXSpeed.value = -1;
        } else {
          autoScrollXSpeed.value = 0;
        }
      } else {
        autoScrollSpeed.value = 0;
        autoScrollXSpeed.value = 0;
      }
    }
  }).onEnd(() => {
    "worklet";
    autoScrollSpeed.value = 0;
    autoScrollXSpeed.value = 0;
    lastXScrollTime.value = 0;
    if (!isDragging.value) {
      // FORK: if long-press armed a draft event (selectedEvent set) but the
      // user released without sliding their finger far enough to flip
      // isDragging.value, still finalize at the original press position so
      // the consumer's onDragEnd handler fires. Without this, a quick
      // press-and-release on empty whitespace silently dismisses the dashed
      // draft block and never opens the create-event form -- which the user
      // experiences as the long-press "working every other time".
      // FORK Phase 17.2 (P2-FE-5 chunk 2b.2 — bug fix): see dist/index.js
      // for the full rationale. Real-event double-tap → release without
      // sliding must NOT finalizeDrag; otherwise reschedule sheet opens
      // with no actual move. Draft events keep original behaviour.
      if (selectedEvent) {
        const evtId = selectedEvent.id;
        const isDraftEvent = evtId == null || evtId < 0 || (selectedEvent.meta && selectedEvent.meta.isDraft);
        if (!isDraftEvent) {
          scheduleOnRN(gestureLog, "pan:end:noDrag:realEvent:cancel", evtId);
          scheduleOnRN(setSelectedEvent, null);
          scheduleOnRN(setDragReady, false);
          return;
        }
        const finalXOnScreen = panXAbs.value;
        const absoluteX = finalXOnScreen + scrollX.value;
        const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / APPOINTMENT_BLOCK_WIDTH);
        const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
        scheduleOnRN(gestureLog, "pan:end:noDrag:finalizePress", colIndex);
        scheduleOnRN(finalizeDrag, colIndex, eventStartedTop.value, eventHeight.value, false);
        return;
      }
      scheduleOnRN(gestureLog, "pan:end:noDrag");
      return;
    }
    const finalEventTop = panYAbs.value - eventHeight.value / 2 + scrollY.value;
    let adjustedFinalEventTop = Math.round(finalEventTop / snapInterval) * snapInterval;
    adjustedFinalEventTop = Math.max(0, adjustedFinalEventTop);
    const finalPanYValue = adjustedFinalEventTop - scrollY.value + eventHeight.value / 2;
    const finalXOnScreen = panXAbs.value;
    const absoluteX = finalXOnScreen + scrollX.value;
    const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / APPOINTMENT_BLOCK_WIDTH);
    const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
    const finalPanXValue = TIME_LABEL_WIDTH + colIndex * APPOINTMENT_BLOCK_WIDTH - scrollX.value + APPOINTMENT_BLOCK_WIDTH / 2;
    panYAbs.value = withSpring(finalPanYValue);
    panXAbs.value = withSpring(finalPanXValue);
    eventStartedTop.value = adjustedFinalEventTop;
    startedY.value = finalPanYValue;
    startedX.value = finalPanXValue;
    isDragging.value = false;
    scheduleOnRN(gestureLog, "pan:end:finalize", colIndex);
    scheduleOnRN(finalizeDrag, colIndex, adjustedFinalEventTop, eventHeight.value, false);
  });
  const pinchGesture = Gesture.Pinch().onStart((evt) => {
    "worklet";
    scheduleOnRN(gestureLog, "pinch:start", { pointers: evt.numberOfPointers, hasSelected: !!selectedEvent, isDrag: isDragging.value });
    if (isDragging.value) return;
    if (selectedEvent) {
      isPinching.value = true;
      pinchBaseHeight.value = eventHeight.value;
      scheduleOnRN(gestureLog, "pinch:resize:begin", eventHeight.value);
    } else {
      isZooming.value = true;
      zoomBaseHourHeight.value = hourHeight;
      scheduleOnRN(gestureLog, "pinch:zoom:begin", hourHeight);
    }
  }).onUpdate((evt) => {
    "worklet";
    if (isZooming.value) {
      const newH = zoomBaseHourHeight.value * evt.scale;
      scheduleOnRN(fireZoom, newH);
      return;
    }
    if (!isPinching.value) return;
    const newHeight = pinchBaseHeight.value * evt.scale;
    const snappedHeight = Math.round(newHeight / snapInterval) * snapInterval;
    let finalHeight = Math.max(hourHeight / 4, snappedHeight);
    const maxAllowedHeight = totalDayHeight - eventStartedTop.value;
    finalHeight = Math.min(finalHeight, maxAllowedHeight);
    if (finalHeight !== eventHeight.value) {
      eventHeight.value = finalHeight;
      const onScreenTop = eventStartedTop.value - scrollY.value;
      panYAbs.value = onScreenTop + finalHeight / 2;
      scheduleOnRN(triggerHaptic);
    }
  }).onEnd((evt) => {
    "worklet";
    if (isZooming.value) {
      isZooming.value = false;
      const finalH = zoomBaseHourHeight.value * evt.scale;
      scheduleOnRN(gestureLog, "pinch:zoom:end", finalH);
      scheduleOnRN(fireZoom, finalH);
      return;
    }
    if (isPinching.value) {
      isPinching.value = false;
      const finalXOnScreen = panXAbs.value;
      const absoluteX = finalXOnScreen + scrollX.value;
      const newStaffIndex = Math.floor((absoluteX - TIME_LABEL_WIDTH) / APPOINTMENT_BLOCK_WIDTH);
      const colIndex = Math.max(0, Math.min(newStaffIndex, columns.length - 1));
      scheduleOnRN(gestureLog, "pinch:resize:end", { col: colIndex, top: eventStartedTop.value, h: eventHeight.value });
      scheduleOnRN(finalizeDrag, colIndex, eventStartedTop.value, eventHeight.value, true);
      return;
    }
    scheduleOnRN(gestureLog, "pinch:end:noAction");
  });
  const zoomPanGesture = Gesture.Pan().minPointers(2).onStart(() => {
    "worklet";
    savedTX.value = zoomTX.value;
    savedTY.value = zoomTY.value;
    scheduleOnRN(gestureLog, "zoomPan:start", { tx: zoomTX.value, ty: zoomTY.value });
  }).onUpdate((evt) => {
    "worklet";
    if (isPinching.value || isZooming.value || selectedEvent) return;
    zoomTX.value = savedTX.value + evt.translationX;
    zoomTY.value = savedTY.value + evt.translationY;
  }).onEnd(() => {
    "worklet";
    scheduleOnRN(gestureLog, "zoomPan:end", { tx: zoomTX.value, ty: zoomTY.value });
  });
  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture, zoomPanGesture);
  const scrollListTo = (x) => {
    flashListRef.current?.scrollToOffset({ offset: x, animated: false });
  };
  useFrameCallback((frameInfo) => {
    if (autoScrollXSpeed.value === 0) {
      return;
    }
    const now = frameInfo.timeSinceFirstFrame;
    const scrollInterval = 500;
    if (now - lastXScrollTime.value > scrollInterval) {
      lastXScrollTime.value = now;
      const increment = APPOINTMENT_BLOCK_WIDTH * Math.sign(autoScrollXSpeed.value);
      const newScrollX = scrollX.value + increment;
      scheduleOnRN(scrollListTo, newScrollX);
      scheduleOnRN(triggerHaptic, "Medium");
    }
  });
  useFrameCallback(() => {
    if (autoScrollSpeed.value === 0) {
      return;
    }
    const increment = snapInterval / 5 * Math.sign(autoScrollSpeed.value);
    const newScrollY = scrollY.value + increment;
    scrollTo(verticalScrollViewRef, 0, newScrollY, false);
    if (isDragging.value) {
      let currentEventTop = panYAbs.value - eventHeight.value / 2 + newScrollY;
      currentEventTop = Math.round(currentEventTop / snapInterval) * snapInterval;
      eventStartedTop.value = Math.max(0, currentEventTop);
    }
    if (isPinching.value) {
      const onScreenTop = eventStartedTop.value - newScrollY;
      panYAbs.value = onScreenTop + eventHeight.value / 2;
    }
    const scrollDiff = Math.abs(newScrollY - lastHapticScrollY.value);
    if (scrollDiff >= snapInterval) {
      lastHapticScrollY.value = newScrollY;
      scheduleOnRN(triggerHaptic, "Medium");
    }
  });
  useEffect(() => {
    internalOnLongPress.current = (event) => {
      console.log("[CAL:gesture] longPress", { eventId: event?.id, resourceId: event?.resourceId, from: event?.from, to: event?.to, minuteOffset });
      onLongPressRef.current?.(event);
      const hh = hourHeightRef.current;
      const eventTop = scalePosition(event.from - minuteOffset, hh);
      const eventTo = event.to < event.from ? event.to + 1440 : event.to;
      originalDurationRef.current = eventTo - event.from;
      const rawHeight = scalePosition(eventTo - event.from, hh);
      const MIN_DRAG_PX = Math.max(hh / 3, 24);
      const initialHeight = Math.max(rawHeight, MIN_DRAG_PX);
      const panAbsValue = eventTop - scrollY.value + initialHeight / 2;
      panYAbs.value = panAbsValue;
      startedY.value = panAbsValue;
      eventStartedTop.value = eventTop;
      const resources2 = resourcesRef.current;
      const days2 = daysRef.current;
      const APPOINTMENT_BLOCK_WIDTH2 = apptWidthRef.current;
      const isMultiDay2 = isMultiDayRef.current;
      const EPS = 1e-4;
      const leftmostColumnIndex = Math.max(0, Math.floor((scrollX.value + EPS) / APPOINTMENT_BLOCK_WIDTH2));
      let absoluteColIndex;
      if (!isMultiDay2) {
        absoluteColIndex = findResourceIndexFor(event.resourceId, resources2?.map((r) => r.id));
      } else {
        absoluteColIndex = findDayIndexFor(event.date, days2);
      }
      const screenColumn = absoluteColIndex - leftmostColumnIndex;
      const selectedAppointmentStartedX = TIME_LABEL_WIDTH + APPOINTMENT_BLOCK_WIDTH2 / 2 + APPOINTMENT_BLOCK_WIDTH2 * screenColumn;
      panXAbs.value = selectedAppointmentStartedX;
      startedX.value = selectedAppointmentStartedX;
      lastHapticScrollY.value = scrollY.value;
      eventHeight.value = initialHeight;
      console.log("[CAL:gesture] selecting event for drag", { eventId: event?.id, top: eventTop, height: initialHeight, rawHeight, durationMin: originalDurationRef.current, panY: panAbsValue });
      setSelectedEvent(event);
      requestAnimationFrame(() => { console.log("[CAL:gesture] dragReady=true"); setDragReady(true); });
      triggerHaptic("Medium");
    };
  }, []);
  const internalStableOnLongPress = useCallback((e) => {
    internalOnLongPress.current?.(e);
  }, []);
  const onLayout = useCallback((evt) => {
    setLayout(evt?.nativeEvent?.layout);
  }, []);
  const verticalScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event?.contentOffset?.y;
    }
  });
  const flashListScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!isMultiDay) {
        const offsetX = event?.contentOffset?.x;
        scrollTo(headerScrollViewRef, offsetX, 0, false);
        scrollX.value = offsetX;
      }
    }
  });
  const handleBlockLongPress = useCallback((resourceId, time) => {
    console.log("[CAL:gesture] blockLongPress", { resourceId, time });
    triggerHaptic("Medium");
    const resource = resources.find((r) => r.id === resourceId);
    const m = String(time).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const dateStr = m ? `${m[1]}-${m[2]}-${m[3]}` : format(new Date(time), "yyyy-MM-dd");
    const hh = m ? parseInt(m[4], 10) : 0;
    const mm = m ? parseInt(m[5], 10) : 0;
    const fromMinutes = hh * 60 + mm;
    const toMinutes = fromMinutes + 30;
    const draftEvent = {
      id: -1,
      resourceId,
      date: dateStr,
      from: fromMinutes,
      to: toMinutes,
      title: "+ New Appointment",
      description: "Drag to position, release to schedule",
      meta: { isDraft: true },
    };
    console.log("[CAL:gesture] blockLongPress -> draft drag", { draftEvent });
    if (internalOnLongPress.current) {
      internalOnLongPress.current(draftEvent);
    }
    if (onBlockLongPress)
      onBlockLongPress(resource, new Date(time));
  }, [resources, onBlockLongPress]);
  const handleBlockPress = useCallback((resourceId, time) => {
    console.log("[CAL:gesture] blockPress", { resourceId, time });
    triggerHaptic("Medium");
    const resource = resources.find((r) => r.id === resourceId);
    if (onBlockTap)
      onBlockTap(resource, new Date(time));
  }, [resources, onBlockTap]);
  useEffect(() => {
    const handleOrientationChange = () => {
      if (selectedEvent) {
        setSelectedEvent(null);
        setDragReady(false);
      }
    };
    const subscription = Dimensions.addEventListener("change", handleOrientationChange);
    return () => {
      subscription.remove();
    };
  }, [setSelectedEvent, selectedEvent, setDragReady]);
  useEffect(() => {
    dateRef.current = date;
  }, [date]);
  const renderItem = useCallback(({ item, index }) => {
    const rid = !isMultiDay ? item : activeResourceId ?? resourceIds[0];
    const dayDate = !isMultiDay ? void 0 : item.dayDate;
    return /* @__PURE__ */ React19__default.createElement(View, { key: index, style: { width: APPOINTMENT_BLOCK_WIDTH } }, /* @__PURE__ */ React19__default.createElement(View, { style: styles7.timelineContainer }, /* @__PURE__ */ React19__default.createElement(
      EventGridBlocksSkia,
      {
        hourHeight,
        APPOINTMENT_BLOCK_WIDTH,
        startMinutes: startMinutes ?? 0,
        endMinutes: endMinutes ?? 1440,
        handleBlockPress: (time) => handleBlockPress(rid, combineDateAndTime(dayDate ?? dateRef.current, time)),
        handleBlockLongPress: (time) => handleBlockLongPress(rid, combineDateAndTime(dayDate ?? dateRef.current, time)),
        externalPanGesture: panGesture
      }
    ), /* @__PURE__ */ React19__default.createElement(
      DisabledIntervals_default,
      {
        id: rid,
        date: dayDate,
        APPOINTMENT_BLOCK_WIDTH,
        hourHeight,
        minuteOffset
      }
    ), /* @__PURE__ */ React19__default.createElement(
      DisabledBlocks_default,
      {
        id: rid,
        date: dayDate,
        APPOINTMENT_BLOCK_WIDTH,
        hourHeight,
        minuteOffset,
        onDisabledBlockPress: stableOnDisabledBlockPress
      }
    ), /* @__PURE__ */ React19__default.createElement(
      EventBlocks_default,
      {
        id: rid,
        date: dayDate,
        EVENT_BLOCK_WIDTH: APPOINTMENT_BLOCK_WIDTH,
        hourHeight,
        minuteOffset,
        onPress: stableOnPress,
        onLongPress: internalStableOnLongPress,
        isEventSelected: isEventSelectedStable,
        isEventDisabled: isEventDisabledStable,
        eventRenderer: stableRenderer,
        mode: overLappingLayoutMode
      }
    )));
  }, [
    isMultiDay,
    activeResourceId,
    resourceIds,
    APPOINTMENT_BLOCK_WIDTH,
    hourHeight,
    stableRenderer,
    isEventSelectedStable,
    isEventDisabledStable,
    overLappingLayoutMode,
    stableOnPress,
    internalStableOnLongPress,
    stableOnDisabledBlockPress,
    dateRef
  ]);
  return /* @__PURE__ */ React19__default.createElement(React19__default.Fragment, null, /* @__PURE__ */ React19__default.createElement(StoreFeeder, { resources, store: binding, baseDate: date }), /* @__PURE__ */ React19__default.createElement(View, { style: { flex: 1 } }, !isMultiDay ? /* @__PURE__ */ React19__default.createElement(View, { key: `header-${numberOfColumns}-${width}` }, /* @__PURE__ */ React19__default.createElement(
    Animated2.ScrollView,
    {
      style: { backgroundColor: "white" },
      showsHorizontalScrollIndicator: false,
      contentContainerStyle: {
        overflow: "visible",
        paddingLeft: TIME_LABEL_WIDTH,
        paddingVertical: 15
      },
      horizontal: true,
      scrollEventThrottle: 16,
      decelerationRate: "fast",
      ref: headerScrollViewRef,
      scrollEnabled: false
    },
    /* @__PURE__ */ React19__default.createElement(
      ResourcesComponent,
      {
        date,
        resourceIds,
        APPOINTMENT_BLOCK_WIDTH,
        onResourcePress
      }
    )
  )) : /* @__PURE__ */ React19__default.createElement(
    DaysComponent,
    {
      APPOINTMENT_BLOCK_WIDTH,
      date,
      mode,
      activeResourceId: activeResourceId ?? resourceIds[0],
      onResourcePress,
      multiDayCount
    }
  ), /* @__PURE__ */ React19__default.createElement(GestureDetector, { gesture: composedGesture }, /* @__PURE__ */ React19__default.createElement(
    Animated2.View,
    {
      key: numberOfColumns + "-" + width,
      onLayout,
      style: [{ flex: 1, overflow: "hidden" }, zoomStyle]
    },
    selectedEvent && /* @__PURE__ */ React19__default.createElement(View, { style: {
      position: "absolute",
      top: 0,
      left: TIME_LABEL_WIDTH,
      paddingLeft: TIME_LABEL_WIDTH,
      width: width - TIME_LABEL_WIDTH,
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.1)",
      zIndex: 1
    } }),
    /* @__PURE__ */ React19__default.createElement(
      Animated2.ScrollView,
      {
        scrollEnabled: !selectedEvent,
        onScroll: verticalScrollHandler,
        ref: verticalScrollViewRef,
        scrollEventThrottle: 16,
        snapToInterval: hourHeight,
        decelerationRate: "fast",
        snapToAlignment: "start",
        bounces: false,
        overScrollMode: "never",
        contentInsetAdjustmentBehavior: "never",
        automaticallyAdjustContentInsets: false,
        style: styles7.container,
        contentContainerStyle: { flexDirection: "row", paddingRight: TIME_LABEL_WIDTH }
      },
      /* @__PURE__ */ React19__default.createElement(
        TimeLabels,
        {
          startMinutes,
          endMinutes,
          layout,
          hourHeight,
          totalTimelineWidth: APPOINTMENT_BLOCK_WIDTH * numberOfColumns,
          timezone,
          date,
          ref: verticalScrollViewRef
        }
      ),
      /* @__PURE__ */ React19__default.createElement(
        AnimatedFlashList,
        {
          extraData: numberOfColumns + width + hourHeight + (overLappingLayoutMode === "stacked" ? 1 : 0),
          scrollEnabled: !selectedEvent,
          ref: flashListRef,
          onScroll: flashListScrollHandler,
          removeClippedSubviews: true,
          data: !isMultiDay ? resourceIds : columns,
          horizontal: true,
          renderItem,
          keyExtractor: (item, index) => index + "",
          snapToInterval: APPOINTMENT_BLOCK_WIDTH,
          decelerationRate: "fast",
          snapToAlignment: "start"
        }
      )
    ),
    selectedEvent && dragReady && /* @__PURE__ */ React19__default.createElement(
      DraggableEvent,
      {
        selectedEvent,
        APPOINTMENT_BLOCK_WIDTH,
        hourHeight,
        eventStartedTop,
        eventHeight,
        panXAbs,
        panYAbs,
        slots: props.eventSlots,
        styleOverrides: props.eventStyleOverrides
      }
    )
  ))));
};
var Calendar = ({ theme, ...rest }) => {
  return /* @__PURE__ */ React19__default.createElement(CalendarThemeProvider, { theme }, /* @__PURE__ */ React19__default.createElement(CalendarInner, { ...rest }));
};
var styles7 = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff"
  },
  timelineContainer: {
    borderColor: "#ddd",
    borderRightWidth: 1,
    position: "relative",
    height: "100%"
  }
});
var Calendar_default = Calendar;

export { Calendar_default as Calendar, CalendarBindingProvider, useCalendarBinding };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map