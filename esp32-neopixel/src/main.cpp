#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_NeoPixel.h>
#include "config.h"

// Data pin: XIAO ESP32-C6 D2 (GPIO2) → 330Ω resistor → NeoPixel DIN
#define LED_PIN 2
#define LED_COUNT 16
#define POLL_INTERVAL_MS 60000

Adafruit_NeoPixel ring(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

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

bool fetchYellowAlert() {
  if (!connectWiFi()) {
    return false;
  }

  HTTPClient http;
  String url = String("http://") + HEALTH_BOARD_HOST + ":" + String(HEALTH_BOARD_PORT) + "/api/ring-status";
  http.begin(url);
  http.setTimeout(10000);

  const int statusCode = http.GET();
  if (statusCode != HTTP_CODE_OK) {
    Serial.printf("Med-Alert Board HTTP error: %d\n", statusCode);
    http.end();
    return false;
  }

  const String body = http.getString();
  http.end();
  return body.indexOf("\"ring_color\":\"yellow\"") >= 0;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Med-Alert Board - NeoPixel status ring");
  Serial.println("Yellow = latest HR or SpO2 is 10+ below 7-day average");

  ring.begin();
  ring.setBrightness(64);
  ring.clear();
  ring.show();

  connectWiFi();
}

void loop() {
  const bool alert = fetchYellowAlert();

  if (alert) {
    Serial.println("YELLOW - check in (HR or SpO2 below 7-day average)");
    fillRing(ring.Color(255, 200, 0));
  } else {
    Serial.println("GREEN - OK");
    fillRing(ring.Color(0, 180, 0));
  }

  delay(POLL_INTERVAL_MS);
}
