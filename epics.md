# Epic: Core Game State & Rules Engine

- type: epic
- priority: 1
- labels: epic, phase-1, backend

## Description

Build the foundational game state machine and rules engine for Heat: Pedal to the Metal. This is the heart of the game — a deterministic state engine that manages the full lifecycle of a race from setup through finish.

The engine must model all core game concepts: players, cars, gear positions, decks (draw pile, hand, discard pile, engine zone), the track, lap progress, and turn order. It must enforce all rules and produce valid state transitions for every player action.

**Key domain concepts to model:**

- **Player state**: gear (1st–4th), hand (7 cards), draw pile, discard pile, engine (heat cards), car position on track, lap count
- **Game state**: current round, current phase within round, turn order, race completion status
- **Card types**: Speed cards (values 1–4), Heat cards, Stress cards, Upgrade cards (Speed-0, Speed-5, starting Heat)
- **Track state**: car positions, corner zones, finish line, sector boundaries

**Starting deck composition (per player):**
- 12 Speed cards in player color (mix of values 1, 2, 3, 4)
- 3 Starting upgrade cards (1x Speed-0, 1x Speed-5, 1x Heat card)
- 6 Heat cards placed in the Engine zone (not in deck)
- Stress cards shuffled into draw deck (count varies by track)

**Gear system rules:**
- 1st gear: play 1 card, Cooldown 3 available in React phase
- 2nd gear: play 2 cards, Cooldown 1 available in React phase
- 3rd gear: play 3 cards, no cooldown or boost symbols
- 4th gear: play 4 cards, Boost symbol available in React phase
- Free shift: 1 gear up or down per turn at no cost
- Expensive shift: 2 gears up or down costs 1 Heat (from Engine to discard)

## Acceptance Criteria

- [ ] Game state model represents all player state: gear, hand, draw pile, discard pile, engine zone, car position, lap count
- [ ] Game state model represents all game-level state: round number, active phase, turn order, lap target, race status
- [ ] Card types are defined: Speed (with value), Heat, Stress, Upgrade (with subtype)
- [ ] Starting deck composition is correctly initialized per the rules above
- [ ] Gear shifting rules enforced: free ±1, paid ±2 (costs 1 Heat), cannot go below 1st or above 4th
- [ ] Number of cards played per turn matches current gear (1st=1, 2nd=2, 3rd=3, 4th=4)
- [ ] Hand replenishment draws to 7 cards at end of turn
- [ ] When draw pile is empty, discard pile is shuffled to form new draw pile
- [ ] State transitions are deterministic given the same inputs
- [ ] Engine is fully unit-testable with no UI dependencies

---

# Epic: Turn Flow & Phase Management

- type: epic
- priority: 1
- labels: epic, phase-1, backend

## Description

Implement the 9-phase turn structure that drives each round of racing. All players act simultaneously in some phases and sequentially in others. The phase manager must orchestrate this correctly and handle all timing/ordering concerns.

**The 9 phases of each round (in order):**

1. **Shift Gears** (simultaneous) — Each player secretly selects their gear. Free shift ±1, or pay 1 Heat to shift ±2. Cannot shift below 1st or above 4th.

2. **Play Cards** (simultaneous) — Each player selects cards from hand equal to their gear number and places them face-down. Stress cards CAN be selected (they resolve on reveal). Heat cards CANNOT be played voluntarily.

3. **Reveal & Move** (sequential, in turn order — leader moves first) — Players reveal played cards. Sum the speed values. Stress cards are resolved: flip cards from draw pile until a Speed card appears, use that value, discard the rest. Move car forward that many spaces on the track. If a space is occupied, car goes to the next available space ahead.

4. **Adrenaline** (conditional) — The last-place player (or last 2 players in 5+ player games) gains +1 speed AND +1 cooldown for this turn. Legends count for position but don't benefit from adrenaline.

5. **React** (sequential, in turn order) — Players activate available symbols in any order:
   - Cooldown (from gear): Move Heat cards from hand back to Engine (1st gear=3, 2nd gear=1)
   - Boost (from gear, 4th gear only): Pay 1 Heat from Engine to discard, flip cards from deck until a Speed card appears, move car that many additional spaces. Adds to speed value for corner checks.
   - Upgrade card symbols (if applicable)

6. **Slipstream** (sequential, in turn order) — If your car is directly behind or beside another car (within 2 spaces), you MAY move forward 2 spaces. Slipstream does NOT increase speed value for corner checks.

7. **Check Corner** (sequential) — If a player crossed a corner line this turn, compare total speed (cards + boost, NOT slipstream) to the corner's speed limit. If speed > limit, player must pay Heat from Engine equal to the difference. If they cannot pay enough Heat → Spinout.

8. **Discard** (simultaneous) — Players may optionally discard any cards from hand.

9. **Replenish Hand** (simultaneous) — Draw cards until hand has 7 cards. If draw pile is empty, shuffle discard to form new draw pile.

**Cluttered Hand rule:** If a player has so many Heat cards in hand they can't play enough non-Heat cards for their gear, they reveal their hand, play all playable cards plus Heat cards to fill remaining slots. The car does NOT move. Gear resets to 1st. Skip to Replenish Hand phase.

**Spinout rules:** When a player cannot pay the Heat penalty for exceeding a corner speed limit:
- Car moves back to the first available space BEFORE the corner
- Player receives Stress cards: 1 stress in 1st/2nd gear, 2 stress in 3rd/4th gear
- Gear resets to 1st

## Acceptance Criteria

- [ ] All 9 phases execute in the correct order each round
- [ ] Simultaneous phases (1, 2, 8, 9) collect all player inputs before proceeding
- [ ] Sequential phases (3, 5, 6, 7) process players in correct turn order (leader first)
- [ ] Turn order is determined by car position on track (furthest ahead goes first, ties broken by lane/stack position)
- [ ] Gear shifting in Phase 1 enforces free ±1 and paid ±2 rules
- [ ] Card play in Phase 2 requires exactly N cards where N = gear level
- [ ] Stress card resolution flips from draw pile until a Speed card appears
- [ ] Adrenaline correctly identifies last-place player(s) and grants bonuses
- [ ] Cooldown moves Heat from hand to Engine (not discard)
- [ ] Boost flips from deck until Speed card, adds to movement AND speed value
- [ ] Slipstream grants +2 movement but does NOT affect speed value for corner checks
- [ ] Corner check compares speed (cards + boost) against corner limit
- [ ] Heat penalty for corners is paid from Engine to discard
- [ ] Spinout triggers correctly when Heat payment is insufficient
- [ ] Spinout places car before corner, awards stress cards, resets gear to 1st
- [ ] Cluttered Hand detected and handled: car doesn't move, gear reset, skip to replenish
- [ ] Hand replenishes to 7; deck reshuffles from discard when empty
- [ ] Round counter increments after all 9 phases complete

---

# Epic: Track System & Data Model

- type: epic
- priority: 1
- labels: epic, phase-1, backend

## Description

Design and implement the track data model that represents racing circuits. Tracks are linear sequences of spaces forming a loop, with corners (each having a speed limit), sectors, legends lines, and a start/finish line.

**Track elements:**
- **Spaces**: The fundamental unit of movement. Cars occupy spaces. Each space has a position index in the track sequence.
- **Lanes**: Some spaces have multiple lanes (typically 2-3) allowing cars to be side-by-side. Cars can only slipstream if they're in adjacent spaces or lanes.
- **Corners**: Marked by a corner line crossing the track. Each corner has a speed limit (typically 1–7). A car "crosses" a corner when its movement takes it past the corner line.
- **Sectors**: The stretch of track between two consecutive corners. Used for weather/road condition placement.
- **Legends Line**: A marker before each corner (used by Legend AI system). When a Legend car is between the legends line and the corner, special movement rules apply.
- **Start/Finish Line**: Marks lap completion. Cars start behind this line on a starting grid.
- **Starting Grid**: Positions where cars line up at race start. Grid order may be random or determined by qualifying.

**Base game tracks (4 tracks on 2 double-sided boards):**
- USA — Characterized by long straights and tight turns
- Italy — Long straight with tight corners
- France — More balanced layout
- Great Britain — Multiple close low-speed corners

Each track should be stored as structured data (JSON or similar) containing the ordered list of spaces, corner positions with speed limits, sector boundaries, legends line positions, and starting grid positions.

**Race configuration per track:**
- Number of laps (varies by track, typically 1-3)
- Starting Heat cards (may vary by track)
- Starting Stress cards (may vary by track)

## Acceptance Criteria

- [ ] Track data model defines: ordered spaces, lanes per space, corner positions with speed limits, sector boundaries, legends lines, start/finish line, starting grid
- [ ] At least one complete track (USA recommended as starter) is defined with all data
- [ ] All 4 base game tracks are representable in the data model
- [ ] Car movement correctly traverses spaces in order, wrapping at lap boundary
- [ ] Corner crossing detection works: a car that moves from before a corner line to after it has "crossed" that corner
- [ ] Multiple corners can be crossed in a single turn (each checked independently)
- [ ] Lane system allows multiple cars on the same track position
- [ ] Starting grid assigns cars to initial positions
- [ ] Lap counting correctly increments when a car crosses the start/finish line
- [ ] Race end triggers when a car crosses the finish line after completing the required number of laps
- [ ] Track data is serializable (JSON) for storage and network transmission
- [ ] Track data model supports expansion tracks (Heavy Rain, Tunnel Vision) without structural changes

---

# Epic: Race Lifecycle Management

- type: epic
- priority: 1
- labels: epic, phase-1, backend

## Description

Manage the full lifecycle of a race from lobby setup through final standings. This encompasses pre-race setup, the racing loop, race-end detection, and final scoring.

**Pre-race setup sequence:**
1. Select track
2. Select number of laps (1–3, track-dependent defaults)
3. Determine starting grid order (random for first race, reverse standings in championship)
4. Each player receives their starting deck and sets up their player mat:
   - Shuffle 12 Speed cards + 3 Starting upgrades + Stress cards (track-dependent) into draw pile
   - Place 6 Heat cards in Engine zone
   - Draw 7 cards for starting hand
   - Set gear to 1st
5. Place cars on starting grid

**Racing loop:**
- Execute rounds (each round = 9 phases as defined in Turn Flow epic)
- Continue rounds until race-end condition is met

**Race-end condition:**
- When the FIRST car crosses the finish line after completing the required laps, that round becomes the FINAL round
- All remaining players complete that round
- After the final round, the car furthest ahead wins
- Tiebreaker: the car that is physically furthest ahead on the track

**Final standings:**
- Rank all players by position on track after final round
- Record finishing order for championship scoring (if applicable)

## Acceptance Criteria

- [ ] Track selection and lap count configuration work correctly
- [ ] Starting grid positions are assigned (random or championship-ordered)
- [ ] Player decks are correctly assembled and shuffled per track configuration
- [ ] Engine zone initialized with 6 Heat cards per player
- [ ] Starting hands of 7 cards drawn correctly
- [ ] All gears start at 1st
- [ ] Racing loop executes rounds until race-end triggered
- [ ] Race-end triggers when first car crosses finish line on final lap
- [ ] Final round completes for ALL players after race-end trigger
- [ ] Winner is the car furthest ahead after final round
- [ ] Final standings rank all players by track position
- [ ] Race state is recoverable (can serialize/deserialize mid-race for reconnection)

---

# Epic: Multiplayer Infrastructure

- type: epic
- priority: 1
- labels: epic, phase-2, backend, infrastructure

## Description

Build the real-time multiplayer infrastructure for the web-based game. This must support 1–6 players in a single race with real-time state synchronization, handling the mix of simultaneous and sequential phases.

**Architecture requirements:**
- WebSocket-based real-time communication between server and clients
- Authoritative server: the server owns game state and validates all actions. Clients send intents, server validates and broadcasts results. No client-side game logic that could be exploited.
- Game rooms: players join a room for a specific race. Room manages player connections, game state, and message routing.
- Reconnection support: if a player disconnects, they can rejoin the same game and receive current state.

