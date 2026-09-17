"use strict";

const { corsHeaders, healthPayload } = require("../tools/activation-server/logic");

module.exports = async (req, res) => {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  res.status(200).json(healthPayload());
};
