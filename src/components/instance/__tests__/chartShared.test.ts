import { describe, expect, it } from "vitest";
import {
  buildLoadTimeRangeOptions,
  buildPingTimeRangeOptions,
} from "@/components/instance/chartShared";

const historyOptions = [
  { label: "1 小时", value: 1 },
  { label: "4 小时", value: 4 },
  { label: "8 小时", value: 8 },
  { label: "12 小时", value: 12 },
  { label: "1 天", value: 24 },
  { label: "3 天", value: 72 },
  { label: "5 天", value: 120 },
  { label: "7 天", value: 168 },
  { label: "14 天", value: 336 },
  { label: "30 天", value: 720 },
  { label: "60 天", value: 1440 },
  { label: "90 天", value: 2160 },
];

describe("detail chart time ranges", () => {
  it("offers all twelve Ping history ranges when 90 days are retained", () => {
    expect(buildPingTimeRangeOptions(90 * 24)).toEqual(historyOptions);
  });

  it("offers the same load history ranges with an additional realtime option", () => {
    expect(buildLoadTimeRangeOptions(90 * 24)).toEqual([
      { label: "实时", value: 0 },
      ...historyOptions,
    ]);
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "offers all history presets when retention is unknown or invalid (%s)",
    (maxHours) => {
      expect(buildPingTimeRangeOptions(maxHours)).toEqual(historyOptions);
      expect(buildLoadTimeRangeOptions(maxHours)).toEqual([
        { label: "实时", value: 0 },
        ...historyOptions,
      ]);
    },
  );

  it("hides history ranges beyond the server retention", () => {
    const retainedHours = [1, 4, 8, 12, 24, 72, 120, 168, 336, 720];
    expect(buildPingTimeRangeOptions(30 * 24).map((option) => option.value)).toEqual(retainedHours);
    expect(buildLoadTimeRangeOptions(30 * 24).map((option) => option.value)).toEqual([
      0, ...retainedHours,
    ]);
  });

  it("keeps a nonstandard retained range available without exceeding retention", () => {
    const retainedOptions = [
      { label: "1 小时", value: 1 },
      { label: "4 小时", value: 4 },
      { label: "6 小时", value: 6 },
    ];
    expect(buildPingTimeRangeOptions(6.9)).toEqual(retainedOptions);
    expect(buildLoadTimeRangeOptions(6.9)).toEqual([
      { label: "实时", value: 0 },
      ...retainedOptions,
    ]);
  });

  it("does not add history buttons beyond the longest preset", () => {
    expect(buildPingTimeRangeOptions(365 * 24)).toEqual(historyOptions);
    expect(buildLoadTimeRangeOptions(365 * 24)).toEqual([
      { label: "实时", value: 0 },
      ...historyOptions,
    ]);
  });
});