**Simultaneous phase handling:**
- During simultaneous phases (Shift Gears, Play Cards, Discard, Replenish), the server waits for ALL connected players to submit their choices before advancing.
- Timer-based auto-advance: if a player doesn't act within a configurable timeout (e.g., 60 seconds), auto-select a default action (e.g., stay in current gear, play random valid cards).
- Hidden information: during simultaneous phases, player choices are hidden until all have submitted (gear choice, card selection).

**Sequential phase handling:**
- During sequential phases (Reveal & Move, React, Slipstream, Check Corner), the server processes players one at a time in turn order.
- Active player indicator: clients know whose turn it is.
- Some sequential phases have player choices (React: which symbols to activate and in what order; Slipstream: opt in or out).

**State synchronization:**
- After each phase transition, broadcast updated game state to all clients.
- Each client receives: full public state + their own private state (hand, draw pile count, engine count).
- Other players' private information (exact hand contents) is NOT shared.

## Acceptance Criteria

- [ ] WebSocket server accepts connections and manages game rooms
- [ ] Players can create a room (selecting track, lap count, player count)
- [ ] Players can join an existing room by room code/ID
- [ ] Game starts when required number of players have joined and host triggers start
- [ ] Simultaneous phases wait for all players before advancing
- [ ] Turn timer auto-advances if player doesn't act within timeout
- [ ] Hidden information is enforced: other players' hands/choices not visible until reveal
- [ ] Sequential phases correctly indicate active player and wait for their input
- [ ] State updates broadcast to all clients after each phase
- [ ] Each client receives correct public + private state partition
- [ ] Disconnected player can reconnect and receive current game state
- [ ] Disconnected player is auto-played (default actions) during their absence
- [ ] Room is cleaned up after game ends or all players disconnect
- [ ] Server validates all player actions (cannot play cards not in hand, cannot shift illegally, etc.)
- [ ] Latency handling: actions are timestamped and processed in order

---

# Epic: Game Lobby & Session Management

- type: epic
- priority: 1
- labels: epic, phase-2, frontend, backend

## Description

Build the pre-game experience where players create, find, and join games. This is the entry point to the application.

**Lobby features:**
- **Create Game**: Host selects track, number of laps, and max players (1–6). Generates a shareable room code.
- **Join Game**: Enter a room code to join an existing game. See lobby with other waiting players.
- **Waiting Room**: Shows connected players, their chosen colors/cars, and ready status. Host can start the game when at least 1 player (for solo + legends) is ready.
- **Player Identity**: Players pick a display name and car color (6 colors available in base game). No authentication required for MVP — just session-based identity.

**Session management:**
- Browser sessions persist via a session token (cookie or localStorage)
- Returning to the site while a game is in progress should offer to reconnect
- Game rooms have a TTL — abandoned rooms are cleaned up after inactivity

## Acceptance Criteria

- [ ] "Create Game" flow: select track, laps, max players → get room code
- [ ] "Join Game" flow: enter room code → join waiting room
- [ ] Waiting room shows all connected players with name and car color
- [ ] Players can select their car color (no duplicates within a game)
- [ ] Host can start game when minimum players are ready
- [ ] Room code is short, human-friendly (e.g., 4-6 alphanumeric characters)
- [ ] Session token persists across page refreshes
- [ ] Reconnection offer shown if player has an active game
- [ ] Abandoned rooms are cleaned up after configurable TTL
- [ ] UI is responsive and works on desktop and tablet browsers

---

# Epic: Game Board UI — Track Rendering & Car Movement

- type: epic
- priority: 1
- labels: epic, phase-3, frontend

## Description

Build the visual representation of the race track and car movement. This is the primary game view — players watch cars race around a track in real time.

**Track rendering:**
- The track is a circuit rendered as a top-down or isometric view
- Spaces are visually distinct and numbered (for debugging; numbers can be hidden in production)
- Corners are visually marked with their speed limit displayed
- Sectors are visually distinguishable (alternating shading or border markers)
- Legends lines are shown (subtle marker before each corner)
- Start/finish line is prominent
- Starting grid positions are marked

**Car rendering:**
- Each player's car is rendered in their chosen color
- Cars occupy specific spaces and lanes on the track
- When multiple cars occupy adjacent spaces, they are visually stacked or offset so all are visible
- Current position is clearly identifiable at a glance

**Movement animation:**
- When a car moves, animate it smoothly along the track path
- Movement speed should be fast enough to not bore players but slow enough to follow
- Spinout animation: car visually moves back to the space before the corner
- Slipstream animation: subtle visual indicator when a car slipstreams

