import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches --palette-ink and --palette-paper from styles/tokens.css
const INK = "#24221E";
const PAPER = "#F6F3EC";

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
