// The light in the house's attic window: the board's RGB LED.
//
//   warm glow     holding the family and ready — someone's home
//   warm flash    a phone just saved a change, fading back to the glow
//   blue breath   no family on the box yet
//   amber breath  not on Wi-Fi, or the clock is not set, so saves would fail
//
// Dim on purpose: it lives on a shelf in a living room, and is on all night.
// The LED is GPIO48 on most N16R8 boards (and DevKitC-1 v1.0), GPIO38 on a
// DevKitC-1 v1.1; `led pin <n>` over serial changes it.
#pragma once
#include <Arduino.h>
#include <math.h>

namespace light {

enum Mood { NOT_READY, EMPTY, HOME };

struct Colour {
  uint8_t r, g, b;
};

// warm white, the colour of a lamp through a window
static const Colour WARM = {255, 120, 30};
static const Colour BLUE = {40, 90, 255};
static const Colour AMBER = {255, 70, 0};

static uint8_t pin = 48;
static uint8_t glow = 18;  // 0–255; the steady level, kept low
static bool enabled = true;
static volatile uint32_t lastSaveMs = 0;
static bool haveSaved = false;
static uint32_t testUntilMs = 0;

static uint32_t shown = 0xFFFFFFFF;  // what the LED has now, packed

inline void write(uint8_t r, uint8_t g, uint8_t b) {
  uint32_t packed = (uint32_t)pin << 24 | (uint32_t)r << 16 | (uint32_t)g << 8 | b;
  if (packed == shown) return;
  shown = packed;
  neopixelWrite(pin, r, g, b);
}

inline void show(Colour c, float level) {
  level = constrain(level, 0.0f, 1.0f);
  write((uint8_t)(c.r * level), (uint8_t)(c.g * level), (uint8_t)(c.b * level));
}

inline void off() { write(0, 0, 0); }

// call from the web server when a PUT is stored
inline void saved() {
  lastSaveMs = millis();
  haveSaved = true;
}

// a slow breath, 0..1, about every four seconds
inline float breath(uint32_t now) { return 0.5f - 0.5f * cosf(now / 4000.0f * 2 * PI); }

// called from loop(); cheap, and only writes when the colour changes
inline void update(Mood mood) {
  static uint32_t lastWrite = 0;
  uint32_t now = millis();
  if (now - lastWrite < 20) return;  // 50 frames a second is plenty
  lastWrite = now;
  if (!enabled || now < testUntilMs) return;

  float base = glow / 255.0f;
  switch (mood) {
    case HOME: {
      // a flash on each save, fading over two seconds
      float flash = 0;
      if (haveSaved && now - lastSaveMs < 2000) flash = 1.0f - (now - lastSaveMs) / 2000.0f;
      show(WARM, base + (0.55f - base) * flash * flash);
      break;
    }
    case EMPTY:
      show(BLUE, base * (0.15f + 0.85f * breath(now)));
      break;
    case NOT_READY:
      show(AMBER, base * (0.15f + 0.85f * breath(now)));
      break;
  }
}

// `led` over serial: each mood for a moment, so you can see the LED works
// and which pin it is on
inline void test() {
  Serial.printf("lighting GPIO%u: warm, flash, blue, amber, off\n", pin);
  testUntilMs = millis() + 6000;
  Colour steps[] = {WARM, WARM, BLUE, AMBER};
  float levels[] = {glow / 255.0f, 0.55f, glow / 255.0f, glow / 255.0f};
  for (int i = 0; i < 4; i++) {
    show(steps[i], levels[i]);
    delay(1200);
  }
  off();
  delay(600);
}

}  // namespace light
