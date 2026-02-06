import type { TrackData } from "../types.js";

/**
 * France Track
 *
 * Balanced circuit with more corners. 50 spaces, 5 corners.
 *
 * Layout:
 *   Start/Finish at space 0
 *   Spaces 0-8:   Short straight
 *   Corner 1 at 9, speed limit 3
 *   Spaces 10-17: Medium section
 *   Corner 2 at 18, speed limit 4
 *   Spaces 19-26: Back section
 *   Corner 3 at 27, speed limit 2 (tight)
 *   Spaces 28-34: Short connector
 *   Corner 4 at 35, speed limit 3
 *   Spaces 36-43: Medium section
 *   Corner 5 at 44, speed limit 5 (fast sweeper)
 *   Spaces 45-49: Run to finish
 */
export const franceTrack: TrackData = {
  id: "france",
  name: "French Grand Prix",
  country: "France",
  totalSpaces: 50,
  startFinishLine: 0,
  corners: [
    { id: 1, speedLimit: 3, position: 9 },
    { id: 2, speedLimit: 4, position: 18 },
    { id: 3, speedLimit: 2, position: 27 },
    { id: 4, speedLimit: 3, position: 35 },
    { id: 5, speedLimit: 5, position: 44 },
  ],
  legendsLines: [
    { cornerId: 1, position: 7 },
    { cornerId: 2, position: 16 },
    { cornerId: 3, position: 25 },
    { cornerId: 4, position: 33 },
    { cornerId: 5, position: 42 },
  ],
  startingGrid: [
    { gridNumber: 1, spaceIndex: 49, spot: "raceLine" },
    { gridNumber: 2, spaceIndex: 49, spot: "offLine" },
    { gridNumber: 3, spaceIndex: 48, spot: "raceLine" },
    { gridNumber: 4, spaceIndex: 48, spot: "offLine" },
    { gridNumber: 5, spaceIndex: 47, spot: "raceLine" },
    { gridNumber: 6, spaceIndex: 47, spot: "offLine" },
  ],
  defaultConfig: {
    laps: 1,
    startingHeat: 6,
    startingStress: 3,
  },
};
