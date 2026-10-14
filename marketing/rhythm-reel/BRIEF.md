---
workflow: general-video
flow: automation
storyboard: no
message: "Make your “Rhythm of the day” Mean something"
destination: instagram-reel
aspect: "9:16"
length: 13.6s
---

## Intent
Blaine's classroom clip (improvement.mov): the class claps the rhythm of the day
with Clap and grade, scores 68%, tries again, scores 97%. Headline over it; fix the
lighting and quality of the phone-on-TV footage.

## Notes
- Footage prep (../rhythm-reel-src): perspective-straightened, cropped to the app,
  denoised (hqdn3d) and sharpened in ffmpeg; audio loudnorm to -16 LUFS.
- Color: data-color-grading per-channel curves on .footage (white card back to white,
  blue cast removed). The source fades to black at 11.2s, so the 97% frame is held.
