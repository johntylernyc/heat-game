import type { TrackData } from "../types.js";

/**
 * Italy Track
 *
 * Long straight followed by tight corners. 52 spaces, 4 corners.
 *
 * Layout:
 *   Start/Finish at space 0
 *   Spaces 0-19:  Very long main straight
 *   Corner 1 at 20, speed limit 2 (tight chicane)
 *   Spaces 21-28: Short connector
 *   Corner 2 at 29, speed limit 3 (medium hairpin)
 *   Spaces 30-39: Back straight
 *   Corner 3 at 40, speed limit 2 (tight turn)
 *   Spaces 41-45: Short section
 *   Corner 4 at 46, speed limit 4 (sweeping final)
 *   Spaces 47-51: Run to finish
 */
export const italyTrack: TrackData = {
  id: "italy",
  name: "Italian Grand Prix",
  country: "Italy",
  totalSpaces: 52,
  startFinishLine: 0,
  corners: [
    { id: 1, speedLimit: 2, position: 20 },
    { id: 2, speedLimit: 3, position: 29 },
    { id: 3, speedLimit: 2, position: 40 },
    { id: 4, speedLimit: 4, position: 46 },
  ],
  legendsLines: [
    { cornerId: 1, position: 18 },
    { cornerId: 2, position: 27 },
    { cornerId: 3, position: 38 },
    { cornerId: 4, position: 44 },
  ],
  startingGrid: [
    { gridNumber: 1, spaceIndex: 51, spot: "raceLine" },
    { gridNumber: 2, spaceIndex: 51, spot: "offLine" },
    { gridNumber: 3, spaceIndex: 50, spot: "raceLine" },
    { gridNumber: 4, spaceIndex: 50, spot: "offLine" },
    { gridNumber: 5, spaceIndex: 49, spot: "raceLine" },
    { gridNumber: 6, spaceIndex: 49, spot: "offLine" },
  ],
  defaultConfig: {
    laps: 1,
    startingHeat: 6,
    startingStress: 3,
  },
};
