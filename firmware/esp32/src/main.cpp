// Family hustle sync box, ESP32 edition.
//
// Serves the app (the hub build) and the sync API from one origin on the home
// Wi-Fi, at http://family-hustle.local/. The API is the contract in
// docs/pi-sync.md, unchanged, and is checked with the same test as the Pi:
//
//   FH_SYNC_URL=http://family-hustle.local FH_WRITE_TOKEN=… FH_READ_TOKEN=… npm run test:sync
//
// Design and reasons: docs/esp32-sync.md. Setup: README.md.

#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <time.h>
#include <esp_sntp.h>
#include <vector>
#include <algorithm>
#include "envelope.h"

static const size_t MAX_BODY = 512 * 1024;
static const uint32_t MIN_WRITE_GAP_MS = 2000;
static const size_t KEEP_HISTORY = 20;
static const char* HOSTNAME = "family-hustle";

// The app lives in the default LittleFS partition ("spiffs"), which
// `pio run -t uploadfs` replaces. The family lives here, in "state", which
// only this firmware writes. See partitions.csv.
fs::LittleFSFS stateFS;

AsyncWebServer server(80);
Preferences prefs;

String writeToken, readToken;

// what the box holds, kept in RAM so health checks and 409s never read flash
uint32_t version = 0;  // 0 = nothing stored
String updatedAt, updatedBy;
uint32_t lastWriteMs = 0;
bool haveWritten = false;

// ---- auth -------------------------------------------------------------------

bool sameToken(const String& given, const String& expected) {
  if (expected.length() < 32 || given.length() != expected.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < given.length(); i++) diff |= given[i] ^ expected[i];
  return diff == 0;
}

enum Role { NONE, READER, WRITER };

Role roleOf(AsyncWebServerRequest* req) {
  if (!req->hasHeader("Authorization")) return NONE;
  String h = req->header("Authorization");
  if (!h.startsWith("Bearer ")) return NONE;
  String t = h.substring(7);
  // compare against both, always, so timing says nothing about which matched
  bool w = sameToken(t, writeToken);
  bool r = sameToken(t, readToken);
  return w ? WRITER : r ? READER : NONE;
}

const char* roleName(Role r) { return r == WRITER ? "write" : r == READER ? "read" : "-"; }

// ---- responses -----------------------------------------------------------------

