"""Builds public/help/how-to-use-xryon.mp4 (+ .vtt captions + poster).
Run:  python3 tools/make-tutorial-video.py     (needs Pillow + ffmpeg)
Edit SCENES below to change the walkthrough; captions are regenerated from the same list."""
import os, subprocess, shutil, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 960, 540, 15
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "help")
TMP = "/tmp/xryon_frames"
FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-%s.ttf"
def font(size, w="Regular"):
    try: return ImageFont.truetype(FONT % w, size)
    except Exception: return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)

BG, PANEL, LINE, TXT, DIM, ACC = (8,8,10), (21,21,24), (45,45,50), (240,240,242), (140,140,150), (80,140,255)

# (title, subtitle, [(caption cue text, seconds)], scene kind)
SCENES = [
 ("Welcome to Xryon", "Your AI assistant for chat, images, code and voice", ["Welcome to Xryon — your AI assistant for chat, images, code and voice.", "Here's a quick tour of everything you can do."], "welcome"),
 ("Ask anything", "Type in the message box and press Enter", ["Type any question into the message box and press Enter.", "Xryon answers in seconds — ask follow-ups to keep going."], "chat"),
 ("Slash commands", "Type / to see shortcuts", ["Type a slash at the start of your message to see shortcut commands.", "Try /new for a fresh chat, or /research for deeper answers."], "slash"),
 ("Make images", "Describe it, Xryon draws it", ["To create a picture, just describe what you want to see.", "Open the Images page any time to find everything you've made."], "image"),
 ("Web search & cards", "Turn them on from the + menu", ["Tap the plus button to turn on web search for live, up-to-date answers.", "Rich cards show lists and reports in a clean, easy-to-read layout."], "plus"),
 ("Build with Codex", "Describe an app, get working code", ["Open Codex to build websites, apps and scripts by describing them.", "Preview your project, fix errors and host it when you're ready."], "code"),
 ("Talk to Xryon", "Use voice for hands-free chat", ["Tap the voice button to talk to Xryon out loud.", "It listens, thinks and answers — hands-free."], "voice"),
 ("Make it yours", "White theme and account switching", ["In Settings, switch to the white theme with one tap.", "You can also link a trusted account and switch between the two instantly."], "settings"),
 ("Need help?", "Help & Support is always one tap away", ["Open Help and Support any time to read guides or contact the team.", "Thanks for using Xryon — enjoy!"], "end"),
]
SEC_PER_CUE = 2.6

def rr(d, box, r, fill=None, outline=None, width=1): d.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)
def ease(t): t = max(0, min(1, t)); return t*t*(3-2*t)
def text_c(d, xy, s, f, fill): w = d.textlength(s, font=f); d.text((xy[0]-w/2, xy[1]), s, font=f, fill=fill)

def composer(d, y, content, caret=True, t=0):
    rr(d, (150, y, W-150, y+58), 29, fill=(38,38,42), outline=LINE)
    d.text((176, y+16), content, font=font(18), fill=TXT if content else DIM)
    if caret and int(t*2) % 2 == 0: 
        cx = 176 + d.textlength(content, font=font(18)); d.line((cx+2, y+15, cx+2, y+43), fill=TXT, width=2)
    d.ellipse((W-208, y+11, W-162, y+47), fill=(240,240,242)); d.polygon([(W-185,y+20),(W-174,y+31),(W-196,y+31)], fill=(10,10,12))

def bubble(d, x, y, w, h, s, mine=False):
    rr(d, (x, y, x+w, y+h), 18, fill=(48,48,54) if mine else None)
    d.text((x+16, y+10), s, font=font(17), fill=TXT)

def typed(s, t, start, cps=22): n = int(max(0, (t-start))*cps); return s[:n]

