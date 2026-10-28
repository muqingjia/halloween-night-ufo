// StickS3 UFO controller: streams IMU + buttons over USB serial.
// Screen: dim face when idle, full-brightness mint glow while beaming, amber when the beam tank is empty.
// Hold the side button for 3 s to power off.
// PC -> stick: "B0|B1|B2" beam state, "G<value>,<combo>" grab event (beep + white flash).
#include <M5Unified.h>

enum Look { IDLE, BEAM, EMPTY, FLASH };
Look shown = FLASH;
bool pressed = false, pcEmpty = false;
uint32_t flashUntil = 0, chimeAt = 0;
int chimeFreq = 0;
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

void onGrab(int value, int combo) {
  int f = 520 + min(value, 150) * 6;
  M5.Speaker.tone(f, 90);
  if (combo > 1) { chimeFreq = f * 3 / 2; chimeAt = millis() + 100; }  // rising second note for combos
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
  M5.Speaker.setVolume(170);
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
  if (chimeAt && millis() >= chimeAt) { M5.Speaker.tone(chimeFreq, 110); chimeAt = 0; }

  if (millis() < flashUntil) draw(FLASH);
  else if (pressed) draw(pcEmpty ? EMPTY : BEAM);
  else draw(IDLE);
  delay(20);
}
