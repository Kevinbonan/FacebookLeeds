require("dotenv").config();

const express = require("express");
const morgan = require("morgan");
const webhookRoutes = require("./routes/webhooks");
const adminRoutes = require("./routes/admin");
const { getAllClients } = require("./services/client-config");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(morgan("combined"));
app.use("/webhooks", webhookRoutes);
app.use("/admin", adminRoutes);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "facebook-leads-to-whatsapp-group-invite",
    brand: process.env.SERVICE_BRAND_NAME || "LeadFlow Ops",
    configuredClients: getAllClients().length,
    timestamp: new Date().toISOString()
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled application error:", err);
  res.status(500).json({
    ok: false,
    error: "internal_server_error"
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