def draw_scene(kind, t, d, img):
    if kind == "welcome":
        # glowing logo orb
        for i in range(8, 0, -1):
            r = 70 + i*9 + 4*math.sin(t*2); d.ellipse((W/2-r, 250-r, W/2+r, 250+r), outline=(60+i*8, 90+i*10, 255, ), width=1)
        d.ellipse((W/2-62, 188, W/2+62, 312), fill=(18,18,22), outline=(110,150,255), width=3)
        text_c(d, (W/2, 222), "X", font(64, "SemiBold"), TXT)
    elif kind == "chat":
        bubble(d, 520, 120, 330, 44, "Explain black holes simply", True)
        reply = typed("A black hole is a place where gravity is so strong that nothing, not even light, can escape it.", t, 1.2, 30)
        words, line, y = reply.split(" "), "", 190
        for wd in words:
            if d.textlength(line+" "+wd, font=font(17)) > 640: d.text((150, y), line, font=font(17), fill=TXT); y += 28; line = wd
            else: line = (line+" "+wd).strip()
        d.text((150, y), line, font=font(17), fill=TXT)
        composer(d, 430, typed("Ask anything…", t, 99) if t < 0.5 else "", t=t)
    elif kind == "slash":
        composer(d, 430, "/", t=t)
        a = ease((t-.5)/.4)
        rr(d, (150, 250 - 0*a, 520, 412), 16, fill=PANEL, outline=LINE)
        for i,(c,dsc) in enumerate([("/new","Start a new chat"),("/research","Think more carefully"),("/image","Make a picture"),("/status","Check your usage")]):
            y = 262+i*37; hl = int(t*1.5) % 4 == i
            if hl: rr(d, (158, y-3, 512, y+30), 10, fill=(40,40,46))
            d.text((172, y+3), c, font=font(16, "Medium"), fill=TXT); d.text((290, y+4), dsc, font=font(14), fill=DIM)
    elif kind == "image":
        bubble(d, 420, 100, 430, 44, "Draw a neon fox in a city at night", True)
        p = ease((t-1.2)/2.2)
        rr(d, (150, 170, 530, 410), 18, fill=PANEL, outline=LINE)
        if p < 1:
            d.text((260, 275), "Creating image…", font=font(16), fill=DIM)
            d.rounded_rectangle((200, 320, 200+280*p, 328), 4, fill=ACC)
        else:
            for i in range(40): d.line((150, 170+i*6, 530, 170+i*6), fill=(25+i*2, 10+i, 60+i*3))
            d.polygon([(340,230),(390,330),(290,330)], fill=(255,140,60)); d.polygon([(340,230),(318,270),(362,270)], fill=(255,200,120))
            for bx in range(160, 520, 38): d.rectangle((bx, 360-((bx*7)%60), bx+28, 410), fill=(20,20,44))
        composer(d, 430, "", t=t)
    elif kind == "plus":
        composer(d, 430, "", t=t)
        d.ellipse((160, 441, 198, 479), fill=(60,60,66)); d.line((179,452,179,468), fill=TXT, width=3); d.line((171,460,187,460), fill=TXT, width=3)
        a = ease((t-.6)/.4)
        if a > 0:
            rr(d, (150, 262, 430, 420), 16, fill=PANEL, outline=LINE)
            for i,(lab) in enumerate(["Web search","Rich text cards","Add files"]):
                y = 280+i*46; d.text((176, y), lab, font=font(16), fill=TXT)
                on = i < 2 and t > 1.6+i*.5
                rr(d, (370, y, 414, y+24), 12, fill=(80,140,255) if on else (60,60,66))
                kx = 392 if on else 372; d.ellipse((kx, y+2, kx+20, y+22), fill=(255,255,255))
    elif kind == "code":
        rr(d, (120, 90, W-120, 470), 16, fill=PANEL, outline=LINE)
        d.text((144, 104), "Codex", font=font(15, "Medium"), fill=DIM)
        code = ['<!doctype html>', '<h1>My Portfolio</h1>', '<p>Hi, I build things.</p>', '<button>Contact me</button>']
        shown = int((t-.5)*1.4)
        for i,l in enumerate(code[:max(0,shown)+1]): d.text((144, 150+i*30), l, font=font(16), fill=(140,200,255) if i%2==0 else (200,200,210))
        rr(d, (W/2+20, 140, W-144, 440), 12, fill=(250,250,252))
        if shown >= 1: d.text((W/2+44, 170), "My Portfolio", font=font(24, "SemiBold"), fill=(20,20,24))
        if shown >= 2: d.text((W/2+44, 215), "Hi, I build things.", font=font(15), fill=(80,80,90))
        if shown >= 3: rr(d, (W/2+44, 255, W/2+170, 291), 18, fill=(20,20,24)); d.text((W/2+62, 262), "Contact me", font=font(14), fill=(255,255,255))
    elif kind == "voice":
        for i in range(4):
            r = 64 + i*22 + (t*40+i*20) % 22
            d.ellipse((W/2-r, 250-r, W/2+r, 250+r), outline=(60,120,255, ), width=1)
        d.ellipse((W/2-56, 194, W/2+56, 306), fill=(18,18,24), outline=(110,170,255), width=3)
        for i in range(7):
            hgt = 12 + 26*abs(math.sin(t*5+i)); d.rounded_rectangle((W/2-42+i*13, 250-hgt/2, W/2-34+i*13, 250+hgt/2), 3, fill=TXT)
        text_c(d, (W/2, 360), "Listening…" if int(t) % 2 == 0 else "Speaking…", font(16), DIM)
    elif kind == "settings":
        rr(d, (200, 110, W-200, 430), 18, fill=PANEL, outline=LINE)
        d.text((230, 130), "Settings", font=font(18, "SemiBold"), fill=TXT)
        rr(d, (226, 180, W-226, 250), 14, fill=(30,30,34), outline=LINE)
        d.text((250, 192), "White theme", font=font(17, "Medium"), fill=TXT); d.text((250, 222), "Switch between dark and white", font=font(13), fill=DIM)
        on = t > 1.4; rr(d, (W-300, 202, W-248, 230), 14, fill=(80,140,255) if on else (60,60,66)); kx = W-274 if on else W-298; d.ellipse((kx, 204, kx+24, 228), fill=(255,255,255))
        rr(d, (226, 268, W-226, 338), 14, fill=(30,30,34), outline=LINE)
        d.ellipse((248, 282, 292, 326), fill=(139,92,246)); d.text((262, 292), "D", font=font(20, "SemiBold"), fill=(255,255,255))
        d.text((306, 285), "Switch Account", font=font(17, "Medium"), fill=TXT); d.text((306, 314), "Jump to your trusted account", font=font(13), fill=DIM)
        rr(d, (W-336, 290, W-248, 322), 10, fill=(240,240,242)); d.text((W-318, 295), "Switch", font=font(14, "SemiBold"), fill=(10,10,12))
    elif kind == "end":
        d.ellipse((W/2-44, 205, W/2+44, 293), outline=(110,150,255), width=3)
        text_c(d, (W/2, 226), "?", font(44, "SemiBold"), TXT)
        text_c(d, (W/2, 330), "Settings  ›  Help & Support", font(16), DIM)

