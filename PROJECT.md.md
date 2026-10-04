\# Project: Bluff Card Web Game



\## 1. Project Overview



Build a real-time multiplayer bluffing card game playable entirely in a web browser.



The game is inspired by social bluffing card games where players pass hidden cards to each other and make claims about the card identity.



This project must NOT copy copyrighted artwork, branding, card designs, names, rulebook text, or visual assets from existing commercial board games.



Create an original implementation with placeholder/original card types and a clean modern UI.



Primary goals:



\- Playable directly from a browser

\- No installation required

\- Players join using a room code

\- No account registration required for MVP

\- Real-time multiplayer

\- Hidden information must remain secure

\- Refresh/reconnect support

\- Deployable using free-tier services



\---



\# 2. Tech Stack



Use:



Frontend:

\- Next.js latest stable version

\- TypeScript

\- App Router

\- Tailwind CSS

\- Framer Motion



Backend / Database:

\- Supabase

\- PostgreSQL

\- Supabase Realtime

\- Supabase Anonymous Authentication if appropriate



Deployment:

\- Vercel free tier for Next.js

\- Supabase free tier



Do NOT introduce:

\- Redis

\- Railway

\- Docker

\- Kubernetes

\- separate Node.js backend

\- paid services



unless technically necessary.



The MVP should remain simple and deployable for free.



\---



\# 3. Core Game Concept



Players:

\- Minimum: 2

\- Recommended: 3-6

\- Maximum MVP: 8



Each player receives cards.



Cards have hidden identities.



Example card types:



\- Bug

\- Rat

\- Bat

\- Spider

\- Frog

\- Fly

\- Scorpion

\- Snake



These names are placeholders and should be configurable.



Players take turns passing a hidden card to another player while claiming what type of card it is.



Example:



Player A passes a hidden card to Player B.



Player A says:



"This is a Rat."



Player B must decide whether Player A is telling the truth.



Possible responses:



\- TRUE

\- BLUFF



Then the card is revealed.



If Player B guessed incorrectly:

Player B receives the card as a penalty.



If Player B guessed correctly:

Player A receives the card as a penalty.



The penalty card stays face-up in front of the player.



\---



\# 4. MVP Rules



Implement simplified rules first.



\## Turn



Current player:



1\. Selects one card from their hand.

2\. Selects another player.

3\. Selects a claimed card type.

4\. Sends the card.



The receiving player sees:



\- sender

\- claimed card type

\- face-down card



The receiving player chooses:



\- TRUE

\- BLUFF



The card is revealed.



Resolve the result.



Then determine the next player's turn.



\---



\# 5. Win / Lose Condition



For MVP:



A player loses when they collect:



4 face-up cards of the same type.



Example:



Rat

Rat

Rat

Rat



That player loses.



Alternative game-ending logic should be isolated so that rules can easily be changed later.



Create a rule engine instead of hardcoding rules directly into React components.



Example:



src/lib/game/rules.ts



Functions:



checkLoseCondition()

resolveChallenge()

determineNextPlayer()

createDeck()

dealCards()



\---



\# 6. Game Flow



\## Landing Page



Route:



/



Display:



Logo / game title



Buttons:



\[ CREATE ROOM ]



Room code input:



\[ XXXXX ]



\[ JOIN ROOM ]



Player nickname input.



No account registration UI.



\---



\# 7. Create Room Flow



Player enters nickname.



Clicks:



CREATE ROOM



System generates a readable room code.



Example:



ABCD12



Redirect:



/room/ABCD12



Creator becomes:



HOST



Room status:



WAITING



\---



\# 8. Lobby



Display:



Room Code



ABCD12



Players:



Jab

Beam

Pun



Host badge.



Each player can:



READY / NOT READY



Host can:



START GAME



Start button enabled when:



\- minimum 2 players

\- required players ready



Copy room link button.



Example:



https://domain.com/room/ABCD12



\---



\# 9. Game Screen



Layout optimized for desktop initially but responsive for mobile.



Example:



&#x20;               PLAYER 2

&#x20;             🂠 🂠 🂠 🂠





PLAYER 3                         PLAYER 4







&#x20;                TABLE



&#x20;             Hidden Card



&#x20;            "Claims: RAT"



&#x20;             TRUE

&#x20;             BLUFF





&#x20;                YOU



