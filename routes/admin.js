const express = require("express");
const {
  getAllClients,
  getClientConfig
} = require("../services/client-config");
const {
  initializeStorage,
  getLeadSummary,
  listLeadsByClient,
  listEventsByClient
} = require("../services/storage");

const router = express.Router();

router.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  const [scheme, encoded] = auth.split(" ");

  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Authentication required");
  }

  const [username, password] = Buffer.from(encoded, "base64")
    .toString("utf8")
    .split(":");

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Invalid credentials");
  }

  return next();
});

router.get("/", (_req, res) => {
  initializeStorage();
  const brandName = process.env.SERVICE_BRAND_NAME || "LeadFlow Ops";
  const clients = getAllClients().map((client) => ({
    ...client,
    summary: getLeadSummary(client.slug)
  }));

  res.send(renderDashboard({ brandName, clients }));
});

router.get("/api/clients", (_req, res) => {
  initializeStorage();
  const clients = getAllClients().map((client) => ({
    ...client,
    summary: getLeadSummary(client.slug)
  }));

  res.json({
    ok: true,
    clients
  });
});

router.get("/api/clients/:clientSlug", (req, res) => {
  initializeStorage();
  const client = getClientConfig(req.params.clientSlug);

  if (!client) {
    return res.status(404).json({
      ok: false,
      error: "client_not_found"
    });
  }

  return res.json({
    ok: true,
    client: {
      slug: client.slug,
      name: client.name,
      status: client.status,
      defaultCountry: client.defaultCountry,
      summary: getLeadSummary(client.slug),
      recentLeads: listLeadsByClient(client.slug).slice(-20).reverse(),
      recentEvents: listEventsByClient(client.slug).slice(-20).reverse()
    }
  });
});

module.exports = router;

function renderDashboard({ brandName, clients }) {
  const cards = clients
    .map((client) => {
      return `
        <section class="card">
          <h2>${escapeHtml(client.name)}</h2>
          <p><strong>Slug:</strong> ${escapeHtml(client.slug)}</p>
          <p><strong>Status:</strong> ${escapeHtml(client.status || "active")}</p>
          <p><strong>Received:</strong> ${client.summary.received}</p>
          <p><strong>Sent:</strong> ${client.summary.message_sent}</p>
          <p><strong>No consent:</strong> ${client.summary.no_consent}</p>
          <p><strong>Invalid phone:</strong> ${client.summary.invalid_phone}</p>
          <p><strong>Failed:</strong> ${client.summary.message_failed}</p>
          <p><a href="/admin/api/clients/${encodeURIComponent(client.slug)}">View JSON</a></p>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(brandName)} Admin</title>
        <style>
          body { font-family: Georgia, serif; background: linear-gradient(135deg, #f7f1e3, #fffdf8); color: #241c15; margin: 0; }
          header { padding: 32px 24px 12px; }
          h1 { margin: 0; font-size: 2rem; }
          p { line-height: 1.5; }
          main { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; padding: 24px; }
          .card { background: #ffffff; border: 1px solid #e3d6c4; border-radius: 18px; padding: 18px; box-shadow: 0 10px 30px rgba(36, 28, 21, 0.07); }
          a { color: #914c22; text-decoration: none; }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(brandName)} Admin</h1>
          <p>Hosted lead-to-WhatsApp operations dashboard for all client accounts.</p>
        </header>
        <main>${cards || "<p>No clients configured.</p>"}</main>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
