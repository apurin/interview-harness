from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FRAME_DIR = Path(__file__).resolve().parent / "frames"
GITHUB_MARK_PATH = Path(__file__).resolve().parent / "assets" / "GitHub_Invertocat_White.png"
OUTPUT = ROOT / "assets" / "interview-harness-demo.gif"

FRAME_FILES = [
    "01-layout-decision.png",
    "02-technology-decision.png",
    "03-release-board.png",
    "04-customer-flow.png",
]

CAPTIONS = [
    (
        "REACT TO SOMETHING CONCRETE",
        "See the possibilities before deciding",
        "Visual alternatives make intent faster and easier to express.",
    ),
    (
        "COMPARE ON SHARED CRITERIA",
        "Make complex decisions scannable",
        "Comment on any option or criterion wherever nuance matters.",
    ),
    (
        "SHAPE SCOPE VISUALLY",
        "Organize the plan in one pass",
        "Sort, defer, or leave decisions open without writing a brief.",
    ),
    (
        "CORRECT THE AGENT’S MODEL",
        "Reshape the flow directly",
        "Show what should change instead of explaining it all in prose.",
    ),
]

# Captures use a 1800x1000 viewport. This removes the harness header and side
# margins while retaining the question, interaction, and relevant footer area.
CROP = (160, 120, 1640, 920)
OUTPUT_SIZE = (1280, 692)
TRANSITION_STEPS = 3
TRANSITION_MS = 70
PRESENTATION_DURATIONS = [100, 100, 110, 1390, 1390, 1390, 1390]
CAPTION_ALPHAS = [0, 0.45, 0.8, 1, 1, 1, 1]
CAPTION_SLIDES = [20, 12, 5, 0, 0, 0, 0]
PRESERVED_COLORS = [
    (235, 185, 90),
    (215, 183, 126),
    (104, 210, 170),
    (163, 212, 123),
    (235, 240, 242),
    (20, 27, 32),
]


def load_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/SFNSRounded.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


KICKER_FONT = load_font(15, bold=True)
TITLE_FONT = load_font(29, bold=True)
BODY_FONT = load_font(17)
LINK_FONT = load_font(14, bold=True)
GITHUB_MARK = Image.open(GITHUB_MARK_PATH).convert("RGBA").resize((18, 18), Image.Resampling.LANCZOS)


def load_frames():
    frames = []
    for name in FRAME_FILES:
        path = FRAME_DIR / name
        image = Image.open(path).convert("RGB")
        if image.size != (1800, 1000):
            raise ValueError(f"{path} is {image.size}; expected 1800x1000")
        frames.append(image.crop(CROP).resize(OUTPUT_SIZE, Image.Resampling.LANCZOS))
    return frames


def add_caption(image, caption, alpha, slide):
    if alpha <= 0:
        return image

    kicker, title, body = caption
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    left = 48
    top = 513 + round(slide)
    right = 713
    bottom = 652 + round(slide)
    opacity = round(alpha * 255)

    draw.rounded_rectangle(
        (left, top, right, bottom),
        radius=16,
        fill=(20, 27, 32, round(opacity * 0.9)),
        outline=(255, 255, 255, round(opacity * 0.12)),
        width=1,
    )
    draw.rounded_rectangle(
        (left + 18, top + 22, left + 22, bottom - 22),
        radius=2,
        fill=(104, 210, 170, opacity),
    )
    text_left = left + 40
    draw.text((text_left, top + 19), kicker, font=KICKER_FONT, fill=(123, 225, 187, opacity))
    draw.text((text_left, top + 42), title, font=TITLE_FONT, fill=(255, 255, 255, opacity))
    draw.text((text_left, top + 88), body, font=BODY_FONT, fill=(221, 227, 231, opacity))
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def add_repo_link(image):
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    label = "github.com/apurin/interview-harness"
    icon_size = GITHUB_MARK.width
    gap = 9
    horizontal_padding = 13
    top, right, bottom = 24, 1232, 62
    text_box = draw.textbbox((0, 0), label, font=LINK_FONT)
    text_width = text_box[2] - text_box[0]
    text_height = text_box[3] - text_box[1]
    left = right - horizontal_padding * 2 - icon_size - gap - text_width
    draw.rounded_rectangle(
        (left, top, right, bottom),
        radius=19,
        fill=(20, 27, 32, 218),
        outline=(255, 255, 255, 30),
        width=1,
    )
    icon_x = left + horizontal_padding
    icon_y = top + (bottom - top - icon_size) // 2
    overlay.alpha_composite(GITHUB_MARK, (icon_x, icon_y))
    text_x = icon_x + icon_size + gap
    text_y = top + (bottom - top - text_height) // 2 - text_box[1]
    draw.text(
        (text_x, text_y),
        label,
        font=LINK_FONT,
        fill=(235, 240, 242, 255),
    )
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def presentation_frames(image, caption):
    return [
        add_repo_link(add_caption(image.copy(), caption, alpha, slide))
        for alpha, slide in zip(CAPTION_ALPHAS, CAPTION_SLIDES)
    ]


def build_animation(main_frames):
    frames = []
    durations = []
    for index, current in enumerate(main_frames):
        presented = presentation_frames(current, CAPTIONS[index])
        frames.extend(presented)
        durations.extend(PRESENTATION_DURATIONS)

        following_index = (index + 1) % len(main_frames)
        following = presentation_frames(main_frames[following_index], CAPTIONS[following_index])[0]
        for step in range(1, TRANSITION_STEPS + 1):
            frames.append(Image.blend(presented[-1], following, step / (TRANSITION_STEPS + 1)))
            durations.append(TRANSITION_MS)

    captioned_main_frames = [presentation_frames(frame, CAPTIONS[index])[-1] for index, frame in enumerate(main_frames)]
    swatch_height = 64
    palette_source = Image.new(
        "RGB",
        (OUTPUT_SIZE[0], OUTPUT_SIZE[1] * len(captioned_main_frames) + swatch_height),
    )
    for index, frame in enumerate(captioned_main_frames):
        palette_source.paste(frame, (0, OUTPUT_SIZE[1] * index))

    draw = ImageDraw.Draw(palette_source)
    swatch_top = OUTPUT_SIZE[1] * len(captioned_main_frames)
    swatch_width = OUTPUT_SIZE[0] / len(PRESERVED_COLORS)
    for index, color in enumerate(PRESERVED_COLORS):
        left = round(index * swatch_width)
        right = round((index + 1) * swatch_width)
        draw.rectangle((left, swatch_top, right, swatch_top + swatch_height), fill=color)

    palette = palette_source.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    gif_frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


if __name__ == "__main__":
    source_frames = load_frames()
    build_animation(source_frames)
    print(f"Wrote {OUTPUT} from {len(source_frames)} real browser captures")