&#x20;       🂠 🂠 🂠 🂠 🂠 🂠



\---



\# 10. Player UI



Each player should display:



\- nickname

\- avatar placeholder

\- connection status

\- card count

\- face-up penalty cards

\- current-turn indicator



Do NOT display opponents' hidden card identities.



\---



\# 11. Player Hand



Current player's hand shown at bottom.



Cards can be clicked.



Selected card should animate upward.



Use Framer Motion.



Opponent hands should display only card backs and card counts.



Example:



Opponent:



🂠 🂠 🂠 🂠



NOT:



Rat

Bug

Spider

Bat



\---



\# 12. Card Passing Animation



When a player sends a card:



Animate card from sender toward receiving player.



Animation can initially be simple.



After animation:



Display decision modal.



Example:



Jab claims:



"This card is a RAT"



\[ TRUE ]



\[ BLUFF ]



\---



\# 13. Reveal Animation



After decision:



Flip card.



Display actual card type.



Example:



Claim:

RAT



Actual:

SPIDER



Then show result:



"Beam caught the bluff!"



or



"Beam guessed incorrectly!"



Wait approximately 1-2 seconds.



Then continue game.



\---



\# 14. Important Security Requirement



THE SERVER / DATABASE MUST BE AUTHORITATIVE.



Never trust game state submitted by client.



Client should send actions.



Example:



{

&#x20; "type": "PLAY\_CARD",

&#x20; "cardId": "...",

&#x20; "targetPlayerId": "...",

&#x20; "claim": "rat"

}



The game logic must validate:



\- Is this player in the room?

\- Is it their turn?

\- Does the player actually own this card?

\- Is target player valid?

\- Is claim valid?

\- Is game currently in correct phase?



Never allow frontend state alone to determine game outcomes.



\---



\# 15. Hidden Information Security



This is extremely important.



Opponent card identities MUST NOT be delivered to other clients.



Do NOT send full hands to all clients and hide them using CSS.



Bad:



{

&#x20; "beam": \[

&#x20;   "rat",

&#x20;   "bug",

&#x20;   "bat"

&#x20; ]

}



Even if hidden visually.



Users can inspect browser DevTools.



Instead return:



{

&#x20; "beam": {

&#x20;   "cardCount": 3

&#x20; }

}



Only the card owner can receive card identities.



Implement appropriate Supabase RLS policies / secure server functions.



\---



\# 16. Game State Machine



Game should follow explicit phases.



Suggested:



WAITING



STARTING



SELECT\_CARD



SELECT\_TARGET



SELECT\_CLAIM



WAITING\_RESPONSE



REVEAL



RESOLVE



NEXT\_TURN



GAME\_OVER



Do not allow actions outside the current state.



Example:



Player cannot PLAY\_CARD during REVEAL phase.



\---



\# 17. Data Model



Create Supabase SQL migrations.



\## rooms



id UUID PK



code VARCHAR unique



host\_player\_id UUID



status ENUM-like string:



waiting

playing

finished



created\_at



updated\_at



\---



\## players



id UUID PK



room\_id UUID



user\_id UUID nullable



nickname VARCHAR



is\_host BOOLEAN



is\_ready BOOLEAN



is\_connected BOOLEAN



seat\_number INT



created\_at



last\_seen\_at



\---



\## games



id UUID



room\_id UUID



status



current\_player\_id UUID



phase VARCHAR



turn\_number INT



created\_at



started\_at



finished\_at



\---



\## cards



id UUID



game\_id UUID



type VARCHAR



owner\_player\_id UUID



location VARCHAR



Possible locations:



deck

hand

table

penalty



is\_face\_up BOOLEAN



\---



\## game\_actions



id UUID



game\_id UUID



player\_id UUID



action\_type VARCHAR



payload JSONB



created\_at



For debugging/game history.



Do not expose sensitive payload data to unauthorized users.



\---



\# 18. Realtime



Use Supabase Realtime.



Each game room subscribes to:



room:{roomCode}



Realtime changes/events include:



PLAYER\_JOINED



PLAYER\_LEFT



PLAYER\_READY



GAME\_STARTED



TURN\_STARTED



CARD\_PLAYED



CLAIM\_CREATED



CHALLENGE\_CREATED



CARD\_REVEALED



TURN\_FINISHED



GAME\_FINISHED



