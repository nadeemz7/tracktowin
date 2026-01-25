import InviteAcceptClient from "./InviteAcceptClient";

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  const token = params?.token || "";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(135deg, #f8fafc, #eef2f7)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#ffffff",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 20px 50px rgba(15, 23, 42, 0.15)",
          display: "grid",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>Accept your invite</h1>
          <p style={{ margin: "6px 0 0", color: "#475569" }}>
            Set a password to activate your account.
          </p>
        </div>
        <InviteAcceptClient token={token} />
      </div>
    </div>
  );
}
