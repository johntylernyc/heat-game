/**
 * Spot position within a space. Each space has two spots:
 * the race-line (preferred, "ahead" in ties) and off-line.
 */
export type SpotPosition = "raceLine" | "offLine";

/**
 * A corner on the track, marked by a corner line with a speed limit.
 * Crossing a corner means moving from a space before the corner line
 * to a space at or after it.
 */
export interface Corner {
  /** Unique corner identifier (1-based) */
  id: number;
  /** Speed limit for this corner (typically 1-7) */
  speedLimit: number;
  /** Space index where the corner line sits */
  position: number;
}

/**
 * A sector is the stretch between two consecutive corners.
 * Used for weather and road condition effects.
 */
export interface Sector {
  /** Unique sector identifier (1-based) */
  id: number;
  /** Corner ID that begins this sector (the corner just passed) */
  startCornerId: number;
  /** Corner ID that ends this sector (the next corner ahead) */
  endCornerId: number;
}

/**
 * Legends line: a marker before a corner used for Legend AI movement rules.
 */
export interface LegendsLine {
  /** The corner this legends line precedes */
  cornerId: number;
  /** Space index where the legends line sits */
  position: number;
}

/**
 * A position on the starting grid.
 */
export interface GridPosition {
  /** Grid position number (1 = pole, higher = further back) */
  gridNumber: number;
  /** Space index for this grid position */
  spaceIndex: number;
  /** Which spot the car occupies */
  spot: SpotPosition;
}

/**
 * Race configuration for a specific track.
 */
export interface RaceConfig {
  /** Number of laps (1-3) */
  laps: number;
  /** Starting Heat cards in hand */
  startingHeat: number;
  /** Starting Stress cards in hand */
  startingStress: number;
}

/**
 * Complete track definition. Tracks are linear sequences of spaces
 * forming a loop. Each space has 2 spots (race-line and off-line).
 */
export interface TrackData {
  /** Unique track identifier */
  id: string;
  /** Display name */
  name: string;
  /** Country (for thematic identification) */
  country: string;
  /** Total number of spaces in the loop (indexed 0 to totalSpaces-1) */
  totalSpaces: number;
  /** Space index of the start/finish line */
  startFinishLine: number;
  /** Corners on this track, ordered by position along the track */
  corners: Corner[];
  /** Legends lines, one per corner */
  legendsLines: LegendsLine[];
  /** Starting grid positions */
  startingGrid: GridPosition[];
  /** Default race configuration */
  defaultConfig: RaceConfig;
}
