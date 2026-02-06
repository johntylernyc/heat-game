import { describe, it, expect } from "vitest";
import { Track } from "../track.js";
import { usaTrack } from "../tracks/usa.js";
import { italyTrack } from "../tracks/italy.js";
import { franceTrack } from "../tracks/france.js";
import { greatBritainTrack } from "../tracks/great-britain.js";
import { baseGameTracks } from "../tracks/index.js";
import type { TrackData } from "../types.js";

describe("Track", () => {
  const track = new Track(usaTrack);

  describe("construction", () => {
    it("creates a track from TrackData", () => {
      expect(track.id).toBe("usa");
      expect(track.name).toBe("USA Grand Prix");
      expect(track.totalSpaces).toBe(48);
    });

    it("derives sectors from corners", () => {
      // USA has 3 corners → 3 sectors
      const sectors = track.sectors;
      expect(sectors).toHaveLength(3);
      expect(sectors[0]).toEqual({ id: 1, startCornerId: 1, endCornerId: 2 });
      expect(sectors[1]).toEqual({ id: 2, startCornerId: 2, endCornerId: 3 });
      expect(sectors[2]).toEqual({ id: 3, startCornerId: 3, endCornerId: 1 });
    });
  });

  describe("advance", () => {
    it("moves forward by count", () => {
      expect(track.advance(0, 5)).toBe(5);
      expect(track.advance(10, 3)).toBe(13);
    });

    it("wraps around the loop", () => {
      expect(track.advance(45, 5)).toBe(2); // 45+5=50, 50%48=2
      expect(track.advance(47, 1)).toBe(0);
    });
  });

  describe("spacesTraversed", () => {
    it("returns spaces between from and to (exclusive start, inclusive end)", () => {
      expect(track.spacesTraversed(0, 3)).toEqual([1, 2, 3]);
      expect(track.spacesTraversed(5, 8)).toEqual([6, 7, 8]);
    });

    it("handles wrap-around", () => {
      expect(track.spacesTraversed(46, 2)).toEqual([47, 0, 1, 2]);
    });

    it("returns empty for same position", () => {
      expect(track.spacesTraversed(5, 5)).toEqual([]);
    });
  });

  describe("corner crossing", () => {
    it("detects crossing a single corner", () => {
      // Corner 1 at position 16
      expect(track.crossesCorner(14, 18, track.corners[0])).toBe(true);
      expect(track.crossesCorner(10, 15, track.corners[0])).toBe(false);
    });

    it("detects landing exactly on corner line", () => {
      expect(track.crossesCorner(14, 16, track.corners[0])).toBe(true);
    });

    it("does not count starting on corner line as crossing", () => {
      // Starting at 16, moving to 18 — does NOT traverse 16
      expect(track.crossesCorner(16, 18, track.corners[0])).toBe(false);
    });

    it("returns all corners crossed in a move", () => {
      // Move from space 14 to space 30 crosses corners 1 (pos 16) and 2 (pos 28)
      const crossed = track.cornersCrossed(14, 30);
      expect(crossed).toHaveLength(2);
      expect(crossed[0].id).toBe(1);
      expect(crossed[1].id).toBe(2);
    });

    it("detects multiple corners crossed independently", () => {
      // Move that crosses all 3 corners (nearly full lap)
      const crossed = track.cornersCrossed(1, 45);
      expect(crossed).toHaveLength(3);
    });

    it("handles wrap-around corner crossing", () => {
      // Corner 1 at 16 — move from 46 to 18 wraps around and crosses corner 1
      const crossed = track.cornersCrossed(46, 18);
      expect(crossed.some(c => c.id === 1)).toBe(true);
    });
  });

  describe("finish line crossing", () => {
    it("detects crossing start/finish line", () => {
      // Start/finish at space 0
      expect(track.crossesFinishLine(46, 2)).toBe(true);
    });

    it("does not detect crossing when not passing it", () => {
      expect(track.crossesFinishLine(5, 10)).toBe(false);
    });

    it("detects landing exactly on finish line", () => {
      expect(track.crossesFinishLine(47, 0)).toBe(true);
    });
  });

  describe("sectorAt", () => {
    it("returns sector for space in first sector", () => {
      // Sector 1: after corner 1 (pos 16) to corner 2 (pos 28)
      expect(track.sectorAt(20).id).toBe(1);
    });

    it("returns sector for space in second sector", () => {
      // Sector 2: after corner 2 (pos 28) to corner 3 (pos 39)
      expect(track.sectorAt(35).id).toBe(2);
    });

    it("returns sector for space that wraps around", () => {
      // Sector 3: after corner 3 (pos 39) to corner 1 (pos 16), wrapping around
      expect(track.sectorAt(5).id).toBe(3);
      expect(track.sectorAt(45).id).toBe(3);
    });
  });

  describe("starting grid", () => {
    it("has 6 grid positions", () => {
      expect(track.data.startingGrid).toHaveLength(6);
    });

    it("retrieves grid position by number", () => {
      const pole = track.gridPosition(1);
      expect(pole).toBeDefined();
      expect(pole!.spot).toBe("raceLine");
      expect(pole!.spaceIndex).toBe(47);
    });

    it("pairs drivers two per space", () => {
      const g1 = track.gridPosition(1)!;
      const g2 = track.gridPosition(2)!;
      expect(g1.spaceIndex).toBe(g2.spaceIndex);
      expect(g1.spot).toBe("raceLine");
      expect(g2.spot).toBe("offLine");
    });
  });

  describe("JSON serialization", () => {
    it("serializes to JSON and back", () => {
      const json = track.toJSON();
      const restored = Track.fromJSON(json);
      expect(restored.id).toBe(track.id);
      expect(restored.totalSpaces).toBe(track.totalSpaces);
      expect(restored.corners).toEqual(track.corners);
    });

    it("produces valid JSON string", () => {
      const jsonStr = JSON.stringify(track.toJSON());
      const parsed = JSON.parse(jsonStr) as TrackData;
      expect(parsed.id).toBe("usa");
      expect(parsed.corners).toHaveLength(3);
    });
  });

  describe("legends lines", () => {
    it("has one legends line per corner", () => {
      expect(track.legendsLines).toHaveLength(track.corners.length);
    });

    it("legends lines are positioned before their corners", () => {
      for (const ll of track.legendsLines) {
        const corner = track.corners.find(c => c.id === ll.cornerId)!;
        // Legends line should be before the corner (lower position on non-wrapping tracks)
        expect(ll.position).toBeLessThan(corner.position);
      }
    });
  });
});

