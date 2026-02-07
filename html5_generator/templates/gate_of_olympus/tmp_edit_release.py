from pathlib import Path
import re

path = Path("release/index.html")
text = path.read_text()

text = re.sub(r"reelFrame:\s*'[^']+',\s*", "", text)
text = text.replace("const reelFrameImg = document.getElementById('reelFrame');", "")
text = re.sub(r",\s*reelFrameImg", "", text)
text = re.sub(r"reelFrame:\s*reelFrameImg,\s*", "", text)

text = re.sub(
    r"#reels \{[^}]*\}",
    "#reels { position: absolute; top: 520px; left: 140px; width: 800px; height: 840px; border-radius: 18px; background: radial-gradient(ellipse at center, #3b0d4b 0%, #1d072a 100%); box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.5), 0 0 0 8px #fbd76a, 0 0 0 14px #8c5b14, 0 0 30px rgba(0, 0, 0, 0.6), 0 0 36px rgba(251, 215, 106, 0.35); z-index: 4; }",
    text,
)

text = re.sub(r"\.reel-frame \{[^}]*\}\s*", "", text)
text = re.sub(r",\s*,", ",", text)

path.write_text(text)

