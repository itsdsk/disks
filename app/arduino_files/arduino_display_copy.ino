// reference: http://www.instructables.com/id/Interface-Python-and-Arduino-with-pySerial/

// LED programming objects
#include "FastLED.h"
#define DATA_PIN 5
#define NUM_LEDS 32
#define COLOR_ORDER BRG
CRGB leds[NUM_LEDS];

// baudrate (higher is faster refresh rate)
#define serialRate 460800

// data header
uint8_t prefix[] = {'A', 'd', 'a'}, hi, lo, chk, i;
//const uint8_t header[4] = { 0xDE, 0xAD, 0xBE, 0xEF };

void setup()
{
  // initialise LEDs
  FastLED.addLeds<WS2812B, DATA_PIN, BRG>(leds, NUM_LEDS);

  // initialise randomness
  randomSeed(analogRead(0));

  // initial RGB flash
  LEDS.showColor(CRGB(255, 0, 0));
  delay(500);
  LEDS.showColor(CRGB(0, 255, 0));
  delay(500);
  LEDS.showColor(CRGB(0, 0, 255));
  delay(500);
  LEDS.showColor(CRGB(0, 0, 0));

  // initialise serial USB communication
  Serial.begin(serialRate);
  Serial.print("Ada\n"); // Send "Magic Word" string to host
}


void loop() {
  // wait for first byte of Magic Word
  for(i = 0; i < sizeof prefix; ++i) {
    waitLoop: while (!Serial.available()) ;;
    // Check next byte in Magic Word
    if(prefix[i] == Serial.read()) continue;
    // otherwise, start over
    i = 0;
    goto waitLoop;
  }
 
  // Hi, Lo, Checksum
 
  while (!Serial.available()) ;;
  hi=Serial.read();
  while (!Serial.available()) ;;
  lo=Serial.read();
  while (!Serial.available()) ;;
  chk=Serial.read();
 
  // if checksum does not match go back to wait
  if (chk != (hi ^ lo ^ 0x55))
  {
    i=0;
    goto waitLoop;
  }
 
  memset(leds, 0, NUM_LEDS * sizeof(struct CRGB));
  // read the transmission data and set LED values
  for (uint8_t i = 0; i < NUM_LEDS; i++) {
    byte r, g, b;    
    while(!Serial.available());
    r = Serial.read();
    while(!Serial.available());
    g = Serial.read();
    while(!Serial.available());
    b = Serial.read();
    leds[i].r = r;
    leds[i].g = g;
    leds[i].b = b;
  }
  // shows new values
 FastLED.show();
}
