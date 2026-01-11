export const IN_ZONE_IDS = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
] as const;

export const OUT_ZONE_IDS = [
  "O1",
  "O2",
  "O3",
  "O4",
  "O5",
  "O6",
  "O7",
  "O8",
  "O9",
  "O10",
  "O11",
  "O12",
  "O13",
  "O14",
  "O15",
  "O16",
] as const;

export type ZoneId = (typeof IN_ZONE_IDS)[number] | (typeof OUT_ZONE_IDS)[number];

export type ZoneCell = {
  id: ZoneId;
  row: number;
  col: number;
  inZone: boolean;
  kind: "IN" | "OUT";
};

const IN_ZONE_ROWS = ["A", "B", "C"] as const;
const ALL_ZONE_IDS = [...IN_ZONE_IDS, ...OUT_ZONE_IDS] as const;
const ZONE_ID_SET = new Set<string>(ALL_ZONE_IDS);

export function buildZones5x5(): ZoneCell[] {
  const zones: ZoneCell[] = [];
  let outerIndex = 1;

  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const inZone = row >= 1 && row <= 3 && col >= 1 && col <= 3;
      const kind: ZoneCell["kind"] = inZone ? "IN" : "OUT";

      if (inZone) {
        const rowLetter = IN_ZONE_ROWS[row - 1];
        const colNumber = col;
        zones.push({
          id: `${rowLetter}${colNumber}` as ZoneId,
          row,
          col,
          inZone,
          kind,
        });
        continue;
      }

      zones.push({
        id: `O${outerIndex}` as ZoneId,
        row,
        col,
        inZone,
        kind,
      });
      outerIndex += 1;
    }
  }

  return zones;
}

export function isZoneId(value: string | null | undefined): value is ZoneId {
  if (!value) return false;
  return ZONE_ID_SET.has(value);
}

export function isInZone(zoneId: string | null | undefined): boolean {
  if (!zoneId) return false;
  return zoneId.startsWith("A") || zoneId.startsWith("B") || zoneId.startsWith("C");
}

export function computeCounts<T extends Record<string, string | null>>(
  pitches: T[],
  key: keyof T
): Map<ZoneId, number> {
  const counts = new Map<ZoneId, number>();

  for (const zoneId of ALL_ZONE_IDS) {
    counts.set(zoneId, 0);
  }

  for (const pitch of pitches) {
    const raw = pitch[key];
    if (typeof raw !== "string") continue;
    if (!isZoneId(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  return counts;
}

export function computeZoneCounts<T extends Record<string, string | null>>(
  pitches: T[],
  key: keyof T
): Record<ZoneId, number> {
  const counts = {} as Record<ZoneId, number>;

  for (const zoneId of ALL_ZONE_IDS) {
    counts[zoneId] = 0;
  }

  for (const pitch of pitches) {
    const raw = pitch[key];
    if (typeof raw !== "string") continue;
    if (!isZoneId(raw)) continue;
    counts[raw] += 1;
  }

  return counts;
}

export function computeSummaryStats<
  T extends {
    intended_location_zone_id: string | null;
    actual_location_zone_id: string | null;
  },
>(pitches: T[]) {
  const total = pitches.length;
  let inZoneCount = 0;
  let accuracyCount = 0;

  for (const pitch of pitches) {
    if (isInZone(pitch.actual_location_zone_id)) {
      inZoneCount += 1;
    }
    if (
      pitch.actual_location_zone_id &&
      pitch.intended_location_zone_id &&
      pitch.actual_location_zone_id === pitch.intended_location_zone_id
    ) {
      accuracyCount += 1;
    }
  }

  const inZoneRate = total ? inZoneCount / total : 0;
  const accuracyRate = total ? accuracyCount / total : 0;

  return {
    total,
    inZoneCount,
    accuracyCount,
    inZoneRate,
    accuracyRate,
  };
}
