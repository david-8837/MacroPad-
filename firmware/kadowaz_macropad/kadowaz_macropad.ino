/*
 * KADOWAZ IND. DECK-09 Physical Firmware Sketch
 * Compatible with Raspberry Pi Pico (RP2040), RP2040-Zero, Arduino Pro Micro (ATmega32U4), or ESP32-S3
 * 
 * Hardware Layout:
 * - 3x3 Key Matrix (9 switches)
 * - Rotary Encoder (Pins A, B, and Push Switch)
 * - I2C OLED Screen (SSD1306 128x32 or 128x64 on SDA/SCL)
 * - Dynamic Channel Stepper Display ([01] / [02] / [03] with dashed line track)
 * - Bidirectional CDC Serial & HID integration with KADOWAZ Deck Studio
 */

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 32
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// 3x3 Key Matrix Pin Mapping (Example pins for RP2040 / RP2040-Zero)
const byte ROW_PINS[3] = { 2, 3, 4 };
const byte COL_PINS[3] = { 5, 6, 7 };

// Rotary Encoder Pins
const byte ENCODER_PIN_A = 8;
const byte ENCODER_PIN_B = 9;
const byte ENCODER_PIN_SW = 10;

// Channel State (1, 2, or 3)
uint8_t currentChannel = 1;
const unsigned long HOLD_THRESHOLD_MS = 800;

// State tracking
bool lastKeyStates[9] = { false };
int lastEncoderA = LOW;
unsigned long swPressStartTime = 0;
bool swIsPressed = false;
bool swHoldTriggered = false;

/*
 * Draw the Channel Stepper Track on OLED (128x32)
 * Replicates the exact industrial minimalist layout:
 * - Horizontal dashed line track
 * - Inverted high-contrast active channel badge: [01], [02], or [03]
 */