void sendStatus(AsyncWebServerRequest* req, int code) {
  AsyncWebServerResponse* res = req->beginResponse(code);
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

void sendJson(AsyncWebServerRequest* req, int code, const JsonDocument& doc) {
  String out;
  serializeJson(doc, out);
  AsyncWebServerResponse* res = req->beginResponse(code, "application/json", out);
  res->addHeader("Cache-Control", "no-store");
  req->send(res);
}

void logRequest(AsyncWebServerRequest* req, int code, Role role) {
  // the token's name, never the token or the family
  Serial.printf("%s %s %d %s\n", req->methodToString(), req->url().c_str(), code, roleName(role));
}

String isoNow() {
  time_t now = time(nullptr);
  struct tm t;
  gmtime_r(&now, &t);
  char buf[32];
  strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%S.000Z", &t);
  return buf;
}

// Only trust the clock once NTP has set it. After a reset the RTC can hold
// anything — a board on the bench read 2031-12-25 with no network at all —
// so "the time looks recent" is not evidence of anything.
volatile bool clockSynced = false;
void onTimeSync(struct timeval*) { clockSynced = true; }
bool clockIsSet() { return clockSynced; }

// ---- storage ------------------------------------------------------------------
//
// /state.json is byte for byte the body of GET /api/state:
//   {"version":13,"updatedAt":"…","updatedBy":"…","document":<as sent>}
// /history/<n>.json are earlier ones, renamed rather than copied.

std::vector<uint32_t> historyVersions() {
  std::vector<uint32_t> out;
  File dir = stateFS.open("/history");
  if (!dir || !dir.isDirectory()) return out;
  for (File f = dir.openNextFile(); f; f = dir.openNextFile()) {
    uint32_t v = strtoul(f.name(), nullptr, 10);
    if (v > 0) out.push_back(v);
  }
  std::sort(out.begin(), out.end());
  return out;
}

void pruneHistory() {
  std::vector<uint32_t> versions = historyVersions();
  while (versions.size() > KEEP_HISTORY) {
    stateFS.remove("/history/" + String(versions.front()) + ".json");
    versions.erase(versions.begin());
  }
}

void loadState() {
  if (stateFS.exists("/state.tmp")) stateFS.remove("/state.tmp");  // a write the power cut interrupted
  if (!stateFS.exists("/history")) stateFS.mkdir("/history");

  // A power cut between the two renames of a write leaves no state.json;
  // the newest history file is the one that was current.
  if (!stateFS.exists("/state.json")) {
    std::vector<uint32_t> versions = historyVersions();
    if (!versions.empty()) {
      stateFS.rename("/history/" + String(versions.back()) + ".json", "/state.json");
      Serial.println("recovered state.json from history");
    }
  }

  if (!stateFS.exists("/state.json")) return;
  File f = stateFS.open("/state.json", "r");
  if (!f) return;
  JsonDocument filter;
  filter["version"] = true;
  filter["updatedAt"] = true;
  filter["updatedBy"] = true;
  JsonDocument meta;
  if (deserializeJson(meta, f, DeserializationOption::Filter(filter)) == DeserializationError::Ok) {
    version = meta["version"] | 0;
    updatedAt = meta["updatedAt"] | "";
    updatedBy = meta["updatedBy"] | "";
  }
  f.close();
}

// ---- the API ------------------------------------------------------------------

void onHealth(AsyncWebServerRequest* req) {
  JsonDocument d;
  d["ok"] = true;
  d["version"] = version;
  sendJson(req, 200, d);
  logRequest(req, 200, NONE);
}

void onGet(AsyncWebServerRequest* req) {
  Role role = roleOf(req);
  int code;
  if (role == NONE) {
    sendStatus(req, code = 401);
  } else if (version == 0) {
    sendStatus(req, code = 204);
  } else {
    AsyncWebServerResponse* res = req->beginResponse(stateFS, "/state.json", "application/json");
    res->addHeader("Cache-Control", "no-store");
    req->send(res);
    code = 200;
  }
  logRequest(req, code, role);
}

// The body arrives in chunks. It is gathered whole into PSRAM, because the
// document has to be checked before anything is written. _tempObject is
// freed by the library with free(), which suits ps_malloc.
void onPutChunk(AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t index, size_t total) {
  if (total > MAX_BODY) return;
  if (index == 0) req->_tempObject = ps_malloc(total);
  if (!req->_tempObject) return;
  memcpy((uint8_t*)req->_tempObject + index, data, len);
}

int put(AsyncWebServerRequest* req) {
  Role role = roleOf(req);
  if (role == NONE) return 401;
  if (role != WRITER) return 403;
  if (req->contentLength() > MAX_BODY) return 413;
  if (haveWritten && millis() - lastWriteMs < MIN_WRITE_GAP_MS) return 429;
  lastWriteMs = millis();
  haveWritten = true;
  // with no clock, updatedAt would say 1970; better to be asked again later
  if (!clockIsSet()) return 503;

  const char* body = (const char*)req->_tempObject;
  size_t len = req->contentLength();
  if (!body || len == 0) return 400;

  JsonDocument filter;
  filter["expectedVersion"] = true;
  filter["updatedBy"] = true;
  filter["document"]["app"] = true;
  filter["document"]["format"] = true;
  JsonDocument head;
  // const char* makes ArduinoJson copy rather than unescape in place, which
  // would change the bytes about to be stored
  if (deserializeJson(head, body, len, DeserializationOption::Filter(filter)) != DeserializationError::Ok) return 400;
  if (head["document"]["app"] != "family-hustle" || !head["document"]["format"].is<int>()) return 400;
  if (!head["expectedVersion"].is<uint32_t>()) return 400;

  if (head["expectedVersion"].as<uint32_t>() != version) {
    JsonDocument c;
    c["version"] = version;
    if (version > 0) {
      c["updatedAt"] = updatedAt;
      c["updatedBy"] = updatedBy;
    }
    sendJson(req, 409, c);
    return -409;  // already sent
  }

  size_t docStart, docEnd;
  if (!envelope::findDocument(body, len, docStart, docEnd)) return 400;

  uint32_t next = version + 1;
  String at = isoNow();
  String by = head["updatedBy"] | "unknown";
  if (by.length() > 64) by = by.substring(0, 64);

  JsonDocument meta;  // escapes updatedBy properly
  meta["version"] = next;
  meta["updatedAt"] = at;
  meta["updatedBy"] = by;
  String prefix;
  serializeJson(meta, prefix);
  prefix.remove(prefix.length() - 1);  // drop the closing brace
  prefix += ",\"document\":";

  File f = stateFS.open("/state.tmp", "w");
  bool ok = f && f.print(prefix) == prefix.length() &&
            f.write((const uint8_t*)body + docStart, docEnd - docStart) == docEnd - docStart &&
            f.print("}") == 1;
  if (f) f.close();
  if (!ok) {
    stateFS.remove("/state.tmp");
    return 507;  // full
  }

  // LittleFS renames are atomic: after a power cut, each name points at a
  // whole file or none, and loadState() covers the gap between these two
  if (version > 0) stateFS.rename("/state.json", "/history/" + String(version) + ".json");
  stateFS.rename("/state.tmp", "/state.json");
  version = next;
  updatedAt = at;
  updatedBy = by;
  pruneHistory();

  JsonDocument res;
  res["version"] = next;
  res["updatedAt"] = at;
  sendJson(req, 200, res);
  return -200;
}

void onPut(AsyncWebServerRequest* req) {
  int code = put(req);
  if (code > 0) sendStatus(req, code);
  logRequest(req, code < 0 ? -code : code, roleOf(req));
}

// ---- setup over USB serial --------------------------------------------------------
//
// Wi-Fi and tokens are typed in once over USB and kept in NVS. They are never
// compiled in, so they never end up in the repo or in a shared .bin.

enum Prompt { IDLE, SSID, PASSWORD, WRITE_TOKEN, READ_TOKEN };
Prompt prompt = IDLE;
String pendingSsid, pendingWrite;

void help() {
  Serial.println("commands: wifi, scan, tokens, status, reboot");
}

// ---- wi-fi ---------------------------------------------------------------------

// read once at boot; changing it over serial saves and reboots
String ssidCache;
String savedSsid() { return ssidCache; }

uint8_t lastDisconnect = 0;
uint32_t lastAttemptMs = 0;
static const uint32_t RETRY_WIFI_MS = 20000;

void joinWifi() {
  String ssid = savedSsid();
  if (ssid.isEmpty()) return;
  lastAttemptMs = millis();
  WiFi.begin(ssid.c_str(), prefs.isKey("pass") ? prefs.getString("pass").c_str() : "");
}

// Saying "not connected" and nothing else leaves a person guessing between a
// typo, a wrong password and a 5 GHz network. The reason Wi-Fi gives is
// usually enough to tell which.
void onWifiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    lastDisconnect = 0;
    Serial.printf("wifi: connected as %s — open http://%s.local/\n", WiFi.localIP().toString().c_str(), HOSTNAME);
  } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    uint8_t reason = info.wifi_sta_disconnected.reason;
    if (reason == lastDisconnect) return;  // once per reason, not every retry
    lastDisconnect = reason;
    Serial.printf("wifi: could not join \"%s\": %s (%u)\n", savedSsid().c_str(),
                  WiFi.disconnectReasonName((wifi_err_reason_t)reason), reason);
    switch (reason) {
      case WIFI_REASON_NO_AP_FOUND:
        Serial.println("  the board cannot see that network. it only sees 2.4 GHz — type `scan` to list what it can see.");
        break;
      case WIFI_REASON_AUTH_FAIL:
      case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
      case WIFI_REASON_HANDSHAKE_TIMEOUT:
      case WIFI_REASON_802_1X_AUTH_FAILED:
        Serial.println("  usually the wrong password. type `wifi` to enter it again.");
        break;
      default:
        break;
    }
  }
}

