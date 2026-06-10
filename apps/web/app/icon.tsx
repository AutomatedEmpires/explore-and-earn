import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches --palette-ink and --palette-paper from styles/tokens.css (V2 Trail & Sky)
const INK = "#1A2B3C";
const PAPER = "#EEF3F8";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: INK,
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            color: PAPER,
            fontSize: 20,
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            lineHeight: 1,
            marginTop: 1,
          }}
        >
          E
        </div>
      </div>
    ),
    { ...size },
  );
}
