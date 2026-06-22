#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_NeoPixel.h>
#include "config.h"

// Data pin: XIAO ESP32-C6 D2 (GPIO2) → 330Ω resistor → NeoPixel DIN
#define LED_PIN 2
#define LED_COUNT 16
#define POLL_INTERVAL_MS 60000
#define FLASH_INTERVAL_MS 500

Adafruit_NeoPixel ring(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

String ringColor = "green";
uint32_t lastPollMs = 0;
uint32_t lastFlashMs = 0;
bool flashOn = false;

void fillRing(uint32_t color) {
  for (uint16_t i = 0; i < LED_COUNT; i++) {
    ring.setPixelColor(i, color);
  }
  ring.show();
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t timeoutMs = 20000;
  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected, IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("Wi-Fi connection failed");
  return false;
}

String fetchRingColor() {
  if (!connectWiFi()) {
    return "";
  }

  HTTPClient http;
  String url = String("http://") + HEALTH_BOARD_HOST + ":" + String(HEALTH_BOARD_PORT) + "/api/ring-status";
  http.begin(url);
  http.setTimeout(10000);

  const int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Med-Alert Board HTTP error: %d\n", statusCode);
    http.end();
    return "";
  }

  const String body = http.getString();
  http.end();

  if (body.indexOf("\"ring_color\":\"red\"") >= 0) {
    return "red";
  }
  if (body.indexOf("\"ring_color\":\"yellow\"") >= 0) {
    return "yellow";
  }
  if (body.indexOf("\"ring_color\":\"blue\"") >= 0) {
    return "blue";
  }
  if (body.indexOf("\"ring_color\":\"green\"") >= 0) {
    return "green";
  }
  return "";
}

void applyRingColor(const String &color) {
  if (color == "yellow") {
    Serial.println("YELLOW - check in (HR or SpO2 below 7-day average)");
    fillRing(ring.Color(255, 200, 0));
    return;
  }

  if (color == "blue") {
    Serial.println("BLUE - charge Oura ring (battery at or below 25%)");
    fillRing(ring.Color(80, 180, 255));
    return;
  }

  if (color != "red") {
    Serial.println("GREEN - OK");
    fillRing(ring.Color(0, 180, 0));
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Med-Alert Board - NeoPixel status ring");
  Serial.println("Green = OK | Yellow = HR/SpO2 alert | Blue = battery low | Red flash = HR below 40 bpm");

  ring.begin();
  ring.setBrightness(64);
  ring.clear();
  ring.show();

  connectWiFi();
  ringColor = fetchRingColor();
  if (ringColor.length() == 0) {
    ringColor = "green";
  }
  lastPollMs = millis();
  applyRingColor(ringColor);
}

void loop() {
  const uint32_t now = millis();

  if (now - lastPollMs >= POLL_INTERVAL_MS) {
    const String fetched = fetchRingColor();
    if (fetched.length() > 0) {
      ringColor = fetched;
    }
    lastPollMs = now;

    if (ringColor != "red") {
      applyRingColor(ringColor);
    }
  }

  if (ringColor == "red") {
    if (now - lastFlashMs >= FLASH_INTERVAL_MS) {
      flashOn = !flashOn;
      if (flashOn) {
        Serial.println("RED FLASH - heart rate below 40 bpm");
        fillRing(ring.Color(255, 0, 0));
      } else {
        fillRing(ring.Color(0, 0, 0));
      }
      lastFlashMs = now;
    }
  }

  delay(10);
}
