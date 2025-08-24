# BlueMap Follow Player Script

A drop‑in script that makes your BlueMap viewer automatically **follow a specific player** by UUID or by name via simple URL parameters. It includes a resilient player‑marker resolver (handles dashed/undashed UUIDs, varying marker keys/fields) and a small **localStorage cache** to speed up name lookups.

> Works with the standard **`bm-players`** marker set exposed by BlueMap.

---

## ✨ Features

* **Follow by URL**: `?follow_player=<uuid>` or `?follow_player_name=<name>`
* **Robust marker matching**: tries keys and fields; supports dashed/undashed UUIDs
* **Name ↔ UUID resolution**: checks cache → live marker label → MineTools API
* **Graceful bootstrapping**: waits for the `bm-players` marker set to populate (up to 15s)

---

## 🧩 Requirements

* A BlueMap web viewer with the default **players marker set** available as `bm-players`.

---

## 🚀 Installation

1. Place the script file in your BlueMap web assets:

   ```
   bluemap/web/js/FollowPlayer.js
   ```

2. Edit the BlueMap webapp config file:

   ```
   config/bluemap/webapp.conf
   ```

   Add the script to the `scripts` section:

   ```json
   "scripts": [
     "js/FollowPlayer.js"
   ]
   ```

3. Restart/reload your BlueMap web viewer.

---

## 📖 Usage

Open your BlueMap URL with one of:

* By UUID (dashed or undashed):

  ```
  https://your-bluemap.example.com/?follow_player=01234567-89ab-cdef-0123-456789abcdef
  ```

  or

  ```
  https://your-bluemap.example.com/?follow_player=0123456789abcdef0123456789abcdef
  ```
* By player name (case-insensitive):

  ```
  https://your-bluemap.example.com/?follow_player_name=YourPlayer
  ```

If the player exists in the `bm-players` marker set, the camera begins following them automatically.

---

## ⚙️ How It Works

* Waits up to 15s for the `bm-players` marker set to populate.
* Parses URL params:

  * `follow_player`: UUID (dashed or undashed)
  * `follow_player_name`: exact player name (case-insensitive)
* Resolves the target marker by:

  1. Direct key lookups (`bm-player-<uuid>`)
  2. Key scanning (suffix matches)
  3. Field scanning (`id`, `data.id`, `uuid`, etc.)
* Calls `bluemap.mapViewer.controlsManager.controls.followPlayerMarker(marker)` when found.

---

## 🧭 URL Parameters

* `?follow_player=<uuid>` — follow by UUID (dashed or undashed)
* `?follow_player_name=<name>` — follow by player name (case-insensitive)

> If both are present, UUID takes precedence.

---

## 🙌 Credits

* Built for BlueMap servers that want a simple way to deep‑link into “follow this player” views.
* Uses the public MineTools API for optional UUID→name lookups.
