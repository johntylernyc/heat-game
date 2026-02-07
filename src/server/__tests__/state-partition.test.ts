import { describe, it, expect } from 'vitest';
import { initGame } from '../../engine.js';
import {
  partitionState,
  buildPrivateState,
  buildPublicState,
  computeStandings,
} from '../state-partition.js';

function makeGameState() {
  return initGame({
    playerIds: ['alice', 'bob', 'carol'],
    lapTarget: 2,
    seed: 42,
  });
}

describe('buildPublicState', () => {
  it('exposes card counts but not card contents', () => {
    const state = makeGameState();
    const pub = buildPublicState(state.players[0]);

    expect(pub.id).toBe('alice');
    expect(pub.handCount).toBe(7);
    expect(pub.drawPileCount).toBeGreaterThan(0);
    expect(pub.engineZoneCount).toBe(6);
    expect(typeof pub.gear).toBe('number');
    expect(typeof pub.position).toBe('number');

    // Must NOT have actual card arrays
    expect(pub).not.toHaveProperty('hand');
    expect(pub).not.toHaveProperty('drawPile');
    expect(pub).not.toHaveProperty('discardPile');
    expect(pub).not.toHaveProperty('engineZone');
  });
});

describe('buildPrivateState', () => {
  it('includes full card contents for the player', () => {
    const state = makeGameState();
    const priv = buildPrivateState(state.players[0]);

    expect(priv.id).toBe('alice');
    expect(priv.hand).toHaveLength(7);
    expect(priv.hand[0]).toHaveProperty('type');
    expect(priv.engineZone).toHaveLength(6);
    expect(priv.discardPile).toEqual([]);
    // Draw pile is count-only (player shouldn't see upcoming cards)
    expect(priv.drawPileCount).toBeGreaterThan(0);
    expect(priv).not.toHaveProperty('drawPile');
  });

  it('returns copies, not references to original arrays', () => {
    const state = makeGameState();
    const priv = buildPrivateState(state.players[0]);

    priv.hand.push({ type: 'heat' });
    expect(state.players[0].hand).toHaveLength(7);
  });
});

describe('partitionState', () => {
  it('returns self as private and others as public', () => {
    const state = makeGameState();
    const client = partitionState(state, 0);

    expect(client.playerIndex).toBe(0);
    expect(client.self.id).toBe('alice');
    expect(client.self.hand).toHaveLength(7);
    expect(client.opponents).toHaveLength(2);

    for (const opp of client.opponents) {
      expect(opp).not.toHaveProperty('hand');
      expect(opp).toHaveProperty('handCount');
    }
  });

  it('different players get different views', () => {
    const state = makeGameState();
    const aliceView = partitionState(state, 0);
    const bobView = partitionState(state, 1);

    expect(aliceView.self.id).toBe('alice');
    expect(bobView.self.id).toBe('bob');

    // Alice should see bob as opponent
    const bobAsAliceOpponent = aliceView.opponents.find(o => o.id === 'bob');
    expect(bobAsAliceOpponent).toBeDefined();
    expect(bobAsAliceOpponent).not.toHaveProperty('hand');

    // Bob should see alice as opponent
    const aliceAsBobOpponent = bobView.opponents.find(o => o.id === 'alice');
    expect(aliceAsBobOpponent).toBeDefined();
  });

  it('includes shared game state', () => {
    const state = makeGameState();
    const client = partitionState(state, 1);

    expect(client.round).toBe(1);
    expect(client.phase).toBe('gear-shift');
    expect(client.phaseType).toBe('simultaneous');
    expect(client.lapTarget).toBe(2);
    expect(client.raceStatus).toBe('racing');
    expect(client.turnOrder).toHaveLength(3);
    expect(client.totalSpaces).toBe(100);
  });
});

describe('computeStandings', () => {
  it('ranks players by lap then position', () => {
    const state = makeGameState();
    // Manually set positions/laps for ranking
    state.players[0].position = 10;
    state.players[0].lapCount = 1;
    state.players[1].position = 20;
    state.players[1].lapCount = 0;
    state.players[2].position = 5;
    state.players[2].lapCount = 1;

    const standings = computeStandings(state);

    expect(standings[0].playerId).toBe('alice'); // lap 1, pos 10
    expect(standings[0].rank).toBe(1);
    expect(standings[1].playerId).toBe('carol'); // lap 1, pos 5
    expect(standings[1].rank).toBe(2);
    expect(standings[2].playerId).toBe('bob');   // lap 0, pos 20
    expect(standings[2].rank).toBe(3);
  });
});
