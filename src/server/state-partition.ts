/**
 * State partitioning: splits authoritative GameState into per-client views.
 *
 * Each client receives:
 *   - Full private state for their own player (hand, discard, engine zone)
 *   - Public state for all opponents (card counts only, no contents)
 *   - Shared game state (round, phase, turn order, etc.)
 */

import type { GameState, PlayerState } from '../types.js';
import type {
  ClientGameState,
  PublicPlayerState,
  PrivatePlayerState,
  PlayerStanding,
} from './types.js';

/**
 * Build the client-visible game state for a specific player.
 */
export function partitionState(
  state: GameState,
  playerIndex: number,
): ClientGameState {
  if (playerIndex < 0 || playerIndex >= state.players.length) {
    throw new Error(`Invalid playerIndex: ${playerIndex}`);
  }

  const self = buildPrivateState(state.players[playerIndex]);

  const opponents: PublicPlayerState[] = [];
  for (let i = 0; i < state.players.length; i++) {
    if (i !== playerIndex) {
      opponents.push(buildPublicState(state.players[i]));
    }
  }

  return {
    round: state.round,
    phase: state.phase,
    activePlayerIndex: state.activePlayerIndex,
    turnOrder: state.turnOrder,
    lapTarget: state.lapTarget,
    raceStatus: state.raceStatus,
    playerIndex,
    self,
    opponents,
    totalSpaces: state.totalSpaces,
  };
}

/**
 * Build the private view of a player's own state.
 * Includes hand contents, discard pile, engine zone — full visibility.
 * Draw pile is count-only (player shouldn't see upcoming cards).
 */
export function buildPrivateState(player: PlayerState): PrivatePlayerState {
  return {
    id: player.id,
    gear: player.gear,
    position: player.position,
    lapCount: player.lapCount,
    speed: player.speed,
    hand: [...player.hand],
    drawPileCount: player.drawPile.length,
    discardPile: [...player.discardPile],
    engineZone: [...player.engineZone],
    hasBoosted: player.hasBoosted,
    playedCards: [...player.playedCards],
  };
}

/**
 * Build the public view of an opponent's state.
 * No card contents — only counts.
 */
export function buildPublicState(player: PlayerState): PublicPlayerState {
  return {
    id: player.id,
    gear: player.gear,
    position: player.position,
    lapCount: player.lapCount,
    speed: player.speed,
    handCount: player.hand.length,
    drawPileCount: player.drawPile.length,
    discardPileCount: player.discardPile.length,
    engineZoneCount: player.engineZone.length,
    hasBoosted: player.hasBoosted,
    playedCardCount: player.playedCards.length,
  };
}

/**
 * Compute final standings from game state.
 * Ranked by lap count (desc), then position (desc).
 */
export function computeStandings(state: GameState): PlayerStanding[] {
  const entries = state.players.map((p, _i) => ({
    playerId: p.id,
    position: p.position,
    lapCount: p.lapCount,
  }));

  entries.sort((a, b) => {
    if (b.lapCount !== a.lapCount) return b.lapCount - a.lapCount;
    return b.position - a.position;
  });

  return entries.map((e, i) => ({ ...e, rank: i + 1 }));
}