Prefer server-side verified state changes instead of trusting arbitrary client broadcasts.



\---



\# 19. Reconnection



Player identity should survive page refresh.



Use Supabase Anonymous Auth or another secure temporary session.



Do not rely only on nickname.



On refresh:



1\. restore auth/session

2\. find player record

3\. reconnect to room

4\. fetch sanitized current game state

5\. restore player's hand

6\. restore current game phase



Game must not restart when browser refreshes.



\---



\# 20. Disconnect



If player disconnects:



Set:



is\_connected = false



Do not immediately remove player.



Allow player to reconnect.



For MVP:



Game may pause if current player disconnects.



Display:



"Waiting for Jab to reconnect..."



\---



\# 21. Supabase RLS



Enable Row Level Security.



Rules should ensure:



A player can:



\- read their room

\- read public player information

\- read their own hand

\- read visible penalty cards

\- submit allowed game actions



A player cannot:



\- read another player's hidden card identities

\- modify another player's cards

\- modify current turn manually

\- set themselves as winner

\- reveal cards without valid game action



Use server-side functions / RPC where needed.



\---



\# 22. Server-side Game Actions



Prefer implementing important actions as Supabase RPC / PostgreSQL functions or secure Next.js server-side APIs.



Examples:



create\_room()



join\_room()



start\_game()



play\_card()



respond\_to\_claim()



resolve\_turn()



Game-state mutation should happen atomically where possible.



Avoid race conditions.



\---



\# 23. Race Condition Prevention



Two actions may arrive at nearly the same time.



Validate:



\- game phase

\- turn number

\- current player

\- current card



before every mutation.



Optional:



Use game version number.



Example:



games.version



Client action:



{

&#x20; gameVersion: 12

}



If server version is already 13:



reject stale request.



\---



\# 24. Folder Structure



Suggested:



src/



app/

&#x20; page.tsx



&#x20; room/

&#x20;   \[code]/

&#x20;     page.tsx



components/



&#x20; game/

&#x20;   GameBoard.tsx

&#x20;   PlayerSeat.tsx

&#x20;   PlayerHand.tsx

&#x20;   GameCard.tsx

&#x20;   ClaimModal.tsx

&#x20;   RevealModal.tsx

&#x20;   GameResult.tsx



&#x20; lobby/

&#x20;   Lobby.tsx

&#x20;   PlayerList.tsx

&#x20;   RoomCode.tsx



&#x20; ui/



lib/



&#x20; supabase/

&#x20;   client.ts

&#x20;   server.ts



&#x20; game/

&#x20;   rules.ts

&#x20;   deck.ts

&#x20;   types.ts

&#x20;   state-machine.ts

&#x20;   validation.ts



hooks/



&#x20; useRoom.ts

&#x20; useGame.ts

&#x20; useRealtime.ts



types/



&#x20; database.ts

&#x20; game.ts



supabase/



&#x20; migrations/



\---



\# 25. Game Domain Types



Create TypeScript types.



Example:



type CardType =

&#x20; | "bug"

&#x20; | "rat"

&#x20; | "bat"

&#x20; | "spider"

&#x20; | "frog"

&#x20; | "fly"

&#x20; | "scorpion"

&#x20; | "snake";



type GamePhase =

&#x20; | "waiting"

&#x20; | "select\_card"

&#x20; | "select\_target"

&#x20; | "select\_claim"

&#x20; | "waiting\_response"

&#x20; | "reveal"

&#x20; | "resolve"

&#x20; | "game\_over";



interface PublicPlayer {

&#x20; id: string;

&#x20; nickname: string;

&#x20; cardCount: number;

&#x20; penaltyCards: VisibleCard\[];

&#x20; connected: boolean;

}



interface PrivatePlayerState extends PublicPlayer {

&#x20; hand: Card\[];

}



\---



\# 26. UI Style



Visual direction:



Fun

Minimal

Playful

Slightly mischievous



Do NOT visually copy existing commercial board games.



Use original visual language.



Suggested palette:



Background:

\#FFF8EC



Dark:

\#242424



Orange:

\#F97316



Yellow:

\#FACC15



Red:

\#EF4444



Green:

\#22C55E



Cards:



Rounded corners

Slight shadows

Paper texture can be added later.



MVP may use emoji or simple CSS icons for card types.



\---



\# 27. Responsive Design