void drawChannelScreen(uint8_t channel) {
  display.clearDisplay();

  const int lineY = 14;   // Center vertical line
  const int lineH = 3;    // Line thickness
  const int badgeY = 8;
  const int badgeH = 16;
  const int badgeW = 28;
  const int badgeR = 3;   // Rounded corner radius

  int badgeX = 50; // default for channel 2 (centered at screen width 128)

  if (channel == 1) {
    badgeX = 16;
    // Active badge at Slot 1
    display.fillRoundRect(badgeX, badgeY, badgeW, badgeH, badgeR, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(badgeX + 8, badgeY + 4);
    display.print(F("01"));

    // Track continuation to the right
    display.fillRect(52, lineY, 20, lineH, SSD1306_WHITE);
    display.fillRect(78, lineY, 18, lineH, SSD1306_WHITE);
    display.fillRect(102, lineY, 18, lineH, SSD1306_WHITE);
  } 
  else if (channel == 2) {
    badgeX = 50;
    // Track dash on the left
    display.fillRect(24, lineY, 20, lineH, SSD1306_WHITE);

    // Active badge at Slot 2 (Center)
    display.fillRoundRect(badgeX, badgeY, badgeW, badgeH, badgeR, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(badgeX + 8, badgeY + 4);
    display.print(F("02"));

    // Two dashed lines on the right
    display.fillRect(84, lineY, 18, lineH, SSD1306_WHITE);
    display.fillRect(108, lineY, 14, lineH, SSD1306_WHITE);
  } 
  else { // channel 3
    badgeX = 84;
    // Track dashes on the left
    display.fillRect(10, lineY, 18, lineH, SSD1306_WHITE);
    display.fillRect(34, lineY, 18, lineH, SSD1306_WHITE);
    display.fillRect(58, lineY, 20, lineH, SSD1306_WHITE);

    // Active badge at Slot 3 (Right)
    display.fillRoundRect(badgeX, badgeY, badgeW, badgeH, badgeR, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(badgeX + 8, badgeY + 4);
    display.print(F("03"));

    // End dash
    display.fillRect(118, lineY, 6, lineH, SSD1306_WHITE);
  }

  display.display();
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(20); // readStringUntil() must not stall key scanning for its 1s default

  // Setup Matrix Pins
  for (int r = 0; r < 3; r++) {
    pinMode(ROW_PINS[r], OUTPUT);
    digitalWrite(ROW_PINS[r], HIGH);
  }
  for (int c = 0; c < 3; c++) {
    pinMode(COL_PINS[c], INPUT_PULLUP);
  }

  // Setup Encoder Pins
  pinMode(ENCODER_PIN_A, INPUT_PULLUP);
  pinMode(ENCODER_PIN_B, INPUT_PULLUP);
  pinMode(ENCODER_PIN_SW, INPUT_PULLUP);
  lastEncoderA = digitalRead(ENCODER_PIN_A);

  // Setup OLED Display
  if (display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    drawChannelScreen(currentChannel);
  }
}

void loop() {
  // 1. Scan 3x3 Switch Matrix
  int keyIndex = 0;
  for (int r = 0; r < 3; r++) {
    digitalWrite(ROW_PINS[r], LOW);
    for (int c = 0; c < 3; c++) {
      bool isPressed = (digitalRead(COL_PINS[c]) == LOW);
      if (isPressed != lastKeyStates[keyIndex]) {
        lastKeyStates[keyIndex] = isPressed;
        if (isPressed) {
          Serial.print(F("KEY:"));
          Serial.print(keyIndex);
          Serial.println(F(":DOWN"));
        } else {
          Serial.print(F("KEY:"));
          Serial.print(keyIndex);
          Serial.println(F(":UP"));
        }
      }
      keyIndex++;
    }
    digitalWrite(ROW_PINS[r], HIGH);
  }

  // 2. Scan Rotary Encoder Detents (CW / CCW)
  int currentEncoderA = digitalRead(ENCODER_PIN_A);
  if (currentEncoderA != lastEncoderA && currentEncoderA == LOW) {
    if (digitalRead(ENCODER_PIN_B) != currentEncoderA) {
      Serial.println(F("ENC:CW"));
    } else {
      Serial.println(F("ENC:CCW"));
    }
  }
  lastEncoderA = currentEncoderA;

  // 3. Scan Encoder Push Button & Hold Detection for Channel Cycling
  bool currentSw = (digitalRead(ENCODER_PIN_SW) == LOW); // LOW when pressed
  if (currentSw && !swIsPressed) {
    // Switch just pressed down
    swIsPressed = true;
    swPressStartTime = millis();
    swHoldTriggered = false;
    Serial.println(F("ENC:DOWN"));
  } 
  else if (currentSw && swIsPressed && !swHoldTriggered) {
    // Switch currently held down -> check threshold
    if (millis() - swPressStartTime >= HOLD_THRESHOLD_MS) {
      swHoldTriggered = true;
      // Cycle through 3 channels: 1 -> 2 -> 3 -> 1
      currentChannel = (currentChannel % 3) + 1;
      drawChannelScreen(currentChannel);
      
      Serial.print(F("LAYER:"));
      Serial.println(currentChannel);
      Serial.print(F("CHANNEL:"));
      Serial.println(currentChannel);
      Serial.println(F("ENC:HOLD_SWITCH"));
    }
  } 
  else if (!currentSw && swIsPressed) {
    // Switch released
    swIsPressed = false;
    if (!swHoldTriggered) {
      // Released early -> Instant Tap!
      Serial.println(F("ENC:UP"));
    }
    swHoldTriggered = false;
  }

  // 4. Handle incoming commands from Desktop Software
  if (Serial.available()) {
    String incoming = Serial.readStringUntil('\n');
    incoming.trim();

    if (incoming.startsWith("OLED:LAYER:") || incoming.startsWith("OLED:CH:")) {
      int prefixLen = incoming.startsWith("OLED:LAYER:") ? 11 : 8;
      int ch = incoming.substring(prefixLen).toInt();
      if (ch >= 1 && ch <= 3) {
        currentChannel = ch;
        drawChannelScreen(currentChannel);
      }
    } else if (incoming.startsWith("OLED:")) {
      display.clearDisplay();
      display.setTextColor(SSD1306_WHITE);
      display.setCursor(0, 8);
      display.println(incoming.substring(5));
      display.display();
    }
  }

  delay(5); // Debounce sampling interval
}
