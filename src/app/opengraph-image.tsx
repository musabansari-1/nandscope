import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const rows = [
    ["YOUR CODE", "7 + 9"],
    ["VM", "add"],
    ["ASSEMBLY", "M=D+M"],
    ["MACHINE", "1111000010001000"],
    ["HARDWARE", "NAND"],
  ];

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#111313", color: "#eeeae3", padding: "62px 70px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: "58%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 28, fontWeight: 700 }}>
          <div style={{ width: 42, height: 42, border: "2px solid #dca877", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#dca877", fontSize: 22 }}>N</div>
          <div style={{ display: "flex", alignItems: "center" }}><span>NAND</span><span style={{ fontWeight: 400 }}>scope</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#dca877", fontSize: 16, letterSpacing: 4, marginBottom: 20 }}>INTERACTIVE COMPUTER MICROSCOPE</div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 72, lineHeight: .98, letterSpacing: -4, fontWeight: 500 }}>
            <span>Write code.</span>
            <span>Zoom down to NAND.</span>
          </div>
          <div style={{ display: "flex", color: "#929795", fontSize: 23, lineHeight: 1.5, marginTop: 24 }}>Follow a real compiler and CPU simulation from source code to logic gates.</div>
        </div>
        <div style={{ display: "flex", gap: 12, color: "#929795", fontSize: 15 }}>
          <span>Compiler</span><span>·</span><span>Assembler</span><span>·</span><span>CPU</span><span>·</span><span>Gates</span><span>·</span><span>NAND</span>
        </div>
      </div>
      <div style={{ width: "42%", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <div style={{ width: 390, display: "flex", flexDirection: "column", gap: 10, padding: 26, border: "1px solid #363a38", borderRadius: 18, background: "#171919" }}>
          {rows.map(([label, value], index) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 20, border: `1px solid ${index === 0 || index === 4 ? "#6b513b" : "#303432"}`, background: index === 0 || index === 4 ? "#251f1a" : "#1a1d1c", borderRadius: 8, padding: "14px 16px" }}>
              <span style={{ width: 90, color: "#6f7672", fontSize: 11, letterSpacing: 2 }}>{label}</span>
              <span style={{ color: index === 0 || index === 4 ? "#dca877" : "#c4c8c2", fontFamily: "monospace", fontSize: value.length > 12 ? 15 : 19 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
