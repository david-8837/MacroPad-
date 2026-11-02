#!/usr/bin/env python3
"""Generate the printable, source-map-based V1/V2 hand-wiring reference.

Requires reportlab. This is a documentation diagram, not an electrical approval.
"""
from pathlib import Path
from check_board import board_h_pins, HEADER_PIN
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'Macropad_V1_V2_Wiring_Guide.pdf'
# Stop generation if the hardware source diverges from the printed diagram.
pins = board_h_pins((ROOT / 'firmware/include/board.h').read_text())
assert pins['keys'] == [0, 1, 2, 3, 4, 5, 6, 11, 12]
assert [pins[k] for k in ('enc_a', 'enc_b', 'enc_sw', 'led', 'oled_sda', 'oled_scl')] == [7, 8, 9, 10, 28, 29]
assert [HEADER_PIN[g] for g in [0, 1, 2, 3, 4, 5, 6, 11, 12, 7, 8, 9, 10, 28, 29]] == [23, 22, 21, 20, 19, 18, 17, 12, 11, 16, 15, 14, 13, 5, 4]
assert pins['oled_addr'] == 0x3c and pins['led_count'] == 9
FONT = '/usr/share/fonts/truetype/dejavu'
pdfmetrics.registerFont(TTFont('DejaVu', FONT + '/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVu-Bold', FONT + '/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuMono', FONT + '/DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('DejaVu', normal='DejaVu', bold='DejaVu-Bold', italic='DejaVu', boldItalic='DejaVu-Bold')
W, H = A4
M = 38
INK = colors.HexColor('#17212C')
BLUE = colors.HexColor('#145398')
GREY = colors.HexColor('#51606C')
BORDER = colors.HexColor('#C7D1D8')
PALE = colors.HexColor('#F1F5F8')
WARN = colors.HexColor('#FFF3E1')
ORANGE = colors.HexColor('#925000')
FONT_STYLE = ParagraphStyle('body', fontName='DejaVu', fontSize=8.5, leading=12.7, textColor=INK, alignment=TA_LEFT, spaceAfter=0)
SMALL_STYLE = ParagraphStyle('small', parent=FONT_STYLE, fontSize=7.6, leading=11)
WARN_STYLE = ParagraphStyle('warn', parent=FONT_STYLE, fontSize=8.1, leading=12, textColor=INK)

c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
c.setTitle('Macropad V1 and V2 — Hand-soldering wiring guide')
c.setAuthor('Macropad project')

def text(x, y, s, size=9, color=INK, bold=False, mono=False):
    c.setFillColor(color)
    c.setFont('DejaVuMono' if mono else 'DejaVu-Bold' if bold else 'DejaVu', size)
    c.drawString(x, y, s)

def para(x, top, width, content, style=FONT_STYLE):
    p = Paragraph(content, style)
    _, h = p.wrap(width, H)
    p.drawOn(c, x, top - h)
    return top - h

def box(x, top, width, height, fill=PALE, stroke=BORDER):
    c.setFillColor(fill); c.setStrokeColor(stroke); c.setLineWidth(.8)
    c.roundRect(x, top-height, width, height, 5, fill=1, stroke=1)

def section(x, y, title):
    text(x, y, title.upper(), 9, BLUE, bold=True)

def header(number, title, sub):
    text(M, H-35, 'MACROPAD  /  HAND-SOLDERING REFERENCE', 8, BLUE, bold=True)
    text(M, H-63, title, 19, INK, bold=True)
    text(M, H-79, sub, 8.5, GREY)
    c.setStrokeColor(BORDER); c.line(M, H-90, W-M, H-90)
    text(M, 22, 'V1 + V2  |  Source-map reference; hardware not yet verified', 7, GREY)
    c.setFont('DejaVu-Bold', 7); c.drawRightString(W-M, 22, f'{number} / 6')

def line(x1,y1,x2,y2,color=INK,width=1.2):
    c.setStrokeColor(color); c.setLineWidth(width); c.line(x1,y1,x2,y2)

def dot(x,y,color=INK):
    c.setFillColor(color); c.circle(x,y,2.0,stroke=0,fill=1)

def table(x, top, widths, rows, rowh=19):
    for i, row in enumerate(rows):
        y = top-i*rowh
        c.setFillColor(PALE if i == 0 else (colors.white if i%2 else colors.HexColor('#F9FAFB')))
        c.rect(x, y-rowh, sum(widths), rowh, fill=1, stroke=0)
        c.setStrokeColor(BORDER); c.setLineWidth(.5); c.line(x,y-rowh,x+sum(widths),y-rowh)
        xx=x
        for j, val in enumerate(row):
            text(xx+6, y-rowh+5.2, val, 7.6 if i else 7.3, BLUE if i == 0 else INK, bold=(i==0))
            xx += widths[j]

# PAGE 1: Scope, actual confirmed mapping and orientation.
header(1, 'Before you solder', 'V1: keys + knob + display + planned RGB   /   V2: keys + knob only')
box(M, H-106, W-2*M, 83, WARN, colors.HexColor('#E7CB9D'))
para(M+11,H-118,W-2*M-22,
     '<b>Important:</b> Both firmware images and the assembled hardware are untested. '
     'V1 below is the <b>intended source-firmware wiring</b>; the supplied Full Deck UF2 is unchanged and its pinout, display and LED behavior are <b>not verified</b>. '
     'Do not assume it matches this diagram. V2 uses the confirmed direct-wired map, but still needs a physical test.', WARN_STYLE)
y = H-210
section(M,y,'Same nine switches and encoder on both versions')
para(M,y-12,W-2*M,'Board: <b>Waveshare RP2040-Zero</b>. Use the silkscreen GPIO names first. Header numbers below are a cross-check, not a substitute for checking your actual board. These are independent switches, not a key matrix.',SMALL_STYLE)
top = y-48
table(M,top,[95,80,68,45], [('Function','GPIO','P1 pin','GND?'),
    ('K0','GP0','23','Yes'),('K1','GP1','22','Yes'),('K2','GP2','21','Yes'),('K3','GP3','20','Yes'),('K4','GP4','19','Yes'),('K5','GP5','18','Yes'),('K6','GP6','17','Yes'),('K7','GP11','12','Yes'),('K8','GP12','11','Yes'),('Encoder A','GP7','16','COM'),('Encoder B','GP8','15','COM'),('Encoder SW','GP9','14','SW2')], rowh=19)
rx=M+307
section(rx,top-3,'Top view of keys')
for i in range(9):
    col,row=i%3,i//3; xx=rx+col*61; yy=top-18-row*47
    c.setFillColor(colors.white); c.setStrokeColor(BORDER); c.roundRect(xx,yy-34,52,32,3,stroke=1,fill=1)
    text(xx+7,yy-13,f'K{i}',8,INK,bold=True)
    text(xx+7,yy-25, f'GP{[0,1,2,3,4,5,6,11,12][i]}',7,BLUE)
para(rx,top-173,180,'<b>Position:</b> K0–K8 read left to right, then top to bottom. The knob is separate from these nine keys.', SMALL_STYLE)
para(rx,top-225,180,'<b>P1 orientation:</b> USB-C up, component side toward you. Waveshare numbering starts at 5V = pin 1, then runs counter-clockwise. Verify every label against the board.',SMALL_STYLE)
box(M,top-300,W-2*M,91,PALE)
para(M+10,top-311,W-2*M-20,'<b>Power rule:</b> unplug USB and every external power supply before soldering or continuity tests. Each key connects one GPIO to GND <b>only while pressed</b>; do not connect key contacts to 3V3 or 5V. GPIO inputs use firmware pull-ups. Do not put 5 V onto any RP2040 GPIO.',FONT_STYLE)
c.showPage()

# PAGE 2: Complete V2 direct-contact diagram.
header(2,'V2 complete wiring','Keys & Knob only  •  no OLED and no external RGB wiring')
para(M,H-104,W-2*M,'Each row is one normally-open mechanical key. The right-hand vertical line represents <b>one common GND net</b>: wire it as a ground daisy chain or insulated distribution point. Do not join the GPIO sides together.',FONT_STYLE)
section(M,H-150,'Nine keys  /  view from the solder side, electrically')
start=H-174
busx= W-93
for i,gpio in enumerate([0,1,2,3,4,5,6,11,12]):
    yy=start-i*28
    text(M+6,yy-3,f'K{i}',8.5,INK,bold=True)
    text(M+45,yy-3,f'GP{gpio}',8.5,BLUE,bold=True)
    line(M+91,yy,M+157,yy)
    # open switch symbol
    c.setStrokeColor(INK); c.circle(M+160,yy,2,fill=0,stroke=1); c.circle(M+192,yy,2,fill=0,stroke=1)
    line(M+162,yy+1,M+188,yy+10)
    line(M+194,yy,busx,yy); dot(busx,yy)
line(busx,start+5,busx,start-8*28-15)
text(busx+9,start+1,'GND',8.5,INK,bold=True)
text(M+97,start-8*28-22,'normally-open switch',7,GREY)
y=H-461
section(M,y,'Encoder  /  identify contacts before soldering')
box(M,y-10,W-2*M,142)
text(M+12,y-31,'ROTATION CONTACTS',8,BLUE,bold=True)
text(M+12,y-50,'A   ->  GP7 (P1-16)',8.4,INK,mono=True)
text(M+12,y-66,'B   ->  GP8 (P1-15)',8.4,INK,mono=True)
text(M+12,y-82,'COM ->  GND (P1-2)',8.4,INK,mono=True)
text(M+270,y-31,'PUSH SWITCH',8,BLUE,bold=True)
text(M+270,y-50,'SW1 -> GP9 (P1-14)',8.4,INK,mono=True)
text(M+270,y-66,'SW2 -> GND (P1-2)',8.4,INK,mono=True)
para(M+12,y-99,W-2*M-24,'Encoder contact order varies: use its datasheet or a meter, not a generic pin picture. Rotation COM and one push-switch contact both go to the common GND net. The metal case is not automatically COM. Swapping A/B reverses direction.',SMALL_STYLE)
para(M,H-634,W-2*M,'<b>V2 complete:</b> Connect the common GND net to the board GND (P1-2). Leave GP10, GP28 and GP29 unconnected unless independently needed. No key diodes, external pull-ups, OLED or LED supply are required for this version.',FONT_STYLE)
box(M,H-687,W-2*M,61,WARN,colors.HexColor('#E7CB9D'))
para(M+10,H-699,W-2*M-20,'The Keys &amp; Knob UF2 is source-built for this map but has not been physically boot-tested. See page 4 for unpowered checks and safe first power-up.', WARN_STYLE)
c.showPage()

# PAGE 3: V1 full additions, OLED and LED conceptual topology.
header(3,'V1 display + planned RGB','Start with all V2 key and encoder wiring on page 2, then add the circuits below')
box(M,H-104,W-2*M,57,WARN,colors.HexColor('#E7CB9D'))
para(M+10,H-115,W-2*M-20,'<b>V1 is not solder-ready in full:</b> display/LED part details, LED supply and the bundled Full Deck UF2 compatibility are not established. The LED section is a <b>proposed topology</b>, not a complete approved power design.',WARN_STYLE)
section(M,H-181,'OLED  /  SSD1306, 128 x 32, I2C address 0x3C')
box(M,H-193,W-2*M,117,PALE)
table(M+10,H-202,[160,135,116],[('OLED module label','Connect to','Board P1'),('VCC (3.3 V compatible)','3V3','3'),('GND','GND','2'),('SDA','GP28','5'),('SCL','GP29','4')],rowh=19)
para(M,H-319,W-2*M,'If the module lacks I2C pull-ups, fit <b>one approximately 4.7 kΩ resistor from SDA to 3V3 and one from SCL to 3V3</b>. First check whether the module already has pull-ups and that they pull up to <b>3V3</b>. Do not use 5 V pull-ups or assume the module pin order.',SMALL_STYLE)
section(M,H-372,'RGB  /  proposed 5 V addressable RGB signal path')
box(M,H-384,W-2*M,181,colors.HexColor('#F8FAFB'))
text(M+10,H-403,'GP10 (P1-13)',8,BLUE,bold=True)
line(M+96,H-400,M+119,H-400)
text(M+122,H-403,'A',8,INK,bold=True)
line(M+132,H-400,M+140,H-400)
box(M+140,H-387,126,35,colors.white)
text(M+147,H-401,'74AHCT1G125',8,INK,bold=True)
text(M+152,H-414,'5 V buffer',7,GREY)
text(M+271,H-403,'Y',8,INK,bold=True)
line(M+282,H-400,M+302,H-400)
text(M+306,H-403,'330 ohm',7.5,INK,bold=True)
line(M+365,H-400,M+382,H-400)
text(M+385,H-403,'LED0 DIN',8,BLUE,bold=True)
text(M+12,H-437,'LED0 DOUT -> LED1 DIN; each DOUT -> next DIN',8.0,INK,mono=True)
para(M+12,H-450,W-2*M-24,'Every LED VDD joins the <b>designed LED 5 V rail</b>; every LED GND joins shared GND. Follow each pixel’s DIN/DOUT arrows. Breakout points and wire sizes depend on the actual strip.',SMALL_STYLE)
para(M+12,H-493,W-2*M-24,'Buffer: VCC → LED 5 V; GND → shared GND; /OE → GND for always-enabled example; A → GP10; Y → 330 Ω → LED0 DIN. Candidate 10 kΩ from A to GND; 100 nF across buffer VCC/GND and 10–47 µF across LED 5 V/GND near LED0 (observe polarity).',SMALL_STYLE)
para(M,H-577,W-2*M,'<b>Typical TI DBV/DCK/DRL package pins:</b> /OE=1, A=2, GND=3, Y=4, VCC=5. Verify the <b>exact IC and package datasheet</b> and the pin-1 mark before soldering; other packages may differ. Use AHCT, not AHC, for this proposed level-shifter.',SMALL_STYLE)
box(M,H-635,W-2*M,89,WARN,colors.HexColor('#E7CB9D'))
para(M+10,H-646,W-2*M-20,'<b>STOP:</b> The 5 V source, strip type/current, protection, power isolation and power sequencing are not selected. Leave LED power and data disconnected until designed and verified. Never tie external 5 V directly to USB/board 5 V. A common GND is required after an isolated supply design is approved. Do not drive an unpowered buffer/strip.',WARN_STYLE)
c.showPage()

# PAGE 4: Hands-on process and commissioning.
header(4,'Checks before power','A meter and a staged test are essential; these diagrams are not a measured circuit')
section(M,H-110,'1  /  Before soldering')
para(M,H-122,W-2*M,'Confirm the exact RP2040-Zero silkscreen, encoder datasheet, switch terminals, OLED voltage/address and, for V1, LED part and supply design. Plan strain relief and insulation; trim wire ends and avoid solder bridges. Do not count on a generic encoder drawing or a module’s connector order.',FONT_STYLE)
section(M,H-196,'2  /  Unpowered multimeter checks')
para(M,H-208,W-2*M,'Disconnect USB and all supplies. Check <b>3V3 to GND</b> and <b>5V to GND</b> for a persistent short; capacitors can briefly beep while charging. For each K0–K8, check its GPIO to GND: open when released, closed only while pressed. Check that separate GPIOs are not shorted together. Check encoder A/B to COM while turning and SW1/SW2 while pressing. Look for bridges and exposed conductors.',FONT_STYLE)
section(M,H-296,'3  /  Power and test the basic pad')
para(M,H-308,W-2*M,'Leave LED power and data disconnected. With the circuit inspected and no persistent short, connect USB data to a suitable computer or protected supply. Verify the board enumerates; use the app’s Tester and safe bindings. Physical actions can execute while testing. Serial event capability does not mean event reporting is enabled, and no event alone does not prove a fault.',FONT_STYLE)
section(M,H-385,'4  /  V1 display, then RGB on a suitable bench')
para(M,H-397,W-2*M,'With power disconnected, fit the confirmed 3.3 V OLED and recheck each net. Test with firmware actually verified for this display and map. For RGB, select a compatible individually addressable strip and calculate/measure worst-case current, including the board and display. Design source isolation and safe startup/shutdown; use a current-limited bench supply and start with one pixel only after the circuit and firmware are verified.',FONT_STYLE)
box(M,H-484,W-2*M,109,WARN,colors.HexColor('#E7CB9D'))
para(M+11,H-496,W-2*M-22,'<b>RGB firmware warning:</b> The default firmware <i>source</i> disables external LED data until a deliberate bench-enabled build; settings in the app do not enable output. The supplied Full Deck UF2 is an unchanged, unverified image: its source, pin map and LED behavior are unknown. A low GP10 after initialization is not a power switch and does not guarantee dark LEDs at reset or clear a previously latched color.',WARN_STYLE)
section(M,H-615,'Project references')
para(M,H-627,W-2*M,'Pin map: <b>firmware/include/board.h</b>; detailed electrical notes: <b>docs/HARDWARE.md</b>; image provenance: <b>electron/firmware/README.md</b>. GPIO/header names have been checked against project documentation, not measured on your specific board. Actual component datasheets and a real bench test remain necessary.',SMALL_STYLE)
text(M,H-708,'Illustrated wiring views follow on pages 5 and 6.',7.5,GREY)

c.showPage()

# PAGE 5: Picture-like V2 component wiring; net labels avoid deceptive routing.
header(5, 'V2 illustrated wiring', 'Nine switches + encoder  /  logical connections, not a physical pinout')
box(M, H-104, W-2*M, 55, WARN, colors.HexColor('#E7CB9D'))
para(M+10,H-115,W-2*M-20,'<b>Read the labels, not the positions:</b> component drawings and board pads below are symbolic. Actual terminal order varies. Every label with the same name is the <b>same electrical connection</b>. Match GP labels to the board silkscreen.', WARN_STYLE)
section(M,H-179,'Switch layout  /  K0 to K8 as seen from above')
text(M,H-194,'Each switch has two electrical terminals; drawings are not its solder-side pinout.',7,GREY)

# Nine symbolic switch bodies with individually labelled signal and ground leads.
keymap = [0,1,2,3,4,5,6,11,12]
for i, gpio in enumerate(keymap):
    row,col=divmod(i,3)
    x=M+4+col*90
    y=H-214-row*98
    c.setStrokeColor(colors.HexColor('#AEBBC5')); c.setFillColor(colors.HexColor('#E8EDF2'))
    c.roundRect(x,y-43,67,43,5,stroke=1,fill=1)
    c.setFillColor(colors.white); c.roundRect(x+8,y-33,51,25,3,stroke=0,fill=1)
    text(x+24,y-24,f'K{i}',9,INK,bold=True)
    # Terminals are SYMBOLIC, not a claim about the physical switch pins.
    c.setFillColor(BLUE); c.circle(x+18,y-43,2.4,stroke=0,fill=1)
    c.setFillColor(INK); c.circle(x+49,y-43,2.4,stroke=0,fill=1)
    line(x+18,y-46,x+18,y-59,BLUE,1.6)
    line(x+49,y-46,x+49,y-59,INK,1.6)
    text(x+4,y-70,f'GP{gpio}',7.4,BLUE,bold=True)
    text(x+38,y-70,'GND',7.4,INK,bold=True)

# Stylised controller with a functional terminal list, intentionally not a
# literal pinout: the real header has unequal left/right pad counts.
bx, by, bw, bh = 333, H-206, 224, 305
box(bx,by,bw,bh,colors.HexColor('#EAF3F3'),colors.HexColor('#AABDBB'))
text(bx+12,by-18,'RP2040-ZERO',9,INK,bold=True)
text(bx+12,by-31,'Functional connection list',7,GREY)
# USB-C and controller chip are recognisable but decorative, not pad locations.
c.setFillColor(colors.HexColor('#C9D2DA')); c.setStrokeColor(GREY)
c.roundRect(bx+bw-58,by-30,39,15,3,fill=1,stroke=1)
c.setFillColor(colors.HexColor('#29343D')); c.roundRect(bx+bw-57,by-98,38,36,2,fill=1,stroke=0)
text(bx+bw-58,by-41,'USB-C',6.5,GREY)
text(bx+bw-57,by-110,'chip',6.5,GREY)
text(bx+12,by-49,'Net',7,BLUE,bold=True); text(bx+72,by-49,'P1',7,BLUE,bold=True)
board_rows=[('GP0','23'),('GP1','22'),('GP2','21'),('GP3','20'),('GP4','19'),('GP5','18'),('GP6','17'),('GP11','12'),('GP12','11'),('GP7','16'),('GP8','15'),('GP9','14'),('GND','2')]
for i,(net,pin) in enumerate(board_rows):
    yy=by-66-i*16
    c.setFillColor(BLUE if net != 'GND' else INK); c.circle(bx+16,yy+2,2.3,fill=1,stroke=0)
    text(bx+25,yy,net,7.5,BLUE if net != 'GND' else INK,bold=True)
    text(bx+74,yy,pin,7.5,INK,mono=True)
text(bx+103,by-154,'K0–K8',7,GREY)
text(bx+103,by-245,'Encoder',7,GREY)
text(bx+103,by-274,'Common',7,GREY)

section(M,H-528,'Encoder  /  symbolic contacts')
# A generic shaft/encoder illustration and separately named contact wires.
ex,ey=M+3,H-543
c.setFillColor(colors.HexColor('#D8DEE3')); c.setStrokeColor(GREY)
c.roundRect(ex,ey-80,80,66,5,fill=1,stroke=1)
c.setFillColor(colors.HexColor('#B6C2CB')); c.circle(ex+40,ey-14,16,stroke=1,fill=1)
c.setFillColor(colors.HexColor('#F7F8F9')); c.circle(ex+40,ey-14,8,stroke=1,fill=1)
text(ex+8,ey-62,'ENCODER',6.5,INK,bold=True)
for i,(net,dest,col) in enumerate([('A','GP7',BLUE),('B','GP8',BLUE),('COM','GND',INK),('SW1','GP9',BLUE),('SW2','GND',INK)]):
    yy=ey-5-i*15
    text(ex+95,yy-3,net,7.4,INK,bold=True)
    line(ex+129,yy,ex+167,yy,col,1.4)
    text(ex+173,yy-3,dest,7.4,col,bold=True)
para(M+277,H-543,224,'<b>Find the real terminals</b> using the encoder datasheet or a multimeter. Rotary COM and one switch contact both go to GND. Do not assume the case or the pictured positions are the real contacts.',SMALL_STYLE)
box(M,H-669,W-2*M,65,PALE)
para(M+10,H-680,W-2*M-20,'<b>Connect all GND labels together</b> and to RP2040-Zero GND (P1-2). Each blue GPIO goes to only its named key or encoder contact. No OLED, LED strip or LED power is used on V2. Complete electrical circuit and checks: pages 2 and 4.',SMALL_STYLE)
c.showPage()

# PAGE 6: Picture-like V1 additions. Rail is visibly disconnected/undefined.
header(6, 'V1 illustrated additions', 'First wire all keys + encoder exactly as shown on pages 2 and 5')
box(M,H-104,W-2*M,56,WARN,colors.HexColor('#E7CB9D'))
para(M+10,H-115,W-2*M-20,'<b>V1 firmware and RGB are not yet verified.</b> The Full Deck UF2 may not match this source pin map. The LED drawing is a <b>proposed concept</b>; leave its power and data disconnected until parts, supply and firmware are checked.',WARN_STYLE)
section(M,H-180,'OLED  /  match labels on your actual module')
text(M,H-195,'Connector order is illustrative only. Read your module labels before wiring.',7.2,GREY)
# Connector-to-connector illustration: wires enter labeled terminals only.
board_x,board_y=48,H-214
oled_x,oled_y=371,H-210
box(board_x,board_y,142,137,colors.HexColor('#EAF3F3'),colors.HexColor('#AABDBB'))
text(board_x+10,board_y-20,'RP2040-ZERO',8.2,INK,bold=True)
text(board_x+10,board_y-33,'logical contacts',6.5,GREY)
box(oled_x,oled_y,175,145,colors.HexColor('#E7EDF4'),colors.HexColor('#AEBBC5'))
text(oled_x+10,oled_y-18,'SSD1306 OLED',8.2,INK,bold=True)
c.setFillColor(colors.HexColor('#1E2935')); c.roundRect(oled_x+72,oled_y-91,90,55,3,fill=1,stroke=0)
text(oled_x+79,oled_y-58,'128 x 32',7,colors.HexColor('#CDE7F8'),mono=True)
text(oled_x+79,oled_y-74,'0x3C',7,colors.HexColor('#CDE7F8'),mono=True)
# Right and left terminal positions represent names, not component physical pads.
for i,(src,dst,col) in enumerate([('3V3','VCC',colors.HexColor('#B35226')),('GND','GND',INK),('GP28','SDA',BLUE),('GP29','SCL',colors.HexColor('#377862'))]):
    yy=board_y-55-i*19
    text(board_x+10,yy-3,src,8,col,bold=True)
    c.setFillColor(col); c.circle(board_x+130,yy,2.4,stroke=0,fill=1); c.circle(oled_x+10,yy,2.4,stroke=0,fill=1)
    line(board_x+132,yy,oled_x+8,yy,col,1.7)
    text(oled_x+18,yy-3,dst,8,col,bold=True)
para(M,H-364,W-2*M,'Use a <b>3.3 V compatible</b> 128×32 SSD1306 I2C module at 0x3C. SDA/SCL need pull-ups to <b>3V3</b> (about 4.7 kΩ if not already fitted). Verify VCC and I2C pull-up voltage and module connector order.',SMALL_STYLE)
section(M,H-410,'RGB  /  conceptual chain; power source not designed')
# Data path from functional GP10 label through level shifter and series resistor.
text(M+4,H-432,'GP10',8,BLUE,bold=True)
line(M+43,H-429,M+63,H-429,BLUE,1.5)
box(M+64,H-414,133,31,colors.white)
text(M+71,H-433,'74AHCT1G125',8,INK,bold=True)
line(M+197,H-429,M+219,H-429,BLUE,1.5)
text(M+224,H-432,'330 Ω',8,INK,bold=True)
line(M+266,H-429,M+280,H-429,BLUE,1.5)
text(M+284,H-432,'to LED0 DIN',8,BLUE,bold=True)
text(M+4,H-455,'Buffer power, /OE, capacitors and safety details: page 3.',7,GREY)
# A conceptual single data wire passes through nine individually addressed pixels.
x0=M+51; step=49; py=H-512; tile=33
vdd=py+36; ground=py-33
c.setDash(3,2); line(x0-19,vdd,x0+8*step+tile+10,vdd,colors.HexColor('#B35226'),1.2); c.setDash()
line(x0-19,ground,x0+8*step+tile+10,ground,INK,1.2)
text(M,H-472,'5 V ?',7.5,colors.HexColor('#B35226'),bold=True)
text(M,H-548,'GND',7.5,INK,bold=True)
for i in range(9):
    x=x0+i*step
    line(x+tile/2,vdd,x+tile/2,py+14,colors.HexColor('#B35226'),1)
    line(x+tile/2,py-14,x+tile/2,ground,INK,1)
    c.setFillColor(colors.white); c.setStrokeColor(BORDER); c.roundRect(x,py-14,tile,28,3,fill=1,stroke=1)
    text(x+4,py-3,f'LED{i}',6.4,INK,bold=True)
    if i < 8:
        line(x+tile,py,x+step,py,BLUE,1.4)
        line(x+step-4,py+2.5,x+step,py,BLUE,1)
        line(x+step-4,py-2.5,x+step,py,BLUE,1)
# Unpowered data entry is a net label; it is not tied to the 5 V rail.
line(x0-16,py,x0,py,BLUE,1.4)
text(M,H-514,'DIN',7,BLUE,bold=True)
text(M+6,H-575,'Blue = data, DOUT to next DIN   /   brown dashed = proposed 5 V   /   black = GND',7.2,GREY)
box(M,H-593,W-2*M,126,WARN,colors.HexColor('#E7CB9D'))
para(M+10,H-604,W-2*M-20,'<b>No LED supply is selected or approved.</b> Each pixel’s VDD and GND must follow the purchased part’s datasheet; arrows show data direction. Do not assume cut points, 5 V current, board/USB capacity or 3.3 V data compatibility. Do not directly join an external 5 V source to USB 5 V. Common GND, isolation and power sequencing need a verified design. The drawings do not establish physical pixel pin orientation.',WARN_STYLE)

c.save()
print(OUT)