**Information overlay:**
- Hovering/clicking a corner shows its speed limit
- Current lap counter per car
- Turn order indicator (who's moving next in sequential phases)
- Race position standings (1st, 2nd, 3rd, etc.) displayed as a sidebar or overlay

## Acceptance Criteria

- [ ] Track renders as a complete circuit with all spaces visible
- [ ] Corners display speed limit numbers clearly
- [ ] Start/finish line and starting grid are visually distinct
- [ ] Cars render in correct player colors at correct positions
- [ ] Multiple cars in adjacent spaces are visually distinguishable (no perfect overlap)
- [ ] Car movement is animated smoothly along the track path
- [ ] Spinout animation shows car moving backward
- [ ] Lap counter displayed per car
- [ ] Race standings sidebar shows current positions (1st through last)
- [ ] Turn order indicator shows whose turn it is during sequential phases
- [ ] Track zooming and panning work (for larger tracks)
- [ ] Responsive layout works on desktop (1024px+) and tablet (768px+)
- [ ] Performance: renders smoothly at 30+ FPS with 6 cars on track

---

# Epic: Player Dashboard UI — Hand, Gear & Engine Management

- type: epic
- priority: 1
- labels: epic, phase-3, frontend

## Description

Build the player's personal dashboard — the interface they use to manage their hand, select gears, play cards, and monitor their engine state. This is the primary interaction surface.

**Hand display:**
- Show all cards in the player's hand (typically 7)
- Cards are visually distinct by type: Speed cards show their value prominently, Heat cards are visually "dead" (red/grey), Stress cards are marked distinctly
- Cards can be selected (clicked/tapped) to mark them for play
- Selected cards move to a "play area" or are visually highlighted
- During simultaneous play phases, show a "Confirm" button that locks in the selection

**Gear selector:**
- Visual gear indicator showing current gear (1st–4th)
- Shift up/down controls with clear indication of cost (free vs. 1 Heat)
- Gear selector is active only during Phase 1 (Shift Gears)
- After selecting gear, show how many cards must be played

**Engine zone display:**
- Show count of Heat cards currently in Engine
- Visual indicator of Heat cards in hand (these are "stuck" cards reducing effective hand size)
- During Cooldown: interface to select which Heat cards to move from hand back to Engine

**React phase controls:**
- Cooldown button (if available in current gear): select Heat cards from hand to return to Engine
- Boost button (if available in current gear): confirm spending 1 Heat from Engine
- Slipstream button: opt in or out when eligible
- Clear indication of what symbols are available based on current gear

**Phase-aware UI:**
- Dashboard adapts to current game phase
- Only relevant controls are active during each phase
- Clear indication of what the player needs to do ("Select your gear", "Play 3 cards", "Choose cooldown", etc.)
- Waiting indicator when it's not the player's turn or waiting for other players

**Information display:**
- Draw pile card count
- Discard pile card count (with ability to view contents)
- Current speed this turn
- Gear indicator

## Acceptance Criteria

- [ ] Hand displays all cards with clear visual distinction between Speed, Heat, Stress, and Upgrade cards
- [ ] Speed cards prominently show their numeric value
- [ ] Cards can be selected/deselected by clicking
- [ ] Play area shows selected cards and enforces correct count for current gear
- [ ] Confirm button submits card selection during simultaneous phases
- [ ] Gear selector shows current gear and allows shifting within rules
- [ ] Gear shift cost (free vs. 1 Heat) is clearly displayed
- [ ] Engine zone shows Heat card count
- [ ] Heat cards in hand are visually marked as unplayable
- [ ] Cooldown interface allows selecting Heat cards from hand to return to Engine
- [ ] Boost interface shows cost and triggers deck flip animation
- [ ] Slipstream prompt appears when eligible with opt-in/out choice
- [ ] Phase indicator clearly shows current phase and required action
- [ ] Inactive controls are disabled/hidden during irrelevant phases
- [ ] Waiting state shown when it's another player's turn
- [ ] Draw pile and discard pile counts are visible
- [ ] Current turn speed total is displayed during movement phase

---

# Epic: Legends (AI) System

- type: epic
- priority: 2
- labels: epic, phase-4, backend

## Description

Implement the Legends system — AI-controlled cars that fill out the race field. This enables solo play and adds opponents to games with fewer than 6 human players.

**How Legends work:**
- Each Legend is an automated car that uses a shared Legend deck (10 cards) instead of a personal deck
- Every round, ONE Legend card is flipped from the shared deck. ALL Legend cars use the SAME card each round.
- Each Legend card has multiple values: a speed value per "helmet" and a diamond modifier per helmet
- Legends do not: use heat, cooldown, boost, slipstream, spin out, or have cluttered hands

**Legend movement rules depend on position relative to corners:**

**Case 1 — Car is BEHIND the Legends Line (on a straight):**
- Car moves forward the number of spaces shown on the Legend card for that helmet's speed value
- If this movement would carry the car PAST a corner, the car instead stops at a position before the corner equal to the diamond value on the card

**Case 2 — Car is BETWEEN the Legends Line and the corner (approaching):**
- Car moves forward = corner speed limit + diamond modifier
- This means Legends always cross corners at approximately the speed limit (±1 or 2)

**Legend card deck:**
- 10 cards total, shuffled at race start
- When all 10 are used, reshuffle
- Each card shows values for multiple difficulty levels / helmet colors

**Difficulty levels:**
- Easy, Medium, Hard (possibly more) — controlled by which helmet row on the card is used
- Higher difficulty = higher speed values and better corner modifiers

## Acceptance Criteria

- [ ] Legend deck of 10 cards is defined with speed values and diamond modifiers per helmet/difficulty
- [ ] One Legend card flipped per round, shared by all Legend cars
- [ ] Legend movement on straights (behind legends line): move forward by card speed value
- [ ] Legend movement near corners (between legends line and corner): move = corner speed limit + diamond modifier
- [ ] Legends stop before a corner if straight movement would carry them past it (respecting diamond value)
- [ ] Legends never use heat, cooldown, boost, or slipstream
- [ ] Legends cannot spin out or have cluttered hands
- [ ] Legend cars count for other players' slipstream and adrenaline calculations
- [ ] Legend difficulty is selectable at game setup (Easy/Medium/Hard)
- [ ] Legend deck reshuffles after all 10 cards used
- [ ] 1–5 Legend cars can be added to any game
- [ ] Legends are included in turn order and final standings

---

# Epic: Garage Module — Upgrade Card Drafting

- type: epic
- priority: 2
- labels: epic, phase-4, backend, frontend

## Description

Implement the Garage Module, an advanced variant where players draft upgrade cards instead of using the 3 default starting upgrades. This adds strategic depth to deck building.

**Drafting procedure:**
1. After placing cars on the starting grid, deal face-up upgrade cards = number of players + 3
2. Draft proceeds in 3 rounds with a snake draft order based on grid position:
   - Round 1: Pick order from LAST grid position to FIRST (back of grid picks first)
   - Round 2: Pick order from FIRST grid position to LAST (front picks first)
   - Round 3: Same as Round 1 (back picks first)
3. Each player drafts 1 card per round (3 total)
4. Drafted cards replace the 3 standard starting upgrades in the player's deck

**11 upgrade card types (each comes in multiple value variants):**
1. **4 Wheel Drive** — Stress card alternative with speed and cooldown bonuses
2. **Brakes** — Variable speed selection upon reveal (e.g., choose 1 or 5)
3. **Cooling System** — Cooldown effect
4. **Body** — Speed + discard Stress cards
5. **R.P.M.** — Increases slipstream distance
6. **Tires** — Modifies speed limit checks or provides cooldown
7. **Wings** — Speed limit boost requiring heat payment
8. **Turbocharger** — Converts heat into substantial speed (e.g., 8 speed, 1 heat cost, Scrap 6)
9. **Fuel** — Recovers cards from discard pile (Salvage)
10. **Gas Pedal** — Post-reveal speed boost (Direct Play during React)
11. **Suspension** — Card recycling effect (Refresh: return to deck top instead of discard)

**Upgrade card keywords:**
- **Scrap N**: Discard N cards from top of draw pile
- **Super Cool N**: Move up to N Heat cards from discard pile back to Engine
- **Salvage N**: Draw N cards from discard pile into draw pile
- **Direct Play**: Can be played from hand during React step
- **Refresh**: After use, returns to top of draw pile instead of discard

## Acceptance Criteria

- [ ] Upgrade card data model supports all 11 card types with their effects and variants
- [ ] Draft UI shows available cards face-up for selection
- [ ] Snake draft order is correctly calculated based on grid position
- [ ] 3 rounds of drafting execute in correct order (back-first, front-first, back-first)
- [ ] Correct number of cards dealt per round (players + 3)
- [ ] Drafted cards replace the 3 standard starting upgrades in each player's deck
- [ ] Undrafted cards are removed from play
- [ ] All upgrade card effects are implemented in the rules engine: Scrap, Super Cool, Salvage, Direct Play, Refresh
- [ ] Brakes card allows choosing between two speed values on reveal
- [ ] Gas Pedal Direct Play works during React step
- [ ] R.P.M. modifies slipstream distance correctly
- [ ] Upgrade cards work correctly with all other game systems (corner checks, movement, etc.)

---

# Epic: Weather & Road Conditions Module

- type: epic
- priority: 3
- labels: epic, phase-5, backend, frontend

## Description

Implement the Weather and Road Conditions module, an advanced variant that adds environmental effects that change each race, modifying corner speed limits, heat management, and sector conditions.

**Weather system:**
- 6 weather tokens, shuffled at race start
- 1 token drawn and placed on the billboard space
- Weather affects ALL players for the entire race
- Weather tokens modify starting heat/stress card counts and may add ongoing effects
- Examples: additional cooldown each round, reduced starting heat, etc.

**Road condition system:**
- 12 road condition tokens, shuffled at race start
- 1 token drawn per corner on the track
- Each token modifies either the corner it's placed at OR the sector leading away from it (indicated by an arrow on the token)
- Corner modifications: change speed limit (increase or decrease)
- Sector modifications: affect all cars passing through that sector (e.g., extra heat cost, no slipstream, etc.)

**Integration with existing systems:**
- Weather tokens are revealed AFTER players have selected upgrades (in Garage Module)
- Road condition tokens are placed on the track before the race begins
- Corner speed limit modifications from road conditions affect ALL corner checks
- Sector effects apply to ALL cars in that sector

## Acceptance Criteria

- [ ] 6 weather tokens defined with their effects
- [ ] 12 road condition tokens defined with corner and sector modifications
- [ ] Weather token drawn randomly at race start and displayed to all players
- [ ] Road condition tokens placed at each corner before race begins
- [ ] Weather effects correctly modify starting deck composition (extra heat/stress)
- [ ] Weather ongoing effects apply each round (e.g., extra cooldown)
- [ ] Road condition corner modifiers change speed limits for affected corners
- [ ] Road condition sector modifiers apply to cars traversing those sectors
- [ ] Modified speed limits are clearly displayed on the track UI
- [ ] Sector effects are visually indicated on the track
- [ ] Weather and road conditions are revealed AFTER upgrade drafting (if Garage Module active)
- [ ] All weather/road effects integrate correctly with corner checks, heat management, and slipstream rules

---

# Epic: Championship Mode

- type: epic
- priority: 3
- labels: epic, phase-5, backend, frontend

## Description

Implement Championship Mode — a multi-race series where players compete across 3–4 races, accumulating points to determine an overall champion. This ties individual races into a larger competitive arc.

**Championship structure:**
- Series of 3 or 4 races on different tracks
- Players draft upgrades before EACH race (if Garage Module active)
- Weather and road conditions change each race (if Weather Module active)
- Points scored per race based on finishing position
- Overall champion: highest total points after all races

**Scoring system (doubled for championship):**
- Last place: 2 points
- Each higher position: +2 points
- In a 6-player game: 1st=12, 2nd=10, 3rd=8, 4th=6, 5th=4, 6th=2

**Starting grid for subsequent races:**
- First race: random starting grid
- Subsequent races: reverse championship standings (leader starts last)

**Press Corners (Sponsorship Cards):**
- During championship races, players can earn single-use sponsorship cards by:
  - Passing a corner at speed 2+ higher than the corner's speed limit
  - Slipstreaming across a corner
- Sponsorship cards are single-use upgrades that can be played in future rounds

**Championship event cards:**
- Random events drawn before each race that add special rules or conditions for that race

## Acceptance Criteria

- [ ] Championship configured with 3 or 4 races on selected tracks
- [ ] Points awarded per finishing position using the championship scoring formula
- [ ] Cumulative points tracked across all races
- [ ] Championship standings displayed between races
- [ ] Starting grid for races 2+ is reverse championship standings
- [ ] Upgrade drafting occurs before each race (with Garage Module)
- [ ] Weather/road conditions randomized per race (with Weather Module)
- [ ] Sponsorship cards earned for pressing corners (speed 2+ over limit) and slipstream across corners
- [ ] Sponsorship cards are single-use and tracked per player
- [ ] Championship event cards can be drawn and applied per race
- [ ] Overall champion determined after final race
- [ ] Championship results screen shows final standings with per-race breakdown

---

# Epic: Application Shell & Local Development Experience

- type: epic
- priority: 1
- labels: epic, phase-2, frontend, infrastructure, devex

## Description

Create the runnable web application that integrates all game subsystems into a single, locally-executable package. Today the project has epics for individual systems (engine, server, UI components, lobby) but nothing that wires them into an application a developer can clone, install, and play in their browser. This epic fills that gap.

The deliverable is a working local development environment where running one or two commands starts both the game server and a browser-based client, allowing a user to create a game, join it, and play through a race — all on localhost.

**Technology stack:**
- **Vite** as the frontend bundler and dev server (fast HMR, native TypeScript/React support, zero-config CSS)
- **React 19** with TypeScript for the client application (consistent with existing UI component epics)
- **Node.js** with the existing `ws`-based WebSocket server for the backend
- **Single monorepo** structure — client and server code coexist in the same repository

**Project structure:**

```
/
├── src/
│   ├── client/          ← Vite-bundled React app
│   │   ├── index.html   ← Entry point
│   │   ├── main.tsx     ← React mount + router setup
│   │   ├── App.tsx      ← Top-level layout and routing
│   │   ├── pages/       ← Route-level components
│   │   │   ├── Home.tsx
│   │   │   ├── Lobby.tsx
│   │   │   └── Game.tsx
│   │   ├── components/  ← Shared UI (from Game Board & Dashboard epics)
│   │   ├── hooks/       ← React hooks (useWebSocket, useGameState, etc.)
│   │   ├── styles/      ← Global and component CSS
│   │   └── assets/      ← Static images, fonts
│   ├── server/          ← Node WebSocket server
│   │   ├── index.ts     ← Server entry point
│   │   └── ...          ← Room, session, validation logic
│   ├── shared/          ← Types and logic shared between client and server
│   │   ├── types.ts
│   │   ├── protocol.ts  ← WebSocket message definitions
│   │   └── constants.ts
│   └── engine/          ← Pure game logic (no I/O dependencies)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

**Application routing (3 pages):**

1. **Home** (`/`) — Entry screen with "Create Game" and "Join Game" buttons. Clean, minimal landing that gets players into a game fast.
2. **Lobby** (`/lobby/:roomCode`) — Waiting room showing connected players, car color selection, game settings (track, laps, legends). Host controls to start the game. Shareable URL for inviting players.
3. **Game** (`/game/:roomCode`) — The main game view composing the track board (from Game Board UI epic) and player dashboard (from Player Dashboard UI epic). Phase-aware layout that adapts controls to the current game phase.

**WebSocket client layer:**

A `useWebSocket` React hook that:
- Connects to `ws://localhost:<port>` on game join
- Handles reconnection with exponential backoff
- Deserializes server messages into typed game state updates
- Provides a `send()` function for dispatching player actions (gear shift, card play, boost, slipstream, etc.)
- Manages connection status (connecting, connected, disconnected, reconnecting) exposed to the UI

A `useGameState` hook that:
- Consumes WebSocket messages and maintains local game state
- Splits public state (track, car positions, standings) from private state (hand, deck counts, engine)
- Triggers re-renders on state changes
- Provides phase-specific derived state (e.g., "cards I need to play this turn", "am I the active player")

**Local dev server setup:**

Running the application locally should require exactly two steps:

```bash
npm install       # Install all dependencies
npm run dev       # Start both Vite dev server AND WebSocket game server
```

`npm run dev` must:
- Start the Vite dev server (serves the React app with HMR on e.g. `http://localhost:5173`)
- Start the WebSocket game server (on e.g. `ws://localhost:3000`)
- Both processes run concurrently (use `concurrently` or Vite's proxy)
- Vite proxies WebSocket connections to the game server so the client connects to a single origin (no CORS issues)

Additionally:
- `npm run build` — Production build (Vite bundles the client, `tsc` compiles the server)
- `npm start` — Run the production build (serves static client files from the game server)
- `npm test` — Run the full test suite (Vitest)

**Vite configuration:**

```ts
// vite.config.ts
export default defineConfig({
  root: 'src/client',
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  },
  build: {
    outDir: '../../dist/client'
  }
})
```

**Session persistence:**

- Store a session token in `localStorage` on first visit
- Include the session token in the WebSocket handshake
- On page refresh or reconnect, the server matches the token to the existing player session
- If a player has an active game, the Home page shows a "Rejoin Game" prompt

**Package dependencies (minimum viable):**

- `react`, `react-dom` — UI framework
- `react-router-dom` — Client-side routing
- `vite` — Bundler and dev server
- `@vitejs/plugin-react` — Vite React support
- `ws` — WebSocket server (already referenced in existing epics)
- `concurrently` — Run client + server dev processes
- `vitest`, `@testing-library/react`, `jsdom` — Testing
- `typescript` — Type checking

## Acceptance Criteria

### Project Setup
- [ ] `package.json` defines all dependencies, scripts (`dev`, `build`, `start`, `test`), and project metadata
- [ ] `tsconfig.json` configured for strict TypeScript with React JSX support, path aliases for `@shared/`, `@engine/`, `@client/`, `@server/`
- [ ] `vite.config.ts` serves the client app with WebSocket proxy to the game server
- [ ] `.gitignore` covers `node_modules/`, `dist/`, and IDE files
- [ ] Directory structure matches the layout described above

### Local Dev Experience
- [ ] `npm install` installs all dependencies without errors
- [ ] `npm run dev` starts both the Vite dev server and the WebSocket game server concurrently
- [ ] The React app loads in the browser at `http://localhost:5173` (or configured port)
- [ ] Vite HMR works — editing a React component updates the browser without full page reload
- [ ] WebSocket connections from the client reach the game server through Vite's proxy
- [ ] `npm run build` produces a production bundle in `dist/`
- [ ] `npm start` serves the production build and game server from a single process
- [ ] `npm test` runs the test suite via Vitest

### Application Shell
- [ ] `index.html` mounts the React application with a root div
- [ ] `App.tsx` sets up React Router with routes for Home (`/`), Lobby (`/lobby/:roomCode`), and Game (`/game/:roomCode`)
- [ ] Home page renders with "Create Game" and "Join Game" entry points
- [ ] Lobby page connects to the WebSocket server and displays the waiting room
- [ ] Game page composes the track board and player dashboard in a responsive layout
- [ ] Navigation between pages works without full page reloads (client-side routing)
- [ ] 404/unknown routes redirect to Home

### WebSocket Client Integration
- [ ] `useWebSocket` hook connects to the game server and handles message serialization/deserialization
- [ ] Reconnection with exponential backoff works when the server restarts or connection drops
- [ ] Connection status (connecting, connected, disconnected, reconnecting) is exposed to components
- [ ] `useGameState` hook maintains typed client-side game state from server messages
- [ ] Private state (hand, engine) is separated from public state (track, positions, standings)
- [ ] Player actions (gear shift, card play, boost, slipstream opt-in, discard) dispatch correctly typed messages to the server

### Session Persistence
- [ ] Session token stored in `localStorage` on first visit
- [ ] Session token sent during WebSocket handshake
- [ ] Page refresh reconnects to the same game session without data loss
- [ ] Home page shows "Rejoin Game" if the player has an active session

### Testing
- [ ] At least one integration test verifies the client can connect to the server and receive game state
- [ ] React component tests for Home, Lobby, and Game pages render without errors
- [ ] `useWebSocket` hook is testable with a mock WebSocket server
- [ ] All existing tests continue to pass after project restructure

---

# Epic: Visual Game Assets & Board Presentation

- type: epic
- priority: 1
- labels: epic, phase-3, frontend, visual, assets

## Description

Transform the game from programmatic geometric primitives into a visually compelling racing experience. Currently the track is a gray line, cars are colored circles with gear numbers, cards are gradient rectangles with text, and the UI chrome is transparent black boxes drawn on Canvas. The game functions correctly but looks like a debug visualization, not a game.

This epic replaces every major visual element with purpose-built assets and styled rendering that evokes the tactile feel of the Heat: Pedal to the Metal board game — a 1960s grand prix racing aesthetic with bold colors, textured surfaces, and satisfying feedback.

**What exists today (the baseline to replace):**

| Element | Current rendering | Target |
|---------|------------------|--------|
| Track road | Thick gray `strokeStyle` line | Textured asphalt surface with painted lane markings, rumble strips at corners, grass/gravel runoff |
| Cars | Filled circles (`arc`) in player colors, gear number as text | Top-down SVG car sprites in 6 player colors, visible orientation along track direction |
| Cards | React `<button>` with CSS `linear-gradient` and text | Styled card components with distinct visual identity per type, proper card face layout, subtle texture |
| Corner markers | Orange line + red circle with white number | Chevron warning signs, painted corner apex markers, visible braking zone shading |
| Start/finish | Alternating black/white `fillRect` squares | Proper checkered flag pattern spanning the full road width, start light gantry |
| HUD overlays | `rgba(0,0,0,0.75)` rounded rects with `sans-serif` text | Themed panels with consistent typography, iconography, and racing aesthetic |
| Standings sidebar | Canvas-drawn text list | Styled leaderboard with position badges, gap indicators, car color swatches |
| Phase indicator | Canvas text in top-left corner | Prominent banner with phase icon, action prompt, and countdown timer visual |
| Grid positions | Small numbered circles | Staggered 2-wide grid with position numbers and player color indicators |
| Background | Flat `#1a1a2e` fill | Grassy infield with subtle terrain variation, grandstand elements at key locations |

### 1. Track Surface Rendering

Replace the single-stroke road with a multi-layer track surface:

**Road surface:**
- Dark asphalt base with subtle noise texture (procedural, generated on a small offscreen canvas and tiled)
- White dashed center line separating race line from off-line
- Solid white edge lines on both sides of the road
- Rumble strips (red-white alternating kerbs) on the inside of each corner
- Corner braking zone: subtle gradient darkening on the approach to each corner (the 3-4 spaces before the corner line)

**Road surroundings:**
- Green grass fill for the area inside and outside the track loop
- Gravel trap (tan/brown) patches at corner exits
- Track boundary fence (thin line with periodic posts) on the outside edge

**Corner presentation:**
- Replace the orange line + red circle with:
  - Painted red/white chevron signs on the outside of the corner
  - Speed limit displayed on a diamond-shaped sign (like real motorsport corner markers)
  - Apex painted on the road surface at the corner line

**Start/finish area:**
- Full-width checkered pattern painted on the road surface
- Start light gantry rendered as a horizontal bar above the track with 5 light positions (off/red/green states for future race start animation)
- Grid boxes painted on the road in the starting area, 2-wide stagger matching real F1 grids

### 2. Car Sprites

Replace the filled-circle car tokens with top-down SVG car sprites:

**Car design (inline SVG, no external files):**
- Simple top-down racing car silhouette: rounded rectangular body, visible front wing, rear wing, 4 wheels
- Approximately 24x12 world units (fits within the current `carRadius: 12` footprint)
- Each car rendered in one of the 6 player colors with a contrasting stripe/number
- Car rotates to face along the track direction (use `space.angle` to orient the sprite)

**Implementation approach:**
- Define the car as SVG path data (a single `<path d="...">` or small set of paths)
- At render time, draw to the Canvas using `ctx.save()`, `ctx.translate()`, `ctx.rotate()`, then path-draw, then `ctx.restore()`
- No image loading, no external asset files — the car shape is defined in code as path coordinates
- Pre-render each player color variant to an offscreen canvas at startup for performance

**Car states:**
- Normal: full opacity, clean rendering
- Active player: white glow ring (keep existing, but apply to the car shape not a circle)
- Boosting: speed lines trailing behind the car (3-4 short parallel lines fading to transparent)
- Spinout: car rotates 180-360 degrees during the spinout animation
- Eliminated/finished: checkered flag overlay or grayscale treatment

### 3. Card Visual Design

Upgrade the React card components from plain gradient buttons to styled game cards:

**Card layout (all types):**
- Fixed card proportions (roughly 5:7 ratio, keeping the existing 72x100px size)
- Rounded corners with a subtle inner border/frame
- Card type icon in the top-left corner
- Value/name prominently centered
- Card type name along the bottom edge
- Subtle paper/linen texture background (CSS `background-image` with a tiny repeating pattern or `filter` noise)

**Per-type visual identity:**

| Type | Background | Icon | Primary display |
|------|-----------|------|-----------------|
| Speed | Deep blue with white racing stripe | Speedometer | Large bold number (1-4) |
| Heat | Dark crimson, ember glow at edges | Flame | Flame icon, "HEAT" text |
| Stress | Electric yellow, hazard diagonal stripes | Lightning bolt | Bolt icon, "STRESS" text |
| Upgrade | Emerald green, mechanical texture | Gear/wrench | Effect name + value |

**Card interaction states (CSS transitions):**
- Default: flat, slight drop shadow
- Hover: slight lift (translateY -2px), shadow expands
- Selected: rises (translateY -10px), golden border glow, stronger shadow
- Disabled/unplayable: desaturated, reduced opacity, no pointer events
- Heat cards in hand: pulsing subtle red border to convey "stuck"

**Card flip animation:**
- During the Reveal & Move phase, played cards should flip from face-down (showing a card back with the Heat logo/pattern) to face-up
- CSS `transform: rotateY(180deg)` with `backface-visibility: hidden` on front/back faces
- Duration: 400ms with ease-out timing

### 4. HUD & UI Chrome

Replace the Canvas-drawn overlays with themed React components layered over the game board:

**Design language:**
- Dark semi-transparent panels with a 1px subtle border (not just `rgba(0,0,0,0.75)` boxes)
- Consistent font stack: a racing/mechanical feel — use `"Barlow Condensed"` (Google Font, free) for headers/numbers, system sans-serif for body text
- Accent color: warm amber/gold (`#F5A623`) for highlights and active states
- Consistent 8px spacing grid

**Standings panel (right side):**
- Position badges: gold/silver/bronze colored circles for P1/P2/P3, plain for rest
- Car color swatch next to each player name
- Current lap shown as a progress bar segment, not just "L1" text
- Gap to leader shown in spaces (e.g., "+3 spaces")
- Highlight row for the local player
- Subtle entry/exit animation when positions change

**Phase banner (top center):**
- Large phase name with an icon for each phase:
  - Gear Shift: gear icon
  - Play Cards: hand of cards icon
  - Reveal & Move: eye/reveal icon
  - React: lightning bolt icon
  - Slipstream: wind/draft icon
  - Corner Check: warning triangle icon
- Action prompt below the phase name: "Select your gear", "Play 3 cards", "Waiting for opponents..."
- If there's a timer, show a countdown bar that depletes left-to-right
- Pulsing animation when it's the local player's turn to act

**Turn order bar (top area):**
- Horizontal strip of small car color tokens
- Active player's token is larger and has a pointer/arrow indicator
- Completed players in the current phase are slightly faded

### 5. Game Event Visual Feedback

Add visual effects for key game moments so the player *feels* what's happening:

**Movement:**
- Car animates along the track path (already implemented in `animation.ts`) — enhance with a subtle dust/particle trail
- Speed value floats up from the car as a "+N" popup that fades out over 1 second

**Boost:**
- Orange flame burst behind the car when boost is activated
- Camera briefly shakes or pulses (very subtle, 2-3px for 200ms)

**Spinout:**
- Car rotation animation (already exists) — add tire smoke puffs (2-3 small circles that expand and fade)
- Screen edge briefly flashes red
- "SPINOUT!" text slam-zooms and fades at the spinout location

**Corner check pass:**
- Brief green checkmark flash at the corner
- Subtle green pulse on the speed limit sign

**Corner check fail (heat payment):**
- Corner sign flashes red
- Heat cards visually fly from the engine zone to the discard pile (in the player dashboard)

**Slipstream:**
- Replace the current dashed-line indicator with a visible draft/wind effect: semi-transparent curved lines flowing from the car ahead to the car behind
- Brief speed burst animation on the slipstreaming car

**Race finish:**
- Checkered flag waves across the screen when a car crosses the finish line on the final lap
- Final standings appear in a podium-style reveal with position animations

### 6. Track-Specific Visual Character

Each of the 4 base tracks should have a visual identity beyond just their layout shape:

| Track | Palette | Infield | Surroundings |
|-------|---------|---------|--------------|
| USA | Red-white-blue accents, concrete barriers | Desert sand, cacti silhouettes | Stadium grandstands |
| Italy | Italian tricolor accents, red kerbs | Manicured grass, cypress tree silhouettes | Historic buildings |
| France | Blue-white-red accents | Lavender field purple tint | Rolling hills |
| Great Britain | Green-white accents | Lush deep green grass | Overcast sky tint, hedge silhouettes |

Implementation: each track defines a `VisualTheme` object with:
- `kerbColors: [string, string]` — alternating kerb stripe colors
- `infieldColor: string` — grass/ground fill
- `accentColor: string` — used on signs, barriers, UI highlights
- `surroundElements: SurroundElement[]` — positioned decorative elements (silhouettes) rendered outside the track boundary
- `skyGradient: [string, string]` — background gradient (top to bottom)

These are cosmetic only — no gameplay impact, no collision, just visual flavor drawn behind the track.

## Acceptance Criteria

### Track Surface
- [ ] Road surface has a visible asphalt texture (not a flat solid color)
- [ ] White dashed center line visible between race line and off-line
- [ ] Solid white edge lines on both sides of the road
- [ ] Red-white rumble strip kerbs render on the inside of every corner
- [ ] Corner braking zones show a subtle darkening on the approach (3-4 spaces before the corner)
- [ ] Green grass infield fills the space inside and outside the track loop
- [ ] Gravel trap patches visible at corner exits
- [ ] Start/finish is a full-width checkered pattern on the road surface
- [ ] Starting grid shows 2-wide staggered boxes painted on the road

### Car Sprites
- [ ] Cars render as top-down car silhouettes, not circles
- [ ] Cars rotate to face along the track direction at their current space
- [ ] All 6 player colors produce visually distinct car sprites
- [ ] Active player car has a glow/highlight effect
- [ ] Boosting cars show speed lines trailing behind
- [ ] Spinout animation includes car rotation (not just position change)
- [ ] Car sprites are defined as inline path data (no external image files)
- [ ] Rendering performance is equivalent or better than current circle rendering (pre-rendered offscreen canvases)

### Card Visuals
- [ ] Cards have a framed layout with type icon, value, and type name
- [ ] Speed cards are distinctly blue with large bold numbers
- [ ] Heat cards have a crimson ember appearance
- [ ] Stress cards have yellow hazard styling
- [ ] Upgrade cards have green mechanical styling
- [ ] Hover state lifts the card and expands shadow
- [ ] Selected state raises the card with a golden border glow
- [ ] Heat cards in hand pulse with a subtle red border
- [ ] Card flip animation plays during the Reveal & Move phase (face-down to face-up)
- [ ] Card back design shows a consistent pattern/logo

### HUD & Overlays
- [ ] Standings panel shows position badges (gold/silver/bronze for top 3)
- [ ] Standings panel highlights the local player's row
- [ ] Phase banner displays phase icon + name + action prompt
- [ ] Phase banner pulses when it's the local player's turn to act
- [ ] Turn order bar shows car color tokens with active player indicator
- [ ] All HUD text uses a consistent, readable font (not default sans-serif)
- [ ] HUD panels have themed borders and consistent spacing

### Visual Feedback
- [ ] Car movement shows a floating "+N speed" popup
- [ ] Boost triggers a flame burst visual effect behind the car
- [ ] Spinout shows tire smoke puffs and "SPINOUT!" text
- [ ] Corner check pass shows a green checkmark flash
- [ ] Corner check fail flashes the corner sign red
- [ ] Slipstream shows a flowing draft/wind effect between the two cars
- [ ] Race finish triggers a checkered flag animation across the screen

### Track Themes
- [ ] Each of the 4 base tracks has a distinct visual theme (different infield color, accents, surroundings)
- [ ] Track theme is applied automatically based on which track is loaded
- [ ] Visual theme is purely cosmetic — no impact on gameplay logic or tests
- [ ] Decorative surround elements (silhouettes) render outside the track boundary

### Performance & Compatibility
- [ ] All visual enhancements render at 30+ FPS with 6 cars on track
- [ ] No external image files required (all assets are inline SVG paths, procedural textures, or CSS)
- [ ] Works on Chrome, Firefox, and Safari (latest versions)
- [ ] Responsive on desktop (1024px+) and tablet (768px+)
- [ ] Existing unit tests continue to pass (visual changes don't break game logic)

---

# Epic: Qualifying Laps — Single-Player Mode

- type: epic
- priority: 1
- labels: epic, phase-2, frontend, backend, gameplay

## Description

Add a single-player "Qualifying Laps" mode so anyone can play the game solo — no lobby, no waiting for opponents. When a player opens the app and nobody else is around, they should be able to jump straight into a solo session, learn the mechanics, practice heat management, and get comfortable with each track before joining a multiplayer race.

This is a core gameplay mode, not a debug feature. In real motorsport, qualifying is a solo time trial where each driver pushes hot laps to set their grid position. Our qualifying mode captures that fantasy: just you, the track, and your deck. Every mechanic works — gear shifts, card play, corners, heat payment, boost, cooldown, spinouts, deck cycling — so the skills you build in qualifying transfer directly to multiplayer.

**Why this matters for the game:**
- **Onboarding**: Heat has complex interlocking mechanics (gear-based card counts, heat as a resource, corner speed limits, deck management). Throwing a new player into a 6-player race cold is overwhelming. Qualifying lets them learn one concept at a time at their own pace.
- **Accessibility**: Not everyone has 5 friends online at the same time. A game that can't be played solo has a much smaller audience. Qualifying makes the app useful from the moment someone opens it.
- **Track mastery**: Each track has different corner layouts, speed limits, and pacing demands. Qualifying lets players learn a track's rhythm before racing on it competitively.
- **Always available**: No server coordination, no waiting room, no countdown. Click, pick a track, drive.

Today the game cannot be played solo. Three layers enforce a 2-player minimum:

1. **`initGame()` in `engine.ts`** (line 64): `if (playerIds.length < 2) throw`
2. **`setupRace()` in `race.ts`** (line 69): `if (playerIds.length < 2) throw`
3. **`canStartGame()` in `room.ts`** (line 148): `room.playerIds.length < 2` returns false

All three must be relaxed to allow exactly 1 human player in qualifying mode.

### The qualifying experience

From the player's perspective:

1. Open the app → Home page shows three options: **Create Game**, **Join Game**, **Qualifying Laps**
2. Click **Qualifying Laps** → Simple setup: pick a track, pick laps (1–3), pick your car color
3. Click **Start** → You're immediately on the track, first round, gear shift phase
4. Play through every phase at your own pace — no timers, no "waiting for opponents", phases advance the instant you submit
5. Complete your laps → Results screen shows your lap times, best lap, total time
6. Choose: **Run Again** (same track), **Try Another Track**, or **Back to Home** (and into a multiplayer lobby now that you know how to play)

The goal is zero friction from "I want to try this game" to "I'm playing."

### Engine changes (backend)

**`initGame()` / `setupRace()`:**
- Lower the minimum player count from 2 to 1
- Accept an optional `mode: 'race' | 'qualifying'` field on `GameConfig` and `RaceSetupConfig`
- When `mode === 'qualifying'`, the engine permits 1 player and sets `raceStatus` to `'qualifying'` instead of `'racing'`

**Phase behavior with 1 player:**

| Phase | Normal (2+ players) | Qualifying (1 player) |
|-------|---------------------|----------------------|
| 1. Gear Shift | Simultaneous, all players | Same — player submits gear choice |
| 2. Play Cards | Simultaneous, all players | Same — player selects cards |
| 3. Reveal & Move | Sequential (leader first) | Same — only 1 player, trivially sequential |
| 4. Adrenaline | Last-place player gets +1 speed/cooldown | **Skip entirely** — no relative positions |
| 5. React | Sequential | Same — player activates cooldown/boost |
| 6. Slipstream | Sequential, if adjacent car | **Skip entirely** — no other cars to draft |
| 7. Check Corner | Sequential | Same — corners still enforce speed limits |
| 8. Discard | Simultaneous | Same — player may discard |
| 9. Replenish | Simultaneous, check laps | Same — draw to 7, check lap completion |

Implementation: `executeAdrenaline()` already handles edge cases gracefully — if the "last place" player is the only player, the bonus still applies. For qualifying purity, **skip the adrenaline phase entirely** when `mode === 'qualifying'`. Similarly, `executeSlipstream()` should auto-advance (no eligible slipstream) — skip the phase or auto-decline for the solo player.

Add a helper:

```typescript
function shouldSkipPhase(state: GameState, phase: GamePhase): boolean {
  if (state.mode !== 'qualifying') return false;
  return phase === 'adrenaline' || phase === 'slipstream';
}
```

The `advanceSequentialPhase()` and phase transitions should check this and skip to the next phase.

**Lap timing:**
- Track a new field `lapTimes: number[]` on `PlayerState` (or on `GameState` for qualifying mode)
- A "lap time" is the number of rounds it took to complete one lap
- Record `lapStartRound` when a lap begins, compute `lapTime = currentRound - lapStartRound` when the lap completes
- After all laps, compute `bestLapTime = Math.min(...lapTimes)` and `totalTime = sum(lapTimes)`

**Race end in qualifying:**
- Same as normal: after completing the configured number of laps, the qualifying session ends
- No "final round" concept (no other players to finish) — immediately transition to `'finished'`

### Room / server changes

**Room creation for qualifying:**
- Add a new room mode: `mode: 'qualifying' | 'race'` on `RoomConfig`
- When `mode === 'qualifying'`:
  - `maxPlayers` is forced to 1
  - `canStartGame()` returns true when the solo player is ready (no 2-player minimum)
  - Turn timer is disabled (no time pressure — the player learns at their own pace)
  - Room code is still generated (useful if spectating is added later)

**`canStartGame()` update:**

```typescript
export function canStartGame(room: Room): boolean {
  if (room.status !== 'waiting') return false;
  const minPlayers = room.config.mode === 'qualifying' ? 1 : 2;
  if (room.playerIds.length < minPlayers) return false;
  return allPlayersReady(room);
}
```

**Game controller:**
- Pass `mode: 'qualifying'` through to `setupRace()` and `initGame()`
- During qualifying, the server auto-resolves skipped phases (adrenaline, slipstream) instead of waiting for player input
- State partition still works the same — all state is "your" state since there's only 1 player

### Frontend changes

**Home page — new entry point:**
- Add a third button alongside "Create Game" and "Join Game": **"Qualifying Laps"**
- Subtitle: "Practice solo — learn tracks and mechanics at your own pace"
- Visually equal to the other two buttons (not tucked away as a secondary option)

**Qualifying setup screen (`/qualifying` route):**
- Streamlined, no waiting room:
  - **Track selector**: Visual grid showing the 4 tracks with name and a brief character note (e.g., "USA — Long straights, tight turns"). Clicking a track selects it with a highlight.
  - **Lap count selector**: 1, 2, or 3 laps (default 2 — enough to experience deck cycling)
  - **Car color picker**: 6 color swatches, pick one
  - **"Start Qualifying"** button — immediate start, no ready-up
- First-time hint text: "Qualifying runs you through a full race solo. Learn gear management, corner braking, and heat strategy before racing others."

**In-game qualifying HUD adjustments:**
- **Hide** the standings sidebar (no opponents to rank against)
- **Hide** the turn order bar (only 1 player)
- Replace standings with a **Lap Timer panel** (right side):
  - Current lap number and target (e.g., "Lap 2 / 3")
  - Rounds elapsed this lap
  - Best lap time so far (shown from lap 2 onward)
  - Mini lap history: completed laps with their round counts
- Phase banner still shows — the player still needs to know what action is required
- **No "waiting for opponents" state** — phases advance the instant the solo player submits their action
- Optional: brief contextual tips during the first qualifying session (e.g., during gear shift: "Higher gears play more cards but have less cooldown", during corner check: "Speed over the limit costs Heat from your engine")

**Qualifying results screen:**
- Displayed after all laps complete
- **Track name** and visual identity
- **Per-lap breakdown**: round count per lap, displayed as a simple table or timeline
- **Best lap** highlighted with an accent color
- **Total time** (sum of all lap round counts)
- Three action buttons:
  - **"Run Again"** — restart qualifying on the same track and settings
  - **"Try Another Track"** — return to qualifying setup
  - **"Race Online"** — go to Home page to create/join a multiplayer game (nudge toward multiplayer after they've practiced)

### Secondary benefit: enables automated testing

As a secondary benefit, qualifying mode also enables end-to-end automated testing. Barry (mcp-playwright) can drive a complete qualifying session:
1. Navigate to home → click "Qualifying Laps"
2. Select a track → start session
3. Exercise each phase (shift gear, play cards, boost/cooldown, discard)
4. Complete laps → verify results screen

This is valuable but secondary to the primary goal of giving players a way to play solo.

## Acceptance Criteria

### Engine
- [ ] `initGame()` accepts `playerIds` with length 1 when `mode === 'qualifying'`
- [ ] `setupRace()` accepts a single player when `mode === 'qualifying'`
- [ ] Adrenaline phase is skipped entirely in qualifying mode (no +1 speed/cooldown)
- [ ] Slipstream phase is skipped entirely in qualifying mode (no other cars to draft)
- [ ] All other phases (gear shift, play cards, reveal & move, react, check corner, discard, replenish) work correctly with 1 player
- [ ] Corner checks still enforce speed limits and heat payment with 1 player
- [ ] Spinout mechanics work correctly with 1 player (position reset, stress cards, gear reset)
- [ ] Lap completion and race-end detection work with 1 player
- [ ] Race ends immediately when the solo player completes the target laps (no "final round" delay)
- [ ] Lap times (rounds per lap) are tracked and available in the game state
- [ ] Existing 2+ player tests continue to pass (qualifying mode is additive, not breaking)

### Room / Server
- [ ] Room can be created with `mode: 'qualifying'` and `maxPlayers: 1`
- [ ] `canStartGame()` returns true with 1 player in qualifying mode
- [ ] Server auto-advances skipped phases (adrenaline, slipstream) without waiting for input
- [ ] Turn timer is disabled in qualifying mode
- [ ] State partition sends full state to the solo player

### Frontend
- [ ] Home page shows a "Qualifying Laps" button with equal visual prominence to Create/Join
- [ ] Qualifying setup screen shows track selection, lap count, and car color
- [ ] Track selector displays all 4 tracks with names and brief descriptions
- [ ] "Start Qualifying" immediately begins the session (no ready-up, no waiting room)
- [ ] In-game HUD hides standings sidebar and turn order bar during qualifying
- [ ] Lap Timer panel shows current lap, rounds elapsed, and best lap time
- [ ] Phases advance immediately after the solo player submits (no "waiting for opponents" state)
- [ ] Qualifying results screen shows per-lap times, best lap, and total time
- [ ] "Run Again" restarts qualifying on the same track
- [ ] "Try Another Track" returns to the qualifying setup screen
- [ ] "Race Online" navigates to the Home page for multiplayer

### Player Experience
- [ ] A new player can go from opening the app to playing their first qualifying lap in under 30 seconds (3 clicks: Qualifying Laps → pick track → Start)
- [ ] All core mechanics are learnable in qualifying: gear shifting, card play, stress resolution, boost, cooldown, corner heat payment, spinout, deck reshuffling
- [ ] The qualifying flow naturally funnels toward multiplayer via the "Race Online" button on the results screen

---

# Epic: Browser Connectivity & App Shell Fixes

- type: epic
- priority: 0
- labels: epic, bug, frontend, backend, infrastructure, P0

## Description

The browser-based game is **completely blocked from being playable end-to-end**. QA playtesting (via mcp-playwright) revealed that creating a game on the Home page and navigating to the Lobby page destroys the room on the server, making it impossible to ever start a game through the UI. This epic addresses the P0 navigation blocker plus all related connectivity, error recovery, and UX issues discovered during testing.

**Current state of the problem:**

The App Shell epic (ht-yawl) delivered a working SPA with three pages (Home, Lobby, Game), each of which independently instantiates a `useWebSocket` hook. This means every page transition creates a brand-new WebSocket connection and destroys the previous one. The server's disconnect handler (`handleClose` in `ws-server.ts:568`) sees all players disconnected from a `waiting`-status room and immediately deletes it (line 588–592). By the time the Lobby page mounts and opens its new WebSocket, the room no longer exists. The lobby permanently shows "Connecting..." and the game can never start.

This is a fundamental architecture problem, not a minor bug. The fix requires lifting WebSocket lifecycle management out of individual page components and into a shared layer that persists across route changes.

### Root Cause Analysis

**Why the room is destroyed:**

1. User clicks "Create Game" on Home page → Home's `useWebSocket` sends `create-room` → server creates room, adds player
2. Server responds with `room-created` → Home navigates to `/lobby/:roomCode`
3. React Router unmounts Home → Home's `useWebSocket` cleanup runs → WebSocket closes
4. Server's `ws.onclose` fires → `handleClose()` calls `disconnectPlayer()` → `connectedPlayerIds` drops to 0
5. Server checks: `allPlayersDisconnected(room) && room.status !== 'playing'` → **true** → room is deleted
6. Lobby mounts → Lobby's `useWebSocket` opens new connection → gets new player ID and session token
7. Lobby sends `resume-session` with old token → server finds session but room is gone → session.roomId is cleared
8. Lobby shows "Connecting..." forever — room doesn't exist, no lobby-state arrives

**The architectural flaw:** Per-page WebSocket connections in an SPA. Every route change = disconnect + reconnect = server sees abandonment.

## Changes Required

### 1. Shared WebSocket Provider (P0 — fixes the blocker)

Lift WebSocket lifecycle to a React context provider that wraps the entire application, above the router. A single WebSocket connection persists across all page transitions.

**Implementation:**

Create a `WebSocketProvider` component (`src/client/providers/WebSocketProvider.tsx`):

```typescript
// Pseudocode structure
const WebSocketContext = createContext<WebSocketContextValue>(null);

export function WebSocketProvider({ children }) {
  const { sessionToken, setSessionToken } = useSession();
  const [gameState, dispatch] = useReducer(gameStateReducer, initialGameState);

  const { status, send, disconnect } = useWebSocket({
    sessionToken,
    onMessage: (msg) => {
      dispatch(msg);           // Feed all messages into shared state
      if (msg.type === 'session-created') setSessionToken(msg.sessionToken);
    },
  });

  return (
    <WebSocketContext.Provider value={{ status, send, gameState }}>
      {children}
    </WebSocketContext.Provider>
  );
}
```

**What changes in each page:**
- **Home, Lobby, Game**: Remove local `useWebSocket()` and `useGameState()` calls. Instead, call `useWebSocketContext()` to access the shared connection and game state.
- **Navigation logic**: Move server-message-driven navigation (e.g., `room-created` → navigate to lobby) into a shared `NavigationHandler` component or into the provider itself using `useNavigate()`.
- The `useWebSocket` hook itself remains unchanged — it's just called once at the top level instead of per-page.

**App.tsx changes:**

```tsx
function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <NavigationHandler />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lobby/:roomCode" element={<Lobby />} />
          <Route path="/game/:roomCode" element={<Game />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
```

### 2. Server-Side Grace Period for Waiting Rooms (P0 — defense in depth)

Even after fixing the client, add a server-side grace period before destroying waiting rooms with disconnected players. This protects against brief disconnects (network hiccups, browser refresh, mobile tab switching).

**Implementation in `handleClose()` (`ws-server.ts`):**

```typescript
// Instead of immediately deleting:
if (allPlayersDisconnected(room) && room.status !== 'playing') {
  // Schedule cleanup after grace period instead of immediate deletion
  scheduleRoomCleanup(state, room, WAITING_ROOM_GRACE_PERIOD_MS);
}
```

- `WAITING_ROOM_GRACE_PERIOD_MS`: 30 seconds (configurable)
- If any player reconnects during the grace period, cancel the scheduled cleanup
- If the grace period expires and still no players connected, then delete the room
- Track the cleanup timer on the room object (e.g., `room.cleanupTimer`)

**In `handleResumeSession()` and `handleJoinRoom()`:**
- When a player reconnects to a room that has a pending cleanup timer, cancel the timer

### 3. Stale Session Token Handling (P1)

**Problem:** After a server restart, `localStorage` still holds an old session token. The client sends `resume-session`, the server responds with `"Invalid session token"`, and the UI shows the error but stays stuck — no redirect, no recovery.

**Fix (client-side):**
- In the `WebSocketProvider`'s message handler, when receiving an `error` message with `"Invalid session token"`:
  - Clear the stored session token from `localStorage`
  - Clear the stored `activeRoom` from `localStorage`
  - The `useWebSocket` hook will automatically get a new session on the next connection (since it always sends a `session-created` on connect)
  - Redirect to Home page if not already there

**Fix (server-side):**
- No server changes needed — the server already sends an error and the connection remains valid (a new `session-created` was sent on connect before `resume-session` was processed)

### 4. Lobby Direct-URL Navigation (P1)

**Problem:** If a user pastes a lobby URL (`/lobby/ABCDEF`) directly into their browser, the Lobby component calls `setActiveRoom(roomCode)` but never sends a `join-room` message. It relies entirely on `resume-session` which may not have context for this room (e.g., the user was sent the link by a friend and has never been in this room).

**Fix:**
- In the Lobby component's `useEffect`, after the WebSocket connects:
  - If the user has no lobby state for this room AND they haven't been auto-joined via session resume:
    - Prompt the user for a display name (or use a stored one)
    - Send a `join-room` message with the room code from the URL params
  - If the room doesn't exist, the server will respond with `"Room not found"` and the lobby should redirect to Home with an appropriate message

**Implementation approach:**
- The `WebSocketProvider` should expose a `joinRoom(roomCode, displayName)` action
- The Lobby component checks: "Am I in this room?" If not after a brief delay (waiting for `resume-session` to complete), show a join prompt or auto-join

### 5. Error Recovery in Lobby (P1)

**Problem:** When `resume-session` fails or the room has been deleted, the lobby UI is stuck showing "Connecting..." forever. There's no error state, no redirect, and no back button.

**Fix:**
- Add a timeout (e.g., 5 seconds after WebSocket connects) — if no `lobby-state` message has arrived for this room, show an error state
- Error state displays: "Room not found or expired" with a "Back to Home" button
- When the server sends `error` with `"Room not found"`, immediately show this state instead of waiting for the timeout
- Add a visible "Back to Home" link/button on the Lobby page at all times (not just on error)

### 6. Favicon (P2)

**Problem:** 404 error in console for `/favicon.ico`.

**Fix:**
- Add a simple favicon to `src/client/` (can be a basic racing-themed SVG favicon)
- Reference it in `index.html`: `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
- Alternatively, add a minimal `public/favicon.ico` file

### 7. React Strict Mode WebSocket Warnings (P2 — cosmetic)

**Problem:** React strict mode's double-mount behavior causes `useWebSocket` to create a connection, immediately tear it down, then create another. This produces `WebSocket was closed before the connection was established` warnings in the console.

**Fix:**
- This is cosmetic and only occurs in development mode (strict mode double-mount)
- The current cleanup in `useWebSocket` already handles this correctly (sets `mounted = false` and closes the WS)
- To suppress the noisy warnings, add a small delay before the initial connection in the cleanup-aware path, or simply document that these warnings are expected in dev mode
- **No production impact** — strict mode double-mount only runs in development

### Previously Filed Server Bugs (Not in This Epic's Scope)

The following bugs were found during QA and already have their own beads. They are tracked separately and should NOT be duplicated in this epic:

- **ht-fcyn** (P1): Simultaneous phase errors delivered to wrong player
- **ht-uhxf** (P1): No input validation at action submission time
- **ht-jztc** (P1): Permanent soft-lock after invalid action
- **ht-vlkj** (P1): Reconnection causes premature phase execution
- **ht-onon** (P2): Duplicate resume-session destroys session token

These are server-side game logic bugs. This epic focuses on the connectivity and app shell layer.

## Acceptance Criteria

### Shared WebSocket Provider (P0)
- [ ] A single WebSocket connection is established when the app loads and persists across all route changes
- [ ] Navigating from Home → Lobby → Game does not close/reopen the WebSocket
- [ ] Creating a game on the Home page and navigating to the Lobby page does NOT destroy the room on the server
- [ ] Game state (lobby state, game state, player ID) is shared across all pages via React context
- [ ] Each page component consumes the shared connection via `useWebSocketContext()` instead of creating its own
- [ ] The full flow works: create game → navigate to lobby → see lobby state → second player joins → start game → navigate to game page → play

### Server-Side Grace Period (P0)
- [ ] Waiting rooms are NOT immediately deleted when all players disconnect
- [ ] A configurable grace period (default 30 seconds) delays cleanup of empty waiting rooms
- [ ] If a player reconnects within the grace period, the room is preserved and the timer is cancelled
- [ ] If the grace period expires with no reconnections, the room is deleted as before
- [ ] Playing rooms are unaffected (they already survive disconnections)
- [ ] Existing room cleanup tests continue to pass

### Stale Session Handling (P1)
- [ ] When the server responds with "Invalid session token", the client clears the stored token and activeRoom from localStorage
- [ ] After clearing a stale token, the client uses the fresh session created on connect (no stuck state)
- [ ] The user is redirected to the Home page if they were on Lobby or Game with a stale session
- [ ] No error banner persists after session recovery — the UI is in a clean state

### Lobby Direct-URL Navigation (P1)
- [ ] Pasting a lobby URL (`/lobby/ABCDEF`) into the browser and loading the page either:
  - (a) Resumes into the room if the user has a valid session for it, OR
  - (b) Prompts for a display name and sends `join-room` if the user has no session for this room
- [ ] If the room doesn't exist, the user sees "Room not found" and can navigate back to Home

### Error Recovery (P1)
- [ ] If no lobby-state arrives within 5 seconds of connecting, the Lobby page shows an error state (not infinite "Connecting...")
- [ ] Error state includes a "Back to Home" button
- [ ] Server "Room not found" errors immediately trigger the error state
- [ ] A "Back to Home" link is always visible on the Lobby page

### Favicon (P2)
- [ ] No 404 for `/favicon.ico` in the browser console
- [ ] A favicon is visible in the browser tab

### Console Warnings (P2)
- [ ] React strict mode WebSocket warnings are either suppressed or documented as expected dev-mode behavior
- [ ] No unexpected WebSocket errors appear in the console during normal operation

### Regression
- [ ] All existing tests (engine, room, server, component) continue to pass
- [ ] Multiplayer flow with 2+ players still works end-to-end
- [ ] Session reconnection after page refresh still works
- [ ] Room cleanup after TTL expiration still works

---

# Epic: Player Profiles, Stats & Leaderboards

- type: epic
- priority: 1
- labels: epic, phase-3, frontend, backend, persistence

## Description

Add persistent player identity, game statistics tracking, and leaderboards to transform Heat from a disposable per-session experience into a game with history, progression, and competition. Today, every time a player opens the app they're anonymous — their qualifying lap times vanish, their race victories are forgotten, and there's no reason to come back and improve. This epic changes that.

**Why this is the highest-impact 1.0 feature:**

1. **Qualifying becomes meaningful**: The Qualifying Laps epic gives players a solo mode, but without leaderboards, there's nothing to beat except your own memory. Per-track leaderboards turn qualifying into a competitive time-trial mode.
2. **Multiplayer has stakes**: Race results matter when they're recorded. Win/loss records, podium finishes, and head-to-head stats give multiplayer races weight.
3. **Retention loop**: "Can I beat my best lap on Italy?" or "I'm #3 on the USA leaderboard" are reasons to reopen the app. Without persistence, there's no pull to return.
4. **1.0 completeness**: A game without profiles feels like a tech demo. Profiles signal that the game is a real product.

### Player Profiles

**Profile creation (lightweight, no auth for MVP):**
- On first visit, the app prompts: "Choose a driver name" (persisted to `localStorage`)
- A unique profile ID is generated (UUID) and stored in `localStorage` alongside the session token
- The profile ID is sent to the server on WebSocket connect and attached to all game results
- No password, no email, no OAuth — just a persistent local identity
- Players can change their display name at any time from a settings/profile screen
- Profile also stores a preferred car color (used as default in lobbies)

**Profile data model:**

```typescript
interface PlayerProfile {
  id: string;              // UUID, generated on first visit
  displayName: string;     // Chosen by player, editable
  preferredColor: CarColor;
  createdAt: number;       // Timestamp
  stats: PlayerStats;
}

interface PlayerStats {
  // Qualifying
  qualifyingRuns: number;
  bestLapTimes: Record<string, number>;  // trackId → best lap time (rounds)
  bestTotalTimes: Record<string, Record<number, number>>;  // trackId → lapCount → best total

  // Multiplayer
  racesPlayed: number;
  racesWon: number;
  podiumFinishes: number;  // Top 3
  totalPoints: number;     // Championship-style cumulative points

  // Fun stats
  totalSpinouts: number;
  totalBoostsUsed: number;
  totalHeatPaid: number;   // Heat cards spent on corners
  longestWinStreak: number;
  currentWinStreak: number;
}
```

**Storage strategy (MVP — local-first):**

For the 1.0 MVP, all profile and stats data lives client-side in `localStorage`. This keeps the architecture simple (no database, no auth) while still delivering the full user experience. The server validates and computes results, then sends them to clients for local storage.

Future enhancement (post-1.0): Server-side persistence with a simple file-based or SQLite store, enabling cross-device profiles and server-authoritative leaderboards. The client-side structure is designed to be forward-compatible with this.

**Server-side result reporting:**

After each race or qualifying session ends, the server computes a `GameResult` and sends it to each client:

```typescript
interface GameResult {
  type: 'qualifying-result' | 'race-result';
  trackId: string;
  lapCount: number;
  timestamp: number;

  // Qualifying-specific
  lapTimes?: number[];
  bestLap?: number;
  totalTime?: number;

  // Race-specific
  position?: number;
  totalPlayers?: number;
  points?: number;
  playerResults?: { profileId: string; displayName: string; position: number; }[];
}
```

The client receives this, updates `PlayerStats` in `localStorage`, and if the result is a new personal best, flags it for the leaderboard submission flow.

### Qualifying Leaderboards

**Per-track leaderboards** showing the fastest qualifying lap times. Each of the 4 base tracks has its own leaderboard.

**Leaderboard entry:**

```typescript
interface LeaderboardEntry {
  profileId: string;
  displayName: string;
  bestLapTime: number;     // Rounds (lower is better)
  bestTotalTime: number;   // For the default lap count
  achievedAt: number;      // Timestamp
}
```

**MVP implementation (local leaderboard):**

Since there's no server-side persistence in the MVP, the leaderboard is populated from the local player's own history. This is still valuable — it shows personal progression over time:
- "Your best lap on USA: 4 rounds (achieved Jan 15)"
- Track-by-track personal bests displayed on the qualifying setup screen
- Results screen shows if the run was a new personal best (highlighted, celebratory)

**Shared leaderboard (stretch goal for 1.0):**

If time permits, add a simple server-side leaderboard:
- Server stores the top N entries per track in a JSON file on disk
- When a qualifying run completes, the server checks if it's a top-N time and updates the file
- Leaderboard data is sent to clients on request (not real-time — polled on page load)
- No authentication means entries can be spoofed, but for a local/friends game this is acceptable

### Race History

A scrollable history of recent games on the profile screen:

```typescript
interface GameHistoryEntry {
  type: 'qualifying' | 'race';
  trackId: string;
  lapCount: number;
  timestamp: number;
  result: {
    position?: number;       // Race only
    totalPlayers?: number;   // Race only
    bestLap: number;
    totalTime: number;
  };
}
```

- Stored in `localStorage` as an array (capped at last 50 entries)
- Displayed on the profile screen as a compact list: date, track, result
- Filterable by track and by type (qualifying vs. race)

### Frontend: Profile & Stats Screens

**Profile screen (`/profile` route):**
- Accessed from a persistent header/nav element (profile icon or "My Profile" link)
- Shows:
  - Display name (editable inline)
  - Preferred car color (clickable color picker)
  - Overall stats summary: races played, win rate, total qualifying runs
  - Per-track qualifying bests in a grid (4 tracks × best lap time)
  - Recent game history (last 10, with "View All" to see full history)

**Profile badge in header:**
- A small persistent element visible on all pages (including Home) showing the player's name
- Clicking it navigates to `/profile`
- On first visit (no profile yet), shows "Set up your driver profile" prompt

**Leaderboard panel on qualifying setup:**
- When selecting a track for qualifying, show the player's personal best for that track
- After completing qualifying, the results screen shows personal best comparison ("New PB!" or "2 rounds off your best")

**Stats integration in game HUD:**
- During qualifying, the Lap Timer panel shows the player's personal best for comparison
- During multiplayer, the post-race results screen shows updated career stats

### Backend: Result Computation & Delivery

**End-of-qualifying changes:**
- After the qualifying session ends, the server sends a `qualifying-result` message to the client containing lap times, best lap, and total time
- Client-side: update `PlayerStats.bestLapTimes` if this is a new personal best, increment `qualifyingRuns`, save to `localStorage`

**End-of-race changes:**
- After the final standings are computed, the server sends a `race-result` message to each client containing their position, points earned, and the full standings
- Client-side: update `racesPlayed`, `racesWon` (if position === 1), `podiumFinishes` (if position <= 3), `totalPoints`, streak tracking, save to `localStorage`

**New server message types:**

```typescript
// Server → Client
type ServerMessage =
  | ... // existing
  | { type: 'qualifying-result'; trackId: string; lapCount: number; lapTimes: number[]; bestLap: number; totalTime: number; }
  | { type: 'race-result'; trackId: string; position: number; totalPlayers: number; points: number; standings: { profileId: string; displayName: string; position: number; }[]; }
```

No new client→server message types needed for the MVP (stats are computed server-side and stored client-side).

### Data Migration & Compatibility

- `localStorage` keys are versioned: `heat-profile-v1`, `heat-stats-v1`, `heat-history-v1`
- If a future version needs to change the schema, a migration function reads the old version and writes the new one
- The existing `heat-session-token` and `heat-active-room` keys are unchanged

## Acceptance Criteria

### Player Profiles
- [ ] On first visit, the app prompts the player to choose a display name
- [ ] A unique profile ID (UUID) is generated and persisted in `localStorage`
- [ ] The display name is used as the default when creating or joining games (no need to re-enter each time)
- [ ] The player can change their display name from the profile screen
- [ ] The player can set a preferred car color that is auto-selected in lobbies
- [ ] Profile data survives browser refresh (persisted in `localStorage`)

### Stats Tracking — Qualifying
- [ ] After each qualifying run, `qualifyingRuns` is incremented
- [ ] Per-track best lap time is updated if the new run has a faster lap
- [ ] Per-track best total time (for a given lap count) is updated if the new run is faster
- [ ] The qualifying results screen shows whether the run was a new personal best

### Stats Tracking — Multiplayer
- [ ] After each multiplayer race, `racesPlayed` is incremented
- [ ] `racesWon` is incremented when the player finishes in 1st place
- [ ] `podiumFinishes` is incremented when the player finishes in the top 3
- [ ] `totalPoints` accumulates championship-style points across all races
- [ ] Win streak tracking correctly increments, resets, and records the longest streak
- [ ] Fun stats (spinouts, boosts, heat paid) are tracked and updated

### Stats Tracking — Fun Stats
- [ ] `totalSpinouts` increments each time the player spins out
- [ ] `totalBoostsUsed` increments each time the player activates boost
- [ ] `totalHeatPaid` increments by the amount of heat paid at corners

### Leaderboards (Local MVP)
- [ ] The qualifying setup screen shows the player's personal best lap time for the selected track
- [ ] The qualifying results screen compares the run against the player's personal best
- [ ] A "Personal Bests" section on the profile screen shows best laps for all 4 tracks

### Race History
- [ ] Game history entries are saved to `localStorage` after each qualifying run and race
- [ ] History is capped at 50 entries (oldest entries are pruned)
- [ ] The profile screen displays recent game history with date, track, and result
- [ ] History entries are filterable by track and game type (qualifying vs. race)

### Profile Screen UI
- [ ] `/profile` route renders the player's profile with stats, bests, and history
- [ ] Display name is editable inline on the profile screen
- [ ] Preferred car color is selectable on the profile screen
- [ ] Overall stats summary shows: races played, win rate, qualifying runs, total points
- [ ] Per-track qualifying bests are displayed in a grid layout
- [ ] A persistent profile badge/link is visible on all pages for easy navigation to the profile

### Server-Side Result Delivery
- [ ] Server sends `qualifying-result` message after a qualifying session ends
- [ ] Server sends `race-result` message to each client after a multiplayer race ends
- [ ] Result messages include all data needed for client-side stat updates (positions, points, lap times)

### Data Persistence & Compatibility
- [ ] All profile data uses versioned `localStorage` keys (`heat-profile-v1`, etc.)
- [ ] Clearing `localStorage` resets the profile (new profile created on next visit)
- [ ] Existing session token and active room keys are not affected
- [ ] The profile system works regardless of whether a game server is running (local data is always accessible)

### Regression
- [ ] All existing tests continue to pass
- [ ] Existing multiplayer and qualifying flows work unchanged for users who haven't set up a profile
- [ ] The app gracefully handles missing or corrupted profile data in `localStorage` (falls back to defaults)

---

# Epic: Interactive Tutorial & Rules Reference

- type: epic
- priority: 1
- labels: epic, phase-4, frontend, onboarding, ux

## Description

Add an interactive tutorial system and always-accessible rules reference to Heat, so new players can learn the game's mechanics through guided play and experienced players can quickly look up specific rules mid-game. This is the single highest-impact feature still missing for a 1.0 launch — Heat has 9 distinct turn phases, a gear-based card play system, heat management, corner speed limits, slipstream, boost, cooldown, stress resolution, and spinout mechanics. Without structured onboarding, new players will be immediately overwhelmed.

The tutorial is NOT a video or a wall of text. It is a **guided qualifying session** — a real solo game where the player drives through the rules step-by-step, with contextual prompts explaining what's happening and why. The player makes real choices (shift gear, play cards, decide on boost/cooldown) with the tutorial highlighting each mechanic as it naturally arises during gameplay.

The rules reference is a separate, always-accessible panel that organizes all game rules into searchable, browsable sections. Players can open it from any screen (home, lobby, or mid-game) without disrupting their current state.

### Tutorial Design Philosophy

- **Learn by doing**: Every concept is taught through actual gameplay, not passive reading
- **Progressive disclosure**: Introduce one mechanic at a time, in the order they naturally occur
- **Non-punishing**: The tutorial track/scenario is designed so the player cannot fail catastrophically
- **Skippable**: Experienced players can skip directly to free play
- **Replayable**: The tutorial is always available from the home screen

### Tutorial Scenario

The tutorial uses a **scripted qualifying session** on a custom short tutorial track (or the first sector of the USA track). The scenario is divided into lessons that correspond to the game's phase structure:

**Lesson 1: Gears & Speed Cards**
- Player starts in 1st gear
- Tutorial explains: gears determine how many cards you play
- Player shifts to 2nd gear (prompted)
- Tutorial explains: free shift = ±1 gear, paid shift = ±2 gears (costs 1 Heat)
- Player plays 2 speed cards (prompted to select specific ones)
- Tutorial explains: card values sum to your speed, and speed = spaces moved

**Lesson 2: Movement & Track Position**
- Cards are revealed, car moves forward on the track
- Tutorial highlights the track, spaces, and position
- Tutorial explains: occupied spaces push you forward (drafting)
- Player reaches a straightaway — good time to go fast

**Lesson 3: Corners & Heat**
- Player approaches a corner with a speed limit (e.g., limit 3)
- Tutorial warns: if your speed exceeds the limit, you pay Heat from your engine
- Player is prompted to choose cards that exceed the limit by 1 (guided)
- Tutorial shows Heat cards moving from Engine to discard pile
- Tutorial explains: run out of Heat = spinout (skip next turn, lose cards)

**Lesson 4: React Phase — Cooldown & Boost**
- Player is in 2nd gear (has Cooldown 1 available)
- Tutorial explains: Cooldown lets you move Heat from hand back to Engine
- Player activates cooldown (prompted)
- Next turn: player shifts to 4th gear
- Tutorial explains: 4th gear gives Boost — pay 1 Heat from Engine, flip cards for bonus speed
- Player activates boost (prompted)

**Lesson 5: Slipstream**
- A Legends car is placed just ahead of the player
- Player ends movement within 2 spaces of the Legends car
- Tutorial explains: Slipstream lets you move 2 extra spaces (doesn't count for corner checks)
- Player accepts slipstream (prompted)

**Lesson 6: Stress Cards**
- Player draws a Stress card into their hand
- Tutorial explains: Stress cards can be played like normal cards, but their value is random — flip from the deck until you get a Speed card
- Player plays a hand that includes the Stress card
- Tutorial shows the random resolution

**Lesson 7: Putting It All Together**
- Tutorial disables prompts and lets the player finish the remaining laps solo
- A summary overlay shows all mechanics covered with one-line reminders
- Tutorial ends with congratulations and the player's qualifying time
- Option to start a real qualifying session or return home

### Rules Reference Design

The rules reference is a **slide-out panel** accessible from a persistent "Rules" button visible on all screens (home, lobby, game). It does NOT navigate away from the current page — it overlays as a side panel or modal.

**Content structure (sections):**

1. **Overview** — What is Heat? How do you win? (2–3 sentences)
2. **Turn Structure** — The 9 phases listed with 1-sentence descriptions
3. **Gears** — Gear levels, card count per gear, special abilities per gear
4. **Cards** — Speed cards (values), Heat cards (penalty/resource), Stress cards (random), Upgrade cards
5. **Movement** — How speed converts to spaces, occupied space rules
6. **Corners** — Speed limits, Heat payment, spinout consequence
7. **React Phase** — Cooldown (by gear), Boost (4th gear), Adrenaline (last place bonus)
8. **Slipstream** — Proximity rule (within 2 spaces), +2 spaces, does not count for corner checks
9. **Deck Management** — Draw pile, discard pile, engine zone, hand replenishment, shuffle trigger
10. **Winning** — Crossing the finish line after the target number of laps, tie-breaking by position

Each section is expandable/collapsible. The panel remembers which sections are open. A search/filter bar at the top lets players type keywords (e.g., "corner", "boost", "stress") to jump to the relevant section.

### Mid-Game Contextual Help

During gameplay, each phase should display a small **"?"** tooltip icon next to the phase name. Clicking it opens the rules reference pre-scrolled to the relevant section for that phase. Examples:
- During "Shift Gears" phase → Opens rules reference to Gears section
- During "Check Corner" phase → Opens rules reference to Corners section
- During "React" phase → Opens rules reference to React Phase section

This provides just-in-time help without the player needing to search.

## Technical Approach

### Tutorial Engine

- A `TutorialManager` class (client-side only) wraps the existing game engine
- The tutorial scenario is a predefined JSON configuration that specifies:
  - Track data (short tutorial track or subset of USA)
  - Scripted Legends positions (for slipstream lesson)
  - Per-lesson triggers: which phase/round activates which lesson overlay
  - Forced hand contents for specific lessons (so the right cards are available)
  - Highlight targets: which UI elements to highlight per lesson step
- The tutorial runs a real qualifying session — the engine processes turns normally
- The `TutorialManager` intercepts before each phase to show the lesson overlay
- Player actions are real (they actually shift gears, play cards, etc.)
- Between lessons, the tutorial auto-advances through phases the player hasn't learned yet

### Tutorial UI Components

- `TutorialOverlay` — Full-screen semi-transparent overlay with lesson content
- `TutorialHighlight` — Draws attention to specific UI elements (gear selector, hand, engine zone) using a spotlight/cutout effect
- `TutorialPrompt` — Arrow pointing to the element the player should interact with, with instructional text
- `TutorialProgress` — Progress bar showing lessons completed (e.g., "3/7")
- These components are only rendered when a tutorial session is active

### Rules Reference Components

- `RulesPanel` — Slide-out panel with sections, search, and collapse/expand
- `RulesButton` — Persistent button on all pages that toggles the panel
- `PhaseHelpIcon` — Small "?" next to phase names in the game UI, links to relevant section
- Rules content is defined in a static data file (not hardcoded in JSX) for easy editing

### Tutorial Track

- If creating a custom tutorial track: a simple 3-corner oval, ~30 spaces, 1 lap
- If reusing USA track: use only the first sector (truncate the track at a logical point)
- The tutorial track should have at least one tight corner (low speed limit) and one fast section

### State Persistence

- Tutorial completion status stored in `localStorage` (`heat-tutorial-v1`)
- Tracks which lessons have been completed (so the player can resume if they quit mid-tutorial)
- On first visit (no profile, no tutorial completed), the home screen shows a prominent "Learn to Play" call-to-action
- After completing the tutorial, the CTA changes to "Play Tutorial Again" in a less prominent position

## Acceptance Criteria

### Tutorial — Core Flow
- [ ] A "Learn to Play" button on the home screen starts the interactive tutorial
- [ ] The tutorial runs a real qualifying session with the game engine (not a mockup)
- [ ] Lesson overlays appear at the correct phases, teaching one mechanic per lesson
- [ ] The player makes real gameplay choices during lessons (shift gear, play cards, boost, cooldown, slipstream)
- [ ] All 7 lessons are presented in order: Gears & Speed, Movement, Corners & Heat, Cooldown & Boost, Slipstream, Stress Cards, Free Play
- [ ] The tutorial ends with a summary of all mechanics and the player's qualifying time
- [ ] The player can skip the tutorial at any point ("Skip Tutorial" button)

### Tutorial — UI
- [ ] A highlight/spotlight effect draws attention to the relevant UI element for each lesson step
- [ ] Directional prompts (arrows or pointers) indicate which element the player should interact with
- [ ] A progress indicator shows the current lesson number and total (e.g., "Lesson 3 of 7")
- [ ] The tutorial overlay does not block the highlighted UI element — the player can still interact with it
- [ ] Lesson text is concise (2–4 sentences per step, not paragraphs)

### Tutorial — Scenario
- [ ] Lesson 1 forces the player to shift from 1st to 2nd gear, then play 2 speed cards
- [ ] Lesson 3 presents a corner where the player's speed exceeds the limit, triggering Heat payment
- [ ] Lesson 4 puts the player in a gear with Cooldown available, then later in 4th gear for Boost
- [ ] Lesson 5 positions a Legends car so that slipstream is available after movement
- [ ] Lesson 6 ensures a Stress card is in the player's hand for that turn

### Tutorial — Persistence
- [ ] Tutorial completion status is stored in `localStorage` under `heat-tutorial-v1`
- [ ] If the player quits mid-tutorial, they can resume from the last completed lesson
- [ ] First-time visitors see a prominent "Learn to Play" CTA on the home screen
- [ ] After completing the tutorial, the CTA is replaced with a smaller "Replay Tutorial" link
- [ ] The tutorial is always accessible from the home screen regardless of completion status

### Rules Reference — Panel
- [ ] A "Rules" button is visible on the home, lobby, and game screens
- [ ] Clicking "Rules" opens a slide-out panel (or modal) without navigating away from the current page
- [ ] The panel contains all 10 sections: Overview, Turn Structure, Gears, Cards, Movement, Corners, React Phase, Slipstream, Deck Management, Winning
- [ ] Each section is expandable/collapsible with a header click
- [ ] A search/filter input at the top of the panel filters sections by keyword
- [ ] The panel remembers which sections are expanded (within the current session)
- [ ] The panel can be closed by clicking outside it, pressing Escape, or clicking the close button

### Rules Reference — Contextual Help
- [ ] During gameplay, a "?" icon appears next to the current phase name in the top bar
- [ ] Clicking the "?" icon opens the rules reference pre-scrolled to the relevant section
- [ ] Each of the 9 game phases maps to the correct rules reference section
- [ ] The contextual "?" is not shown outside of active gameplay (home, lobby screens)

### Regression
- [ ] All existing tests continue to pass
- [ ] The tutorial does not affect normal qualifying or multiplayer game flows
- [ ] Existing players who have never done the tutorial can continue playing as before
- [ ] The rules reference panel works correctly even when no game is active (static content)
