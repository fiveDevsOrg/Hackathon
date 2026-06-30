const crypto = require("node:crypto");

function canonicalKey(type, name) {
  return `${slug(type || "Object")}:${slug(name || "unknown")}`;
}

function canonicalId(type, name) {
  const key = canonicalKey(type, name);
  const readable = key.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `obj_${readable}_${hash}`;
}

function withCanonicalIdentity(entity) {
  const type = entity.type || "Unknown";
  const name = entity.name || "";
  return {
    ...entity,
    id: entity.id || canonicalId(type, name),
    canonical_key: entity.canonical_key || canonicalKey(type, name),
  };
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9./_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = {
  canonicalId,
  canonicalKey,
  withCanonicalIdentity,
};
