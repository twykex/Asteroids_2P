# Asteroids 2P (Space Avoider - Multiplayer) 🚀☄️👾

<p align="center">
  <!-- PLACEHOLDER: Replace with a screenshot or GIF! -->
  <!-- Create a 'docs' folder, add image/gif, update path below -->
  <img src="./docs/asteroids_demo.gif" alt="Asteroids 2P Gameplay" width="700"/>
</p>

A real-time multiplayer twist on the classic Asteroids arcade game! Pilot your ship, dodge and destroy increasingly difficult waves of asteroids, grab power-ups, and compete for the high score against other players in the same game room. Features include rounds, leader tracking, power-ups (Shield, Rapid Fire, Score Multiplier), and networked gameplay using Node.js and Socket.IO.

---

## ✨ Features

*   **Real-time Multiplayer:** Play cooperatively/competitively with others in the same game session via WebSockets (Socket.IO).
*   **Classic Asteroids Core:** Dodge asteroids, shoot projectiles.
*   **Multiplayer Dynamics:**
    *   See other players' ships, scores, and lives in real-time.
    *   Leader tracking (indicated by a crown 👑).
    *   Shared asteroid field and power-ups.
*   **Progressive Difficulty:**
    *   Game proceeds in rounds with increasing goals (asteroids to destroy).
    *   Asteroid spawn rate and speed increase with each round.
*   **Power-Ups:** Collect Shield, Rapid Fire (increased fire rate), and Score Multiplier (x2) power-ups randomly dropped by asteroids.
*   **Weapon Upgrades:** Your ship's weapon levels up automatically based on score thresholds, increasing fire rate and/or damage.
*   **Combo System:** Earn bonus points for destroying multiple asteroids quickly.
*   **Visual Feedback:**
    *   Explosion particle effects.
    *   Player damage/invincibility flashing.
    *   Power-up status indicators below ship.
    *   Screen shake on player hit.
    *   Round transition overlay.
*   **Scoring & Lives:** Track your score, lives, and persistent high score (using `localStorage`).
*   **Lobby System:** Basic lobby where players wait until enough join to start a game.
*   **Networking:** Uses Node.js and Socket.IO for real-time communication and state synchronization.

---

## 🔧 Tech Stack

*   **Backend:**
    *   Node.js
    *   Socket.IO (for real-time WebSocket communication)
    *   Express (implied by `server.js` structure, minimal use)
    *   `uuid` (for generating unique IDs)
*   **Frontend:**
    *   HTML5
    *   CSS3
    *   Vanilla JavaScript (DOM Manipulation, Event Handling, Canvas API rendering)
    *   Socket.IO Client

---

## 🚀 Getting Started

1.  **Prerequisites:**
    *   Node.js and npm (or yarn) installed: [https://nodejs.org/](https://nodejs.org/)
    *   Git installed: [https://git-scm.com/](https://git-scm.com/)
2.  **Clone the Repository:**
    ```bash
    git clone https://github.com/twykex/Asteroids_2P.git
    cd Asteroids_2P
    ```
    *(Make sure the directory name matches where your code is, e.g., `cd asteroidwebsite`)*
3.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *(This will install `express`, `socket.io`, and `uuid` based on your `package.json`)*
4.  **Run the Server:**
    ```bash
    node server.js
    ```
    You should see `Server listening on *:3000`.
5.  **Play the Game:**
    *   Open your web browser and navigate to `http://localhost:3000`.
    *   Open **additional** browser tabs/windows and navigate to the same address to simulate multiple players joining the lobby.
    *   Once enough players join (currently set to `MIN_PLAYERS_TO_START = 2` in `server.js`), the "Start Game" button in the lobby should become active.
    *   One player clicks "Start Game" to begin the session for everyone in the lobby.

---

## ▶️ How to Play

1.  **Lobby:** Wait for at least one other player to join. The "Start Game" button will enable when ready. Click it to begin.
2.  **Controls:**
    *   **Mouse Movement:** Controls the ship's position on the screen.
    *   **Left Mouse Click:** Fires projectiles. (Hold to fire continuously).
3.  **Objective:**
    *   Destroy asteroids by shooting them. Smaller asteroids break from larger ones (in standard Asteroids, though this implementation might just destroy them). Armored asteroids require more hits.
    *   Survive as long as possible by avoiding collisions with asteroids.
    *   Complete rounds by destroying the required number of asteroids shown in the UI.
    *   Collect power-ups (S=Shield, R=Rapid Fire, x2=Score Multiplier) dropped by destroyed asteroids.
4.  **Scoring:**
    *   Earn points for surviving (time-based).
    *   Earn points for destroying asteroids.
    *   Earn bonus points via the combo system for rapid destruction.
    *   Score Multiplier power-up doubles points earned while active.
5.  **Lives:** You start with 3 lives. Lose a life upon collision with an asteroid (unless shielded). The game ends for you when you run out of lives.
6.  **Multiplayer:** You see other players' ships. The player with the highest score is marked with a crown. The game ends for everyone when only one (or zero) player remains active.
7.  **Game Over:** Your final score and the overall high score are displayed. Click "Back to Lobby" to wait for a new game.

---
*(Note: The purpose of the `space-avoider-server` directory isn't clear from the provided files, adjust description if needed.)*

---

## 🔮 Future Enhancements

*   **Improved Networking:** Implement client-side prediction and server reconciliation for smoother movement. Optimize data synchronization.
*   **Visual Polish:** Add ship rotation/thrust animations, more varied asteroid graphics/breakup, better explosion effects, improved power-up visuals.
*   **Sound Design:** Integrate more sound effects (power-up collection, warnings, background music) with volume controls.
*   **Gameplay Depth:** Introduce different enemy types, boss rounds, more power-up variety.
*   **Mobile Controls:** Add touch controls for mobile play.
*   **Refined Lobby:** Allow game creation/joining by ID, show player names/latency.
*   **Persistence:** Store high scores and potentially player profiles in a database.
*   **Code Structure:** Further separate client rendering, state, and input logic. Separate server game state updates from network emission logic.
*   **Deployment:** Containerize (Docker) and deploy to a cloud service.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/twykex/Asteroids_2P/issues).
