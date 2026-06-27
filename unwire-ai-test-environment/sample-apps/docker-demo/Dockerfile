# Sample Docker application for deployment testing
FROM node:20-alpine
WORKDIR /app

RUN echo '{"name":"docker-demo","version":"1.0.0","dependencies":{"express":"^4.18.2"}}' > package.json \
    && npm install --production

RUN cat > server.js << 'EOF'
const express = require("express");
const app = express();
app.get("/", (_, res) => res.json({ service: "docker-demo", status: "running", timestamp: new Date().toISOString() }));
app.get("/health", (_, res) => res.json({ status: "ok" }));
app.listen(3000, () => console.log("Docker demo running on :3000"));
EOF

EXPOSE 3000
HEALTHCHECK --interval=10s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
