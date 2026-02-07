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

# Epic: Qualifying Laps — Single-Player Local Play Mode

- type: epic
- priority: 1
- labels: epic, phase-2, frontend, backend, gameplay, testing

## Description

Add a single-player "Qualifying Laps" mode that lets one person run laps on any track without needing opponents. This serves two purposes: it gives developers and testers a fast way to exercise the full gameplay loop locally, and it gives players a way to learn tracks, practice heat management, and experiment with gear strategy before entering a multiplayer race.

Today the game cannot be played solo. Three layers enforce a 2-player minimum:

1. **`initGame()` in `engine.ts`** (line 64): `if (playerIds.length < 2) throw`
2. **`setupRace()` in `race.ts`** (line 69): `if (playerIds.length < 2) throw`
3. **`canStartGame()` in `room.ts`** (line 148): `room.playerIds.length < 2` returns false

Qualifying mode needs all three relaxed to allow exactly 1 human player.

### What "Qualifying Laps" means thematically

In real motorsport, qualifying is a solo time trial — each driver runs hot laps alone to set their grid position for the race. Our qualifying mode captures this:

- You're alone on the track
- You run a set number of laps (1-3, player's choice)
- The game tracks your best lap time (total spaces moved per lap, fewer rounds = faster)
- You manage your heat, cards, and gears exactly like a real race — the full 9-phase loop runs
- No opponents means no adrenaline, no slipstream, no position jockeying — just you vs. the track

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
  - Turn timer is disabled (no time pressure in qualifying)
  - Room code is still generated (useful if the player wants to share their session link for spectating later)

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
- Qualifying button is prominent and labeled for solo play: "Practice solo on any track"

**Qualifying setup screen:**
- Simplified lobby (no waiting for other players):
  - Track selector (dropdown or visual grid of the 4 tracks with preview)
  - Lap count selector (1, 2, or 3 laps)
  - Car color picker
  - "Start Qualifying" button (no ready-up needed, immediate start)
- Can be a simplified version of the Lobby page or a dedicated `/qualifying` route

**In-game qualifying HUD adjustments:**
- Hide the standings sidebar (no opponents)
- Hide the turn order bar (only 1 player)
- Replace standings with a **Lap Timer panel**:
  - Current lap number and target (e.g., "Lap 2 / 3")
  - Rounds elapsed this lap
  - Best lap time so far (if on lap 2+)
  - Mini lap history (Lap 1: 4 rounds, Lap 2: 3 rounds, ...)
- Phase banner still shows — the player still needs to know what action is required
- Skip the "waiting for other players" state entirely — phases advance as soon as the solo player submits

**Qualifying results screen:**
- Shown after all laps complete, instead of the normal race standings
- Display:
  - Track name
  - Total laps and total rounds
  - Per-lap times (round count per lap)
  - Best lap time highlighted
  - "Play Again" button (restart qualifying on the same track)
  - "Change Track" button (return to qualifying setup)
  - "Back to Home" button

### Testing value

This mode is critical for development testing because:

- **No coordination needed**: A developer can open one browser tab and immediately exercise the full gameplay loop — gear shifts, card play, reveal, corners, heat management, deck cycling
- **Fast iteration**: No waiting for other players to connect or submit actions
- **Deterministic debugging**: With one player, state transitions are fully predictable — easier to reproduce and debug issues
- **Visual testing**: Barry (mcp-playwright) can drive a qualifying session end-to-end by:
  1. Navigate to home page
  2. Click "Qualifying Laps"
  3. Select a track and start
  4. Interact with each phase (shift gear, play cards, boost/cooldown, discard)
  5. Complete laps and verify the results screen
  6. Screenshot at each phase to verify visual rendering

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
- [ ] Home page shows a "Qualifying Laps" button
- [ ] Qualifying setup screen lets the player choose track, lap count, and car color
- [ ] "Start Qualifying" immediately begins the session (no ready-up wait)
- [ ] In-game HUD hides standings sidebar and turn order bar during qualifying
- [ ] Lap Timer panel shows current lap, rounds elapsed, and best lap time
- [ ] Phases advance immediately after the solo player submits (no "waiting for opponents" state)
- [ ] Qualifying results screen shows per-lap times, best lap, and total time
- [ ] "Play Again" restarts qualifying on the same track
- [ ] "Change Track" returns to the qualifying setup screen

### Integration / Testing
- [ ] A complete qualifying session can be played end-to-end in a single browser tab: select track, run laps, see results
- [ ] `npm run dev` supports qualifying mode with no additional setup
- [ ] All game mechanics are exercisable in qualifying: gear shifting, card play, stress resolution, boost, cooldown, corner heat payment, spinout, deck reshuffling
