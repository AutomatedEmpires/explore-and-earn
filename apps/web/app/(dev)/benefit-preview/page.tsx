"use client";

import { useState } from "react";
import { BenefitTrustModal } from "../../../components/discovery/BenefitTrustModal";

export default function BenefitPreviewPage() {
  const [openModal, setOpenModal] = useState<"housing" | "meals" | null>(null);

  return (
    <div style={{ padding: 32, display: "flex", gap: 16, background: "#EEF3F8", minHeight: "100vh" }}>
      <button
        onClick={() => setOpenModal("housing")}
        style={{ padding: "12px 24px", background: "#1A8ECE", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 600 }}
      >
        Open Housing Modal
      </button>
      <button
        onClick={() => setOpenModal("meals")}
        style={{ padding: "12px 24px", background: "#1A8ECE", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 600 }}
      >
        Open Meals Modal
      </button>

      {openModal ? (
        <BenefitTrustModal
          mode="edit"
          open
          kind={openModal}
          onClose={() => setOpenModal(null)}
        />
      ) : null}
    </div>
  );
}