const char* authName(wifi_auth_mode_t a) {
  switch (a) {
    case WIFI_AUTH_OPEN: return "open";
    case WIFI_AUTH_WEP: return "wep";
    case WIFI_AUTH_WPA_PSK: return "wpa";
    case WIFI_AUTH_WPA2_PSK: return "wpa2";
    case WIFI_AUTH_WPA_WPA2_PSK: return "wpa/wpa2";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "wpa2-enterprise (not supported)";
    case WIFI_AUTH_WPA3_PSK: return "wpa3";
    case WIFI_AUTH_WPA2_WPA3_PSK: return "wpa2/wpa3";
    default: return "other";
  }
}

void scan() {
  Serial.println("scanning…");
  // the radio will not scan while it is busy joining, so stop trying first
  WiFi.disconnect(false, false);
  delay(100);
  int n = WiFi.scanNetworks();
  lastAttemptMs = millis();  // and give the scan's results a moment before retrying
  if (n < 0) {
    Serial.printf("the scan failed (%d). try again in a few seconds.\n", n);
    return;
  }
  if (n == 0) {
    Serial.println("no networks found at all. if there are any nearby, check the board's antenna.");
    return;
  }
  String ssid = savedSsid();
  for (int i = 0; i < n; i++) {
    Serial.printf("  %s\"%s\"  signal %d dBm  channel %d  %s\n", WiFi.SSID(i) == ssid ? "* " : "  ",
                  WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i), authName(WiFi.encryptionType(i)));
  }
  if (!ssid.isEmpty()) Serial.println("* = the saved network. names must match exactly, capitals and spaces included.");
  WiFi.scanDelete();
}

