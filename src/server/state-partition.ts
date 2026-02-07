/**
 * State partitioning: splits authoritative GameState into per-client views.
 *
 * Each client receives:
 *   - Full private state for their own player (hand, discard, engine zone)
 *   - Public state for all opponents (card counts only, no contents)
 *   - Shared game state (round, phase, turn order, etc.)
 */

import type { GamePhase, GameState, PlayerState } from '../types.js';
import { isPlayableCard } from '../cards.js';
import type {
  ClientGameState,
  ClientPlayerInfo,
  PhaseType,
  PublicPlayerState,
  PrivatePlayerState,
  PlayerStanding,
} from './types.js';

/**
 * Simultaneous phases where we collect actions from ALL players before advancing.
 */
const SIMULTANEOUS_PHASES: GamePhase[] = ['gear-shift', 'play-cards', 'discard'];

/**
 * Sequential phases where one player acts at a time (requires player input).
 */
const SEQUENTIAL_INPUT_PHASES: GamePhase[] = ['react', 'slipstream'];

/**
 * Sequential phases that auto-process for each player (no input needed).
 */
const SEQUENTIAL_AUTO_PHASES: GamePhase[] = ['reveal-and-move', 'check-corner'];

export function getPhaseType(phase: GamePhase): PhaseType {
  if (SIMULTANEOUS_PHASES.includes(phase)) return 'simultaneous';
  if (SEQUENTIAL_INPUT_PHASES.includes(phase)) return 'sequential';
  if (SEQUENTIAL_AUTO_PHASES.includes(phase)) return 'sequential-auto';
  return 'automatic'; // adrenaline, replenish, setup, finished
}

/**
 * Build the client-visible game state for a specific player.
 *
 * @param playerInfo - Optional map from player ID to display info. When
 *   provided (from Room.playerInfo), the client state includes names and
 *   car colors for all players.
 */
export function partitionState(
  state: GameState,
  playerIndex: number,
  playerInfo?: Map<string, { displayName: string; carColor: string }>,
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

  const infoRecord: Record<string, ClientPlayerInfo> = {};
  if (playerInfo) {
    for (const [id, info] of playerInfo) {
      infoRecord[id] = { displayName: info.displayName, carColor: info.carColor as ClientPlayerInfo['carColor'] };
    }
  }

  return {
    round: state.round,
    phase: state.phase,
    phaseType: getPhaseType(state.phase),
    activePlayerIndex: state.activePlayerIndex,
    turnOrder: state.turnOrder,
    lapTarget: state.lapTarget,
    raceStatus: state.raceStatus,
    mode: state.mode,
    playerIndex,
    self,
    opponents,
    totalSpaces: state.totalSpaces,
    playerInfo: infoRecord,
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
    hand: player.hand.map(card => ({ ...card, playable: isPlayableCard(card) })),
    drawPileCount: player.drawPile.length,
    discardPile: [...player.discardPile],
    engineZone: [...player.engineZone],
    hasBoosted: player.hasBoosted,
    playedCards: [...player.playedCards],
    lapRounds: [...player.lapRounds],
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
