# Halloween Night

Tilt an **M5Stack StickS3** to fly a UFO over a spooky farm and beam up everything in 60 seconds.

- **Input** — StickS3 tilt (IMU) steers the UFO · blue button (hold) = tractor beam · side button = start / re-centre
- **Output** — low-poly 3D game in the browser · StickS3 screen glows while beaming · StickS3 beeps on every grab
- **Gameplay** — 3000 points in 60 s · heavy things drain the beam · combos up to ×5 · ghosts rise only when beamed · press `D` for a live dashboard

## Run

1. Flash `firmware/ufo_controller` to the StickS3 (Arduino IDE, board *M5StickS3*, USB CDC On Boot: Enabled).
2. `python3 -m http.server 8765 -d web`
3. Open http://localhost:8765 in **Chrome**, click **Connect StickS3**, then **Start**.

No controller? Arrow keys fly, Space beams, Enter starts.