void status() {
  String ssid = savedSsid();
  if (ssid.isEmpty()) Serial.println("wifi: not set up — type `wifi`");
  else if (WiFi.isConnected())
    Serial.printf("wifi: connected to \"%s\" as %s, signal %d dBm\n", ssid.c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
  else
    Serial.printf("wifi: trying \"%s\"%s%s\n", ssid.c_str(), lastDisconnect ? " — last failure: " : "",
                  lastDisconnect ? WiFi.disconnectReasonName((wifi_err_reason_t)lastDisconnect) : "");
  Serial.printf("tokens: %s\n", writeToken.length() >= 32 && readToken.length() >= 32 ? "set" : "NOT SET");
  Serial.printf("clock: %s\n", clockIsSet() ? isoNow().c_str() : "not set yet");
  Serial.printf("family: version %u%s\n", version, version ? (", by " + updatedBy).c_str() : "");
  Serial.printf("storage: %u of %u KB used, %u versions of history\n", (unsigned)(stateFS.usedBytes() / 1024),
                (unsigned)(stateFS.totalBytes() / 1024), (unsigned)historyVersions().size());
  Serial.printf("psram free: %u KB\n", (unsigned)(ESP.getFreePsram() / 1024));
}

void onLine(String line) {
  line.trim();
  switch (prompt) {
    case SSID:
      pendingSsid = line;
      prompt = PASSWORD;
      Serial.println("wi-fi password:");
      return;
    case PASSWORD:
      prefs.putString("ssid", pendingSsid);
      prefs.putString("pass", line);
      prompt = IDLE;
      Serial.println("saved. rebooting to join it.");
      delay(200);
      ESP.restart();
      return;
    case WRITE_TOKEN:
      if (line.length() < 32) {
        Serial.println("too short — use `openssl rand -hex 32`. write token:");
        return;
      }
      pendingWrite = line;
      prompt = READ_TOKEN;
      Serial.println("read token:");
      return;
    case READ_TOKEN:
      if (line.length() < 32 || line == pendingWrite) {
        Serial.println("needs 32+ characters and must differ from the write token. read token:");
        return;
      }
      prefs.putString("write", pendingWrite);
      prefs.putString("read", line);
      writeToken = pendingWrite;
      readToken = line;
      pendingWrite = "";
      prompt = IDLE;
      Serial.println("tokens saved.");
      return;
    case IDLE:
      break;
  }
  if (line == "wifi") {
    prompt = SSID;
    Serial.println("wi-fi name:");
  } else if (line == "tokens") {
    prompt = WRITE_TOKEN;
    Serial.println("write token:");
  } else if (line == "status") {
    status();
  } else if (line == "scan") {
    scan();
  } else if (line == "reboot") {
    ESP.restart();
  } else if (line.length()) {
    help();
  }
}

// ---- wiring ------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\nfamily hustle sync box");

  if (!psramFound()) Serial.println("WARNING: no PSRAM — writes larger than a few KB will fail");

  prefs.begin("hustle", false);
  writeToken = prefs.isKey("write") ? prefs.getString("write") : "";
  readToken = prefs.isKey("read") ? prefs.getString("read") : "";

  if (!LittleFS.begin(false)) Serial.println("app filesystem missing — run `pio run -t uploadfs`");
  if (!stateFS.begin(true, "/state", 10, "state")) Serial.println("ERROR: could not mount the state partition");
  loadState();

  ssidCache = prefs.isKey("ssid") ? prefs.getString("ssid") : "";
  WiFi.mode(WIFI_STA);  // also needed for `scan` before any network is saved
  WiFi.setHostname(HOSTNAME);
  WiFi.onEvent(onWifiEvent);
  if (savedSsid().isEmpty()) {
    Serial.println("no wi-fi yet. type `wifi` to set it up.");
  } else {
    joinWifi();
    for (int i = 0; i < 40 && !WiFi.isConnected(); i++) delay(250);
  }

  sntp_set_time_sync_notification_cb(onTimeSync);
  configTzTime("UTC0", "pool.ntp.org", "time.google.com");
  MDNS.begin(HOSTNAME);
  MDNS.addService("http", "tcp", 80);

  server.on("/api/health", HTTP_GET, onHealth);
  server.on("/api/state", HTTP_GET, onGet);
  server.on("/api/state", HTTP_PUT, onPut, nullptr, onPutChunk);

  // the app: hashed assets never change, index.html and version.json always
  // might. a .gz next to a file is served in its place.
  server.serveStatic("/assets/", LittleFS, "/www/assets/").setCacheControl("public, max-age=31536000, immutable");
  server.serveStatic("/", LittleFS, "/www/").setDefaultFile("index.html").setCacheControl("no-cache");
  server.onNotFound([](AsyncWebServerRequest* req) { req->send(404); });
  server.begin();

  status();
  help();
}

void loop() {
  // keep trying: a router that reboots, or a box that came up first, should
  // not need anyone to touch it
  if (!WiFi.isConnected() && !savedSsid().isEmpty() && millis() - lastAttemptMs > RETRY_WIFI_MS) joinWifi();

  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    // \r is dropped rather than treated as an end of line, or a \r\n
    // terminal would answer the next prompt with an empty line
    if (c == '\r') continue;
    if (c == '\n') {
      if (line.length() || prompt != IDLE) onLine(line);
      line = "";
    } else {
      line += c;
    }
  }
  delay(10);
}
