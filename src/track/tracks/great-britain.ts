import type { TrackData } from "../types.js";

/**
 * Great Britain Track
 *
 * Rapid sequences of low-speed corners. 46 spaces, 6 corners.
 *
 * Layout:
 *   Start/Finish at space 0
 *   Spaces 0-6:   Short straight
 *   Corner 1 at 7, speed limit 3
 *   Spaces 8-13:  Short section
 *   Corner 2 at 14, speed limit 2 (tight)
 *   Spaces 15-19: Short section
 *   Corner 3 at 20, speed limit 2 (tight)
 *   Spaces 21-26: Medium section
 *   Corner 4 at 27, speed limit 3
 *   Spaces 28-32: Short section
 *   Corner 5 at 33, speed limit 2 (tight)
 *   Spaces 34-38: Short section
 *   Corner 6 at 39, speed limit 4 (medium)
 *   Spaces 40-45: Final straight
 */
export const greatBritainTrack: TrackData = {
  id: "great-britain",
  name: "British Grand Prix",
  country: "Great Britain",
  totalSpaces: 46,
  startFinishLine: 0,
  corners: [
    { id: 1, speedLimit: 3, position: 7 },
    { id: 2, speedLimit: 2, position: 14 },
    { id: 3, speedLimit: 2, position: 20 },
    { id: 4, speedLimit: 3, position: 27 },
    { id: 5, speedLimit: 2, position: 33 },
    { id: 6, speedLimit: 4, position: 39 },
  ],
  legendsLines: [
    { cornerId: 1, position: 5 },
    { cornerId: 2, position: 12 },
    { cornerId: 3, position: 18 },
    { cornerId: 4, position: 25 },
    { cornerId: 5, position: 31 },
    { cornerId: 6, position: 37 },
  ],
  startingGrid: [
    { gridNumber: 1, spaceIndex: 45, spot: "raceLine" },
    { gridNumber: 2, spaceIndex: 45, spot: "offLine" },
    { gridNumber: 3, spaceIndex: 44, spot: "raceLine" },
    { gridNumber: 4, spaceIndex: 44, spot: "offLine" },
    { gridNumber: 5, spaceIndex: 43, spot: "raceLine" },
    { gridNumber: 6, spaceIndex: 43, spot: "offLine" },
  ],
  defaultConfig: {
    laps: 1,
    startingHeat: 6,
    startingStress: 3,
  },
};