Desktop priority.



Must still work on:



375px mobile width



Mobile layout:



Opponent players around top.



Game table center.



Player hand horizontally scrollable at bottom.



Buttons must remain reachable.



\---



\# 28. Sound



Do not implement initially.



Leave architecture ready for:



card slide

card flip

correct answer

wrong answer



later.



\---



\# 29. Animation



Use Framer Motion.



Animations:



card hover



card select



card pass



card flip



turn indicator



winner / loser result



Avoid excessive animation.



\---



\# 30. MVP Pages



Only create:



/



/room/\[code]



Optional:



/how-to-play



Do not build:



profiles

friends

leaderboards

shop

achievements

login page



during MVP.



\---



\# 31. Development Environment



Provide:



.env.example



Example:



NEXT\_PUBLIC\_SUPABASE\_URL=



NEXT\_PUBLIC\_SUPABASE\_ANON\_KEY=



SUPABASE\_SERVICE\_ROLE\_KEY=



Never expose:



SUPABASE\_SERVICE\_ROLE\_KEY



to browser code.



\---



\# 32. README



README must contain:



Project overview



Prerequisites



Local setup



Supabase setup



Environment variables



Database migration instructions



Development command



Vercel deployment guide



Supabase production configuration



\---



\# 33. Testing



Use Vitest or equivalent.



Unit test game engine heavily.



Tests required for:



deck generation



card dealing



valid turn



invalid turn



card ownership



challenge truth



challenge bluff



penalty assignment



lose condition



turn progression



invalid target



stale action



Game rules should be testable without React or Supabase.



\---



\# 34. Important Architecture Rule



Separate:



GAME LOGIC



from



UI



and



DATABASE



Game engine should ideally work like:



const result = resolveChallenge(gameState, action)



and return:



{

&#x20; nextState,

&#x20; events

}



This will make the game easier to test and later migrate to WebSocket/Node.js if needed.



\---



\# 35. Future Architecture



Design code so Supabase Realtime can later be replaced by:



Node.js

Socket.IO

Redis



without rewriting core game rules.



Game engine must not depend directly on Supabase APIs.



Use layers:



UI

↓

Game Service

↓

Game Engine

↓

Repository / Realtime Adapter



\---



\# 36. MVP Completion Criteria



MVP is complete when:



1\. A user can create a room.

2\. Another browser can join via room code.

3\. Players appear in lobby in realtime.

4\. Host can start game.

5\. Cards are dealt.

6\. Each player sees only their cards.

7\. Current player can choose a card.

8\. Current player can choose another player.

9\. Current player can make a claim.

10\. Target player can choose TRUE or BLUFF.

11\. Card is revealed.

12\. Penalty is assigned correctly.

13\. Turn moves to next player.

14\. Lose condition works.

15\. Game over screen appears.

16\. Refreshing browser reconnects player.

17\. Opponent hidden cards cannot be inspected from browser network/devtools.

18\. Two different browsers can complete a full game.

19\. Project runs locally.

20\. Project can deploy to Vercel + Supabase free tier.



\---



\# 37. Codex Implementation Strategy



Do NOT attempt to build everything in one giant step.



Work sequentially.



Phase 1:

Initialize project and architecture.



Phase 2:

Create game engine and unit tests.



Phase 3:

Create Supabase schema/migrations.



Phase 4:

Implement create/join room.



Phase 5:

Implement realtime lobby.



Phase 6:

Implement game initialization/card dealing.



Phase 7:

Implement turn/state machine.



Phase 8:

Implement bluff/challenge/reveal.



Phase 9:

Implement game-over logic.



Phase 10:

Implement reconnect.



Phase 11:

UI polish and animation.



Phase 12:

Security/RLS audit.



Phase 13:

Deployment documentation.



After every phase:



\- run TypeScript checks

\- run lint

\- run tests

\- fix errors before continuing



Do not leave placeholder implementations for core game mechanics.



\---



\# 38. First Task



Start by:



1\. Create Next.js TypeScript project.

2\. Install dependencies.

3\. Create folder architecture.

4\. Create game domain types.

5\. Implement standalone game engine.

6\. Add game engine unit tests.

7\. Do NOT implement Supabase yet.

8\. Run tests.

9\. Report what was created and what the next phase will implement.



Do not continue to the next phase until the current phase compiles and tests pass.