describe("all base game tracks", () => {
  it("includes all 4 tracks", () => {
    expect(Object.keys(baseGameTracks)).toHaveLength(4);
    expect(baseGameTracks["usa"]).toBeDefined();
    expect(baseGameTracks["italy"]).toBeDefined();
    expect(baseGameTracks["france"]).toBeDefined();
    expect(baseGameTracks["great-britain"]).toBeDefined();
  });

  const trackEntries = [
    ["usa", usaTrack],
    ["italy", italyTrack],
    ["france", franceTrack],
    ["great-britain", greatBritainTrack],
  ] as const;

  for (const [name, data] of trackEntries) {
    describe(`${name} track`, () => {
      const t = new Track(data);

      it("has valid total spaces", () => {
        expect(t.totalSpaces).toBeGreaterThan(0);
      });

      it("has at least one corner", () => {
        expect(t.corners.length).toBeGreaterThan(0);
      });

      it("all corner positions are within track bounds", () => {
        for (const c of t.corners) {
          expect(c.position).toBeGreaterThanOrEqual(0);
          expect(c.position).toBeLessThan(t.totalSpaces);
        }
      });

      it("all corner speed limits are in valid range (1-7)", () => {
        for (const c of t.corners) {
          expect(c.speedLimit).toBeGreaterThanOrEqual(1);
          expect(c.speedLimit).toBeLessThanOrEqual(7);
        }
      });

      it("has one legends line per corner", () => {
        expect(t.legendsLines).toHaveLength(t.corners.length);
        for (const ll of t.legendsLines) {
          expect(t.corners.some(c => c.id === ll.cornerId)).toBe(true);
        }
      });

      it("has valid starting grid", () => {
        expect(t.data.startingGrid.length).toBeGreaterThanOrEqual(6);
        for (const g of t.data.startingGrid) {
          expect(g.spaceIndex).toBeGreaterThanOrEqual(0);
          expect(g.spaceIndex).toBeLessThan(t.totalSpaces);
          expect(["raceLine", "offLine"]).toContain(g.spot);
        }
      });

      it("start/finish line is within bounds", () => {
        expect(t.startFinishLine).toBeGreaterThanOrEqual(0);
        expect(t.startFinishLine).toBeLessThan(t.totalSpaces);
      });

      it("derives correct number of sectors", () => {
        expect(t.sectors).toHaveLength(t.corners.length);
      });

      it("default config has valid values", () => {
        expect(t.defaultConfig.laps).toBeGreaterThanOrEqual(1);
        expect(t.defaultConfig.laps).toBeLessThanOrEqual(3);
        expect(t.defaultConfig.startingHeat).toBeGreaterThan(0);
        expect(t.defaultConfig.startingStress).toBeGreaterThanOrEqual(0);
      });

      it("serializes to JSON and back", () => {
        const restored = Track.fromJSON(t.toJSON());
        expect(restored.id).toBe(t.id);
        expect(restored.totalSpaces).toBe(t.totalSpaces);
        expect(restored.corners).toEqual(t.corners);
      });
    });
  }
});
