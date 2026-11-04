#!/usr/bin/env python3
"""Draw two picture-style wiring pages; requires reportlab and DejaVu fonts.

Terminal and encoder shapes are illustrative. The diagram is not a substitute
for the datasheets or physical continuity checks. No LED supply is designed.
"""
from pathlib import Path
from check_board import board_h_pins, HEADER_PIN
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'Macropad_Picture_Wiring_V1_V2.pdf'
pins = board_h_pins((ROOT/'firmware/include/board.h').read_text())
assert pins['keys']==[0,1,2,3,4,5,6,11,12]
assert [pins[k] for k in ['enc_a','enc_b','enc_sw','led','oled_sda','oled_scl']]==[7,8,9,10,28,29]
assert [HEADER_PIN[g] for g in [0,1,2,3,4,5,6,11,12,7,8,9,10,28,29]]==[23,22,21,20,19,18,17,12,11,16,15,14,13,5,4]
assert pins['oled_addr'] == 0x3c
for name,filename in [('sans','DejaVuSans.ttf'),('bold','DejaVuSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+filename))
pdfmetrics.registerFontFamily('sans',normal='sans',bold='bold',italic='sans',boldItalic='bold')
W,H=landscape(A3)
C=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
C.setTitle('Picture wiring diagrams: Macropad V1 and V2')
INK=colors.HexColor('#17212B'); BLUE=colors.HexColor('#154F98'); GROUND=colors.HexColor('#262B31')
PAPER=colors.HexColor('#F8FAFC'); BORDER=colors.HexColor('#D1D9E1'); MUTED=colors.HexColor('#576775')
WARN=colors.HexColor('#FFF3DE'); WARN_BORDER=colors.HexColor('#D9A44C')
# Each switch has its own colour and labelled GPIO. Black is ground only.
KEY_COLORS=[colors.HexColor(x) for x in ['#C13D48','#1E64B5','#11806A','#A14EAF','#D87722','#216F9D','#AB5577','#6F7C22','#AF6730']]
ENC_A=colors.HexColor('#7260B5'); ENC_B=colors.HexColor('#E3882B'); ENC_SW=colors.HexColor('#2587A0')
OLED_V=colors.HexColor('#C04E39'); OLED_SDA=colors.HexColor('#178D69'); OLED_SCL=colors.HexColor('#2875C5')
style=ParagraphStyle('normal',fontName='sans',fontSize=9.4,leading=14,textColor=INK)
small=ParagraphStyle('small',parent=style,fontSize=8.4,leading=12)

def txt(x,y,t,size=9,color=INK,bold=False):
    C.setFont('bold' if bold else 'sans',size);C.setFillColor(color);C.drawString(x,y,t)
def ptext(x,top,width,t,sty=small):
    p=Paragraph(t,sty); _,h=p.wrap(width,500);p.drawOn(C,x,top-h);return top-h

def rect(x,y,w,h,fill,stroke=BORDER,r=5):
    C.setLineWidth(.8);C.setFillColor(fill);C.setStrokeColor(stroke);C.roundRect(x,y,w,h,r,fill=1,stroke=1)
def wire(points,color,width=2.5,dash=None):
    C.setStrokeColor(color);C.setLineWidth(width);C.setLineCap(1);C.setLineJoin(1)
    if dash:C.setDash(dash)
    else:C.setDash()
    p=C.beginPath();p.moveTo(*points[0]);
    for pt in points[1:]:p.lineTo(*pt)
    C.drawPath(p,stroke=1,fill=0);C.setDash()
def curve(start,ctrl1,ctrl2,end,color,width=2.8):
    C.setStrokeColor(color);C.setLineWidth(width);C.setLineCap(1);C.setDash()
    p=C.beginPath();p.moveTo(*start);p.curveTo(*ctrl1,*ctrl2,*end);C.drawPath(p,stroke=1,fill=0)
def dot(x,y,color=GROUND,r=3):
    C.setFillColor(color);C.setStrokeColor(colors.white);C.setLineWidth(.6);C.circle(x,y,r,fill=1,stroke=1)

# RP2040-Zero, USB above: 9 edge pads left/right and 5 along bottom.
# Named pins are based on P1 in protocol.json, not on a third-party drawing.
bx,by,bw,bh=415,326,145,250
left_names=['5V','GND','3V3','GP29','GP28','GP27','GP26','GP15','GP14']
right_names=['GP0','GP1','GP2','GP3','GP4','GP5','GP6','GP7','GP8']
bottom_names=['GP13','GP12','GP11','GP10','GP9']
positions={}
for i,n in enumerate(left_names):positions[n]=(bx,by+bh-26-i*24)
for i,n in enumerate(right_names):positions[n]=(bx+bw,by+bh-26-i*24)
for i,n in enumerate(bottom_names):positions[n]=(bx+23+i*25,by)

# Positions of the component illustrations and terminal locations.
keys=[]
for i in range(9):
    row,col=divmod(i,3)
    x=670+col*171; y=590-row*151
    keys.append((x,y,(x+22,y-5),(x+76,y-5)))
# Rotary illustration: named contacts shown in a separate strip, not pin positions.
ex,ey=73,332
enc={'A':(ex+14,ey-21),'B':(ex+50,ey-21),'COM':(ex+86,ey-21),'SW1':(ex+122,ey-21),'SW2':(ex+158,ey-21)}
# Display connector illustrated independently of a real module's pin order.
ox,oy=83,574
oled={'VCC':(ox+20,oy-11),'GND':(ox+60,oy-11),'SCL':(ox+100,oy-11),'SDA':(ox+140,oy-11)}

def draw_board():
    rect(bx,by,bw,bh,colors.HexColor('#134143'),colors.HexColor('#0F2D2F'),7)
    C.setFillColor(colors.HexColor('#B9C6CB'));C.setStrokeColor(colors.HexColor('#7D8B93'))
    C.roundRect(bx+46,by+bh-2,53,29,3,fill=1,stroke=1)
    C.setFillColor(colors.HexColor('#38434B'));C.roundRect(bx+54,by+bh+5,37,10,2,fill=1,stroke=0)
    txt(bx+49,by+bh+33,'USB-C UP',7,MUTED,True)
    C.setFillColor(colors.HexColor('#253035'));C.roundRect(bx+48,by+118,49,49,3,fill=1,stroke=0)
    txt(bx+55,by+139,'RP2040',6.5,colors.white,True)
    C.setFillColor(colors.HexColor('#8D9C9A'));C.circle(bx+50,by+80,8,fill=1,stroke=0);C.circle(bx+95,by+80,8,fill=1,stroke=0)
    txt(bx+47,by+62,'RP2040-ZERO',6.1,colors.HexColor('#E4F2ED'),True)
    for n in left_names:
        x,y=positions[n]; C.setFillColor(colors.HexColor('#D9B968')); C.circle(x,y,4.3,fill=1,stroke=0)
        txt(x+8,y-2.7,n,6.7,colors.white,True)
    for n in right_names:
        x,y=positions[n]; C.setFillColor(colors.HexColor('#D9B968')); C.circle(x,y,4.3,fill=1,stroke=0)
        C.setFont('bold',6.7); C.setFillColor(colors.white);C.drawRightString(x-7,y-2.7,n)
    for n in bottom_names:
        x,y=positions[n];C.setFillColor(colors.HexColor('#D9B968'));C.circle(x,y,4.3,fill=1,stroke=0)
        C.saveState();C.translate(x+2,y+8);C.rotate(90);txt(0,0,n,5.7,colors.white,True);C.restoreState()
    txt(bx-1,by-37,'9 left + 5 bottom + 9 right',8,MUTED,True)
    txt(bx-1,by-50,'Read the silkscreen; component side up',7,MUTED)

def draw_switch(i):
    x,y,a,g=keys[i]; gpio=pins['keys'][i];col=KEY_COLORS[i]
    # Two contacts are drawn below each generic switch, not a real footprint.
    rect(x,y,98,72,colors.HexColor('#2E3843'),colors.HexColor('#1D2630'),7)
    rect(x+9,y+9,80,54,colors.HexColor('#EDF2F5'),colors.HexColor('#BEC9D2'),5)
    txt(x+31,y+31,f'K{i}',15,INK,True)
    C.setStrokeColor(colors.HexColor('#AFB7BF'));C.setLineWidth(4);C.line(a[0],y,a[0],a[1]);C.line(g[0],y,g[0],g[1])
    dot(*a,col,4);dot(*g,GROUND,4)
    txt(x+3,y-19,f'GP{gpio}',7.2,col,True);txt(x+61,y-19,'GND',7.2,GROUND,True)

def draw_encoder():
    rect(ex,ey,185,105,colors.HexColor('#929DA5'),colors.HexColor('#66747D'),7)
    C.setFillColor(colors.HexColor('#D5DCE0'));C.setStrokeColor(colors.HexColor('#697882'));C.circle(ex+92,ey+78,26,stroke=1,fill=1)
    C.setFillColor(colors.HexColor('#A8B3BA'));C.circle(ex+92,ey+78,12,stroke=1,fill=1)
    txt(ex+13,ey+37,'ROTARY ENCODER',9,INK,True)
    txt(ex+13,ey+20,'contact labels, not physical order',7.1,INK)
    for name,(x,y) in enc.items():
        col={'A':ENC_A,'B':ENC_B,'COM':GROUND,'SW1':ENC_SW,'SW2':GROUND}[name]
        C.setStrokeColor(colors.HexColor('#849099'));C.setLineWidth(3);C.line(x,ey,x,y)
        dot(x,y,col,4);txt(x-10,y-14,name,6.8,INK,True)

def draw_oled():
    rect(ox,oy,181,100,colors.HexColor('#144D72'),colors.HexColor('#0B3455'),7)
    C.setFillColor(colors.HexColor('#101A24'));C.roundRect(ox+15,oy+20,151,58,3,fill=1,stroke=0)
    txt(ox+37,oy+51,'SSD1306',11,colors.HexColor('#D2EBFF'),True)
    txt(ox+42,oy+34,'128 x 32',9,colors.HexColor('#BFE0F5'))
    for n,(x,y) in oled.items():
        col={'VCC':OLED_V,'GND':GROUND,'SCL':OLED_SCL,'SDA':OLED_SDA}[n]
        C.setStrokeColor(colors.HexColor('#D8BC6A'));C.setLineWidth(3);C.line(x,oy,x,y)
        dot(x,y,col,4);txt(x-11,y-14,n,6.5,INK,True)

def heading(v):
    C.setFillColor(colors.white);C.rect(0,0,W,H,fill=1,stroke=0)
    txt(37,H-39,f'V{v}  /  PICTURE WIRING',22,INK,True)
    txt(38,H-58,'RP2040-Zero  |  9 direct-wire switches + rotary encoder' + (' + OLED + planned RGB' if v==1 else ''),10,MUTED)
    rect(37,H-112,W-74,42,WARN,WARN_BORDER)
    ptext(49,H-78,W-100,'<b>Unplug power before soldering.</b> Component drawings and wire routes are illustrative; identify the actual solder terminals with the part datasheet and a meter. Crossings are <b>not connected</b> unless a dot is shown. Read the actual board silkscreen.',small)
    txt(38,18,'Read the safety and continuity checks in Macropad_V1_V2_Wiring_Guide.pdf; hardware and both UF2s remain unverified.',7.5,MUTED)
    txt(W-108,18,f'V{v}  /  {1 if v==2 else 2} of 2',7.5,MUTED,True)


def wires(v):
    # Dedicated wire from each named GPIO to one switch terminal.
    for i,(x,y,a,g) in enumerate(keys):
        src=positions[f'GP{pins["keys"][i]}']; col=KEY_COLORS[i]
        # Bottom-edge pads must leave downwards. Otherwise the board drawing
        # hides their first segment and makes it look like they start at GP9.
        # Crossings have no dots and are not electrical junctions.
        if i >= 7:
            # Separate lanes between the terminal and ground bus avoid drawing
            # a signal along or through a ground junction dot.
            lane = keys[6][1] - (11 if i == 7 else 22)
            wire([src, (src[0], lane), (a[0], lane), a], col, 2.8)
        else:
            curve(src,(src[0]+92,src[1]+(i-4)*9),(a[0]-100,a[1]-50),a,col,2.8)
    # Ground is an explicit shared bus; junction dots identify actual branches.
    gx=1147; bottom=183
    src=positions['GND']
    wire([src,(375,src[1]),(375,bottom),(gx,bottom),(gx,615)],GROUND,2.8)
    for row in range(3):
        bus=keys[row*3][1]-33
        first=keys[row*3][3][0]
        wire([(first,bus),(gx,bus)],GROUND,2.5);dot(gx,bus,GROUND,3)
        for col in range(3):
            g=keys[row*3+col][3];wire([g,(g[0],bus)],GROUND,2.5);dot(g[0],bus,GROUND,3)
    # Encoder signals are separate wires; no physical pin ordering is assumed.
    for name,gpio,col in [('A','GP7',ENC_A),('B','GP8',ENC_B),('SW1','GP9',ENC_SW)]:
        src=positions[gpio]; end=enc[name]
        curve(src,(src[0]+35,205),(end[0]+75,235),end,col,2.7)
    for name in ['COM','SW2']:
        x,y=enc[name];wire([(x,y),(x,235),(375,235)],GROUND,2.6);dot(375,235,GROUND,3)
    if v==1:
        # OLED: module pin order is illustrative. 3V3 only, never 5 V to GPIO.
        for name,gpio,col in [('VCC','3V3',OLED_V),('SDA','GP28',OLED_SDA),('SCL','GP29',OLED_SCL),('GND','GND',GROUND)]:
            src=positions[gpio];end=oled[name]
            curve(src,(src[0]-70,src[1]+40),(end[0]+80,end[1]-75),end,col,2.7)

def draw_footer_notes(v):
    if v==2:
        rect(37,61,310,155,PAPER,BORDER)
        txt(50,193,'V2  /  NO DISPLAY OR RGB',10,BLUE,True)
        ptext(50,181,282,'<b>Ground:</b> each key’s second electrical contact and the encoder COM + SW2 share the black GND wire. No matrix diodes or extra power rail are needed.<br/><br/><b>Knob:</b> A → GP7, B → GP8, push SW1 → GP9; COM and SW2 → GND. Identify the actual 5 contacts by datasheet or continuity.',small)
    else:
        rect(37,59,310,158,WARN,WARN_BORDER)
        txt(50,194,'V1 RGB  /  NOT WIRED YET',10,colors.HexColor('#955000'),True)
        ptext(50,182,282,'<b>Stop:</b> LED strip, 5 V supply, current, isolation and firmware compatibility are not established. Do not connect LED power or GP10 yet. The separate guide shows the <b>proposed</b> 74AHCT1G125 + 330 Ω data path and required checks; it is not an approved power design.',small)
        # A deliberately disconnected strip, not implying an approved supply.
        for j in range(9):
            x=56+j*28;rect(x,79,22,18,colors.white,colors.HexColor('#DABF99'),2)
            C.setFillColor(colors.HexColor('#D9D2C5'));C.circle(x+11,88,4,fill=1,stroke=0)
        txt(56,66,'Illustrative RGB strip: disconnected',7,MUTED)
    rect(384,59,W-421,90,PAPER,BORDER)
    ptext(399,136,W-451,'<b>Key layout:</b> K0–K8 are shown left-to-right, top-to-bottom as viewed from above. The switch/encoder terminal positions are examples, <b>not a pinout</b>; verify them. Each key goes from its named GPIO to GND only when pressed. GP7/8/9 are encoder contacts, not key connections.',small)
    if v==1:
        rect(38,681,330,38,PAPER,BORDER)
        txt(47,704,'OLED: 3V3 / GND / GP28 SDA / GP29 SCL',8,BLUE,True)
        txt(47,690,'3.3 V pull-ups; actual module pin order varies.',7.5,MUTED)

def draw_page(v):
    heading(v)
    txt(673,720,'NINE MECHANICAL SWITCHES  /  TOP LAYOUT',10,BLUE,True)
    txt(673,704,'Drawn contacts are examples; use the two real electrical terminals.',8,MUTED)
    txt(ex,ey+117,'ENCODER  /  CONTACTS SHOWN SYMBOLICALLY',8.2,BLUE,True)
    if v==2: txt(73,638,'V2: no OLED, no external LEDs',10,BLUE,True)
    wires(v)
    draw_board()
    for i in range(9):draw_switch(i)
    draw_encoder()
    if v==1:draw_oled()
    draw_footer_notes(v)

for v in [2,1]:
    draw_page(v); C.showPage()
C.save();print(OUT)
