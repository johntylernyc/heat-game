import type { TrackData } from "../types.js";

/**
 * USA Track
 *
 * Beginner-friendly circuit with long straights and fewer tight turns.
 * 48 spaces total, 3 corners.
 *
 * Layout (approximate):
 *   Start/Finish at space 0
 *   Spaces 0-15:  Long front straight
 *   Corner 1 at 16, speed limit 5 (wide sweeping turn)
 *   Spaces 17-27: Back straight
 *   Corner 2 at 28, speed limit 3 (tight hairpin)
 *   Spaces 29-38: Mid section
 *   Corner 3 at 39, speed limit 4 (medium turn)
 *   Spaces 40-47: Final straight back to start
 */
export const usaTrack: TrackData = {
  id: "usa",
  name: "USA Grand Prix",
  country: "USA",
  totalSpaces: 48,
  startFinishLine: 0,
  corners: [
    { id: 1, speedLimit: 5, position: 16 },
    { id: 2, speedLimit: 3, position: 28 },
    { id: 3, speedLimit: 4, position: 39 },
  ],
  legendsLines: [
    { cornerId: 1, position: 14 },
    { cornerId: 2, position: 26 },
    { cornerId: 3, position: 37 },
  ],
  startingGrid: [
    { gridNumber: 1, spaceIndex: 47, spot: "raceLine" },
    { gridNumber: 2, spaceIndex: 47, spot: "offLine" },
    { gridNumber: 3, spaceIndex: 46, spot: "raceLine" },
    { gridNumber: 4, spaceIndex: 46, spot: "offLine" },
    { gridNumber: 5, spaceIndex: 45, spot: "raceLine" },
    { gridNumber: 6, spaceIndex: 45, spot: "offLine" },
  ],
  defaultConfig: {
    laps: 1,
    startingHeat: 6,
    startingStress: 3,
  },
};
