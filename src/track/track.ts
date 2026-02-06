import type { Corner, LegendsLine, RaceConfig, Sector, SpotPosition, TrackData } from "./types.js";

/**
 * Track wraps a TrackData definition and provides movement,
 * corner-crossing, sector, and lap-counting logic.
 */
export class Track {
  readonly data: TrackData;
  private readonly _sectors: Sector[];

  constructor(data: TrackData) {
    this.data = data;
    this._sectors = deriveSectors(data.corners);
  }

  get id(): string { return this.data.id; }
  get name(): string { return this.data.name; }
  get totalSpaces(): number { return this.data.totalSpaces; }
  get corners(): Corner[] { return this.data.corners; }
  get sectors(): Sector[] { return this._sectors; }
  get legendsLines(): LegendsLine[] { return this.data.legendsLines; }
  get startFinishLine(): number { return this.data.startFinishLine; }
  get defaultConfig(): RaceConfig { return this.data.defaultConfig; }

  /**
   * Advance a position by a number of spaces, wrapping around the loop.
   */
  advance(fromSpace: number, count: number): number {
    return (fromSpace + count) % this.totalSpaces;
  }

  /**
   * Get the ordered list of space indices traversed when moving
   * from `from` to `to` (exclusive of `from`, inclusive of `to`).
   * Handles wrapping around the loop.
   */
  spacesTraversed(from: number, to: number): number[] {
    const spaces: number[] = [];
    let current = from;
    while (current !== to) {
      current = (current + 1) % this.totalSpaces;
      spaces.push(current);
    }
    return spaces;
  }

  /**
   * Check whether moving from `from` to `to` crosses a specific corner line.
   * A corner is crossed when the movement passes through or lands on the
   * corner's position.
   */
  crossesCorner(from: number, to: number, corner: Corner): boolean {
    const traversed = this.spacesTraversed(from, to);
    return traversed.includes(corner.position);
  }

  /**
   * Return all corners crossed when moving from `from` to `to`.
   * Multiple corners can be crossed in a single move.
   */
  cornersCrossed(from: number, to: number): Corner[] {
    const traversed = this.spacesTraversed(from, to);
    return this.data.corners.filter(c => traversed.includes(c.position));
  }

  /**
   * Check whether moving from `from` to `to` crosses the start/finish line.
   */
  crossesFinishLine(from: number, to: number): boolean {
    const traversed = this.spacesTraversed(from, to);
    return traversed.includes(this.data.startFinishLine);
  }

  /**
   * Determine which sector a given space is in.
   * Returns the sector whose range contains the space.
   */
  sectorAt(spaceIndex: number): Sector {
    const corners = this.data.corners;
    for (let i = 0; i < corners.length; i++) {
      const startCorner = corners[i];
      const endCorner = corners[(i + 1) % corners.length];
      if (isInSectorRange(spaceIndex, startCorner.position, endCorner.position, this.totalSpaces)) {
        return this._sectors[i];
      }
    }
    // Fallback: last sector (shouldn't happen with valid track data)
    return this._sectors[this._sectors.length - 1];
  }

  /**
   * Get the grid position for a given grid number.
   */
  gridPosition(gridNumber: number) {
    return this.data.startingGrid.find(g => g.gridNumber === gridNumber);
  }

  /**
   * Serialize the track to a plain JSON-compatible object.
   */
  toJSON(): TrackData {
    return { ...this.data };
  }

  /**
   * Create a Track from a plain JSON object.
   */
  static fromJSON(data: TrackData): Track {
    return new Track(data);
  }
}

/**
 * Derive sectors from the corners list. Sectors are the stretches
 * between consecutive corners (on a loop).
 */
function deriveSectors(corners: Corner[]): Sector[] {
  if (corners.length === 0) return [];
  return corners.map((corner, i) => ({
    id: i + 1,
    startCornerId: corner.id,
    endCornerId: corners[(i + 1) % corners.length].id,
  }));
}

/**
 * Check if a space is in the range between startPos (exclusive) and
 * endPos (inclusive), handling wrap-around.
 */
function isInSectorRange(space: number, startPos: number, endPos: number, total: number): boolean {
  if (startPos < endPos) {
    return space > startPos && space <= endPos;
  }
  // Wraps around
  return space > startPos || space <= endPos;
}
