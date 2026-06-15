const NODE_SHEBANG = "#!/usr/bin/env node";

export function normalizeNodeShebang(source) {
  const withoutLeadingShebangs = source.replace(/^(#!\/usr\/bin\/env node\r?\n)+/, "");
  return `${NODE_SHEBANG}\n${withoutLeadingShebangs.replace(/^\s*\r?\n/, "")}`;
}
