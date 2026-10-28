// StickS3 UFO controller: streams IMU + buttons over USB serial.
// Screen: dim face when idle, full-brightness mint glow while beaming, amber when the beam tank is empty.
// Hold the side button for 3 s to power off.
// PC -> stick: "B0|B1|B2" beam state, "G<value>,<combo>" grab event (beep + white flash).
#include <M5Unified.h>

enum Look { IDLE, BEAM, EMPTY, FLASH };
Look shown = FLASH;
bool pressed = false, pcEmpty = false;
uint32_t flashUntil = 0, noteEnd = 0;

// queued notes so rapid grabs never cut each other off: every grab gets its own jingle
struct Note { uint16_t f, ms; };
Note q[24];
int qHead = 0, qLen = 0;
void push(uint16_t f, uint16_t ms) {
  if (qLen < 24) { q[(qHead + qLen) % 24] = {f, ms}; qLen++; }
}
String rx;

void draw(Look l) {
  if (l == shown) return;
  shown = l;
  auto &d = M5.Display;
  switch (l) {
    case BEAM:  d.setBrightness(255); d.fillScreen(d.color565(150, 255, 225)); break;
    case EMPTY: d.setBrightness(160); d.fillScreen(d.color565(255, 150, 40)); break;
    case FLASH: d.setBrightness(255); d.fillScreen(TFT_WHITE); break;
    default:
      d.setBrightness(50);
      d.fillScreen(d.color565(28, 18, 52));
      d.setTextColor(d.color565(150, 140, 210));
      d.setTextDatum(middle_center);
      d.setTextSize(3);
      d.drawString("(o.o)", d.width() / 2, d.height() / 2);
  }
}

// jingle per score tier: tiny loot = one blip ... houses and barns = a fanfare
void onGrab(int value, int combo) {
  if (value <= 10) {                       // rocks, fences, cows, pumpkins
    push(880, 90);
  } else if (value <= 20) {                // sheep, pigs, crows, hay, trees
    push(784, 80); push(1047, 110);
  } else if (value <= 40) {                // ghosts, lamps, poles, cars
    push(659, 80); push(880, 80); push(1319, 130);
  } else if (value <= 80) {                // tractors, wagons, silos
    push(523, 90); push(659, 90); push(784, 90); push(1047, 170);
  } else {                                 // houses, barns
    push(523, 100); push(659, 100); push(784, 100); push(1047, 120); push(1568, 260);
  }
  if (combo > 1) push(1400 + min(combo, 5) * 120, 120);  // higher sparkle the longer the combo
  flashUntil = millis() + 120;
}

void handle(const String &m) {
  if (m.startsWith("B")) {
    pcEmpty = m.charAt(1) == '2';
  } else if (m.startsWith("G")) {
    int c = m.indexOf(',');
    onGrab(m.substring(1, c).toInt(), c > 0 ? m.substring(c + 1).toInt() : 1);
  }
}

void setup() {
  auto cfg = M5.config();
  M5.begin(cfg);
  M5.Speaker.setVolume(255);
  Serial.begin(115200);
  draw(IDLE);
}

void loop() {
  M5.update();
  float ax, ay, az, gx, gy, gz;
  M5.Imu.getAccel(&ax, &ay, &az);
  M5.Imu.getGyro(&gx, &gy, &gz);
  bool now = M5.BtnA.isPressed();
  if (now && !pressed) M5.Speaker.tone(330, 25);   // tiny click when the beam engages
  pressed = now;
  int b = M5.BtnB.wasPressed() ? 1 : 0;
  if (M5.BtnB.pressedFor(3000)) {  // hold the side button 3 s to power off
    auto &d = M5.Display;
    d.setBrightness(80); d.fillScreen(TFT_BLACK); d.setTextColor(d.color565(150, 140, 210));
    d.setTextDatum(middle_center); d.setTextSize(3); d.drawString("bye", d.width() / 2, d.height() / 2);
    M5.Speaker.tone(440, 80); delay(150); M5.Speaker.tone(330, 120); delay(900);
    M5.Power.powerOff();
  }
  Serial.printf("%.3f,%.3f,%.3f,%.1f,%.1f,%.1f,%d,%d\n", ax, ay, az, gx, gy, gz, pressed ? 1 : 0, b);

  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') { handle(rx); rx = ""; }
    else if (rx.length() < 32) rx += c;
  }
  if (qLen && millis() >= noteEnd) {
    Note n = q[qHead]; qHead = (qHead + 1) % 24; qLen--;
    M5.Speaker.tone(n.f, n.ms);
    noteEnd = millis() + n.ms + 25;
  }

  if (millis() < flashUntil) draw(FLASH);
  else if (pressed) draw(pcEmpty ? EMPTY : BEAM);
  else draw(IDLE);
  delay(20);
}
