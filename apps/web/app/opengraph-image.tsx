import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Matches --palette-* values from styles/tokens.css
const PAPER = "#F6F3EC";
const INK = "#24221E";
const INK_SOFT = "#6E685D";
const INK_MUTED = "#9A9486";
const LINE = "#E7E1D3";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: PAPER,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "80px 96px",
          fontFamily: "Georgia, 'Times New Roman', serif",
          borderTop: `12px solid ${INK}`,
        }}
      >
        {/* Triad badges */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {["Housing", "Meals", "Pay"].map((label) => (
            <div
              key={label}
              style={{
                background: INK,
                color: PAPER,
                fontSize: 18,
                fontFamily: "system-ui, sans-serif",
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "8px 20px",
                borderRadius: 4,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: INK,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 24,
          }}
        >
          Explore & Earn
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: INK_SOFT,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 400,
            lineHeight: 1.4,
            marginBottom: 48,
          }}
        >
          Lifestyle work with housing, meals, and pay included.
        </div>

        {/* Divider + URL */}
        <div
          style={{
            width: "100%",
            height: 1,
            background: LINE,
            marginBottom: 32,
          }}
        />
        <div
          style={{
            fontSize: 22,
            color: INK_MUTED,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          exploreandearn.com
        </div>
      </div>
    ),
    { ...size },
  );
}
