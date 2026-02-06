import type { TrackData } from "../types.js";
import { usaTrack } from "./usa.js";
import { italyTrack } from "./italy.js";
import { franceTrack } from "./france.js";
import { greatBritainTrack } from "./great-britain.js";

export { usaTrack, italyTrack, franceTrack, greatBritainTrack };

/** All base game tracks, keyed by ID. */
export const baseGameTracks: Record<string, TrackData> = {
  [usaTrack.id]: usaTrack,
  [italyTrack.id]: italyTrack,
  [franceTrack.id]: franceTrack,
  [greatBritainTrack.id]: greatBritainTrack,
};