def frame(si, t):
    title, sub, cues, kind = SCENES[si]
    img = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((-160, -200, 520, 260), fill=(60,90,200,22)); d.ellipse((560, 330, 1160, 760), fill=(120,60,200,18))
    draw_scene(kind, t, d, img)
    dur = len(cues)*SEC_PER_CUE
    a = ease(t/.5) * ease((dur-t)/.4)
    off = int((1-ease(t/.5))*14)
    d.text((48, 36-off), f"{si+1}/{len(SCENES)}", font=font(13, "Medium"), fill=(110,110,120))
    d.text((48, 56-off), title, font=font(30, "SemiBold"), fill=tuple(int(c*max(.0,min(1,a*1.4))) for c in TXT))
    d.text((48, 98-off), sub, font=font(16), fill=tuple(int(c*max(.0,min(1,a*1.4))) for c in DIM))
    # progress bar
    return img

def ts(sec): h=int(sec//3600); m=int(sec%3600//60); s=sec%60; return f"{h:02d}:{m:02d}:{s:06.3f}"

def main():
    shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP); os.makedirs(OUT, exist_ok=True)
    n, vtt, clock = 0, ["WEBVTT", ""], 0.0
    for si, (title, sub, cues, kind) in enumerate(SCENES):
        dur = len(cues)*SEC_PER_CUE
        for k, c in enumerate(cues):
            vtt += [f"{ts(clock+k*SEC_PER_CUE)} --> {ts(clock+(k+1)*SEC_PER_CUE-0.05)}", c, ""]
        for f in range(int(dur*FPS)):
            frame(si, f/FPS).save(f"{TMP}/f{n:05d}.jpg", quality=92); n += 1
        clock += dur
    open(os.path.join(OUT, "how-to-use-xryon.vtt"), "w").write("\n".join(vtt))
    frame(0, 1.2).save(os.path.join(OUT, "how-to-use-xryon-poster.jpg"), quality=88)
    subprocess.run(["ffmpeg","-y","-loglevel","error","-framerate",str(FPS),"-i",f"{TMP}/f%05d.jpg","-c:v","libx264","-pix_fmt","yuv420p","-crf","27","-preset","medium","-movflags","+faststart", os.path.join(OUT,"how-to-use-xryon.mp4")], check=True)
    print("frames:", n, "seconds:", round(clock,1))
main()
