// ------------------------------
// BlueMap Follow Player Script with localStorage Cache
// Robust marker matching (keys & fields) + dashed/undashed UUID support
// ------------------------------

(() => {
  const CACHE_KEY = "bluemapPlayerCache";
  const CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // --- Cache helpers ---
  let playerCache = {};
  try {
    playerCache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    playerCache = {};
  }

  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(playerCache)); } catch {}
  }

  function setCache(uuid, name) {
    if (!uuid || !name) return;
    const key = normalizeUUID(uuid);
    playerCache[key] = { name, lastUpdated: Date.now() };
    saveCache();
  }

  function getCachedName(uuid) {
    const key = normalizeUUID(uuid);
    const entry = playerCache[key];
    if (!entry) return null;
    if (Date.now() - entry.lastUpdated > CACHE_TTL) return null;
    return entry.name || null;
  }

  // --- UUID helpers ---
  function normalizeUUID(s) {
    if (!s) return "";
    return s.replace(/-/g, "").toLowerCase();
  }

  function dashUUID(undashed32) {
    const u = normalizeUUID(undashed32);
    if (u.length !== 32) return (undashed32 || "").toLowerCase();
    return `${u.slice(0,8)}-${u.slice(8,12)}-${u.slice(12,16)}-${u.slice(16,20)}-${u.slice(20)}`;
  }

  function looksLikeUUID(s) {
    if (!s) return false;
    const undashed = /^[0-9a-fA-F]{32}$/;
    const dashed = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return undashed.test(s) || dashed.test(s);
  }

  // --- BlueMap helpers ---
  function getPlayerMarkerSet() {
    return bluemap?.mapViewer?.markers?.markerSets?.get?.("bm-players") || null;
  }

  // Return [{ key: string, marker: object }]
  function getAllPlayerMarkersWithKeys() {
    const markerSet = getPlayerMarkerSet();
    if (!markerSet || !markerSet.markers) return [];
    return Array.from(markerSet.markers.entries()).map(([key, marker]) => ({ key, marker }));
  }

  // Very tolerant marker resolver:
  // - tries direct keys with undashed/dashed uuid
  // - scans keys (suffix match)
  // - scans marker fields (id, data.id, data.key, uuid/data.uuid)
  function getMarkerByUUID(uuid) {
    const markerSet = getPlayerMarkerSet();
    if (!markerSet) return null;
    const map = markerSet.markers;
    if (!map) return null;

    const norm = normalizeUUID(uuid);
    const dashed = dashUUID(norm);
    const candidates = [
      `bm-player-${norm}`,
      `bm-player-${dashed}`,
    ];

    // 1) Direct key lookups
    for (const key of candidates) {
      const m = map.get?.(key);
      if (m) return m;
    }

    // 2) Scan by key match
    for (const [key, m] of (map.entries?.() || [])) {
      if (typeof key !== "string") continue;
      const k = key.toLowerCase();
      if (
        k === `bm-player-${norm}` ||
        k === `bm-player-${dashed}` ||
        k.endsWith(norm) ||
        k.endsWith(dashed)
      ) return m;
    }

    // 3) Scan by marker fields
    for (const m of (map.values?.() || [])) {
      const mid = (m?.id ?? m?.data?.id ?? m?.data?.key ?? "").toString().toLowerCase();
      if (
        mid === `bm-player-${norm}` ||
        mid === `bm-player-${dashed}` ||
        mid.endsWith(norm) ||
        mid.endsWith(dashed)
      ) return m;

      const muuid = (m?.uuid ?? m?.data?.uuid ?? "").toString().replace(/-/g, "").toLowerCase();
      if (muuid && muuid === norm) return m;
    }

    // 4) Debug sample for quick inspection
    try {
      const sample = [];
      let i = 0;
      for (const [key, m] of (map.entries?.() || [])) {
        if (i++ >= 8) break;
        sample.push({
          key,
          id: m?.id,
          dataId: m?.data?.id,
          uuid: m?.uuid ?? m?.data?.uuid,
          label: m?.label || m?.data?.label,
        });
      }
      console.debug("No player marker matched. Sample entries:", sample);
    } catch {}

    return null;
  }

  async function waitForPlayers({ timeoutMs = 15000, intervalMs = 200 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const markerSet = getPlayerMarkerSet();
      if (markerSet?.markers?.size > 0) return true;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    console.warn("Timeout waiting for bm-players marker set to populate.");
    return false;
  }

  // --- Name resolution ---
  // 1) cache, 2) live marker label, 3) MineTools API
  async function getCurrentNameFromUUID(uuid) {
    const norm = normalizeUUID(uuid);

    const cached = getCachedName(norm);
    if (cached) return cached;

    const marker = getMarkerByUUID(norm);
    const label = (marker && (marker.label || marker.data?.label)) || null;
    if (label && typeof label === "string") {
      setCache(norm, label);
      return label;
    }

    try {
      const res = await fetch(`https://api.minetools.eu/uuid/${norm}`);
      if (!res.ok) throw new Error("MineTools API failed");
      const data = await res.json();
      if (data && data.name) {
        setCache(norm, data.name);
        return data.name;
      }
    } catch (err) {
      console.error("Error fetching name for UUID:", norm, err);
    }

    return null;
  }

  // Find UUID by player name via live markers (prefer label, then API)
  async function findUUIDByName(targetName) {
    if (!targetName) return null;
    const nameKey = String(targetName).trim().toLowerCase();

    const entries = getAllPlayerMarkersWithKeys();

    // Fast path: match on label
    for (const { key, marker } of entries) {
      const label = (marker && (marker.label || marker.data?.label)) || null;
      if (label && typeof label === "string" && label.trim().toLowerCase() === nameKey) {
        let uuidPart = null;
        if (typeof key === "string" && key.startsWith("bm-player-")) uuidPart = key.slice("bm-player-".length);
        if (uuidPart) {
          setCache(uuidPart, label.trim());
          return normalizeUUID(uuidPart);
        }
      }
    }

    // Slower path: resolve each uuid->name via cache/marker/api
    for (const { key } of entries) {
      if (typeof key !== "string") continue;
      let uuidPart = null;
      if (key.startsWith("bm-player-")) uuidPart = key.slice("bm-player-".length);
      if (!uuidPart) continue;

      const currentName = await getCurrentNameFromUUID(uuidPart);
      if (currentName && currentName.trim().toLowerCase() === nameKey) {
        return normalizeUUID(uuidPart);
      }
    }

    return null;
  }

  async function followPlayer(uuidOrName) {
    const markerSet = getPlayerMarkerSet();
    if (!markerSet) {
      console.warn("No player marker set found (bm-players)");
      return;
    }

    const input = String(uuidOrName || "").trim();
    let uuid;

    if (looksLikeUUID(input)) {
      uuid = normalizeUUID(input);
    } else {
      uuid = await findUUIDByName(input);
      if (!uuid) {
        console.warn("Could not find UUID for player name:", input);
        const keys = getAllPlayerMarkersWithKeys().map(e => e.key);
        console.debug("Available player marker keys:", keys);
        return;
      }
    }

    let marker = getMarkerByUUID(uuid);

    // Fallback: if we started with UUID, try via current name -> back to UUID
    if (!marker && looksLikeUUID(input)) {
      const maybeName = await getCurrentNameFromUUID(uuid);
      if (maybeName) {
        const retryUuid = await findUUIDByName(maybeName);
        if (retryUuid) marker = getMarkerByUUID(retryUuid);
      }
    }

    if (!marker) {
      console.warn("Marker not found for UUID:", dashUUID(uuid));
      const sample = getAllPlayerMarkersWithKeys().slice(0, 8).map(e => e.key);
      console.debug("Sample marker keys:", sample);
      return;
    }

    // Follow the marker
    bluemap.mapViewer.controlsManager.controls.followPlayerMarker(marker);

    const currentName = await getCurrentNameFromUUID(uuid);
    console.log("Now following player:", currentName || dashUUID(uuid), "UUID:", dashUUID(uuid));
  }

  // --- Bootstrapping from URL params ---
  async function main() {
    const ready = await waitForPlayers({ timeoutMs: 15000, intervalMs: 200 });
    if (!ready) {
      console.warn("Proceeding without confirmed bm-players readiness.");
    }

    const params = new URLSearchParams(window.location.search);
    const playerUUIDParam = params.get("follow_player");
    const playerNameParam = params.get("follow_player_name");

    const uuidParam = playerUUIDParam ? playerUUIDParam.trim() : null;
    const nameParam = playerNameParam ? playerNameParam.trim() : null;

    if (uuidParam) {
      followPlayer(uuidParam);
    } else if (nameParam) {
      followPlayer(nameParam);
    } else {
      console.log("No follow player parameter found in URL (use ?follow_player=<uuid> or ?follow_player_name=<name>)");
    }
  }

  // Run when BlueMap viewer is available
  if (window.bluemap?.mapViewer) {
    main();
  } else {
    const onReady = () => {
      if (window.bluemap?.mapViewer) {
        window.removeEventListener("load", onReady);
        main();
      }
    };
    window.addEventListener("load", onReady);
  }
})();
